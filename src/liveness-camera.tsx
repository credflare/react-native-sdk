import React, { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import {
  Camera,
  CommonResolutions,
  VisionCamera,
  usePhotoOutput,
  useVideoOutput,
} from "react-native-vision-camera";
import type { Recorder } from "react-native-vision-camera";
import { createFaceDetectorOutput } from "react-native-vision-camera-face-detector";
import type { FaceProviderName, FaceSample } from "@credflare/sdk-javascript";
import { normalizeMlKitFaces } from "./mlkit";

export interface CapturedFile {
  uri: string;
  name: string;
  type: string;
}
export interface LivenessCameraHandle {
  takePhoto(name: string): Promise<CapturedFile>;
  startRecording(maxSeconds: number): Promise<void>;
  stopRecording(): Promise<CapturedFile | null>;
}
export interface LivenessCameraProps {
  active: boolean;
  recordVideo: boolean;
  handle: React.RefObject<LivenessCameraHandle | null>;
  onSample: (sample: FaceSample) => void;
  onError: (error: Error) => void;
}
export interface NativeFaceProvider {
  name: FaceProviderName;
  Camera: React.ComponentType<LivenessCameraProps>;
  requestPermission: () => Promise<boolean>;
}

const fileUri = (path: string) => (path.startsWith("file://") ? path : `file://${path}`);

function MlKitCamera({ active, recordVideo, handle, onSample, onError }: LivenessCameraProps) {
  const sample = useRef(onSample), failure = useRef(onError);
  sample.current = onSample;
  failure.current = onError;
  const photo = usePhotoOutput({ targetResolution: CommonResolutions.HD_4_3, containerFormat: "jpeg", quality: 0.9 });
  const video = useVideoOutput({ targetResolution: CommonResolutions.VGA_4_3, enableAudio: false, fileType: "mp4" });
  const faces = useMemo(
    () =>
      createFaceDetectorOutput({
        performanceMode: "fast",
        runClassifications: true,
        cameraFacing: "front",
        autoMode: false,
        onFacesDetected: detected => sample.current(normalizeMlKitFaces(detected, Date.now())),
        onError: error => failure.current(error),
      }),
    [],
  );
  const recorder = useRef<{ recorder: Recorder; done: Promise<string | null> } | null>(null);
  useImperativeHandle(handle, () => ({
    async takePhoto(name) {
      const file = await photo.capturePhotoToFile({ flashMode: "off", enableShutterSound: false }, {});
      return { uri: fileUri(file.filePath), name: `${name}.jpg`, type: "image/jpeg" };
    },
    async startRecording(maxSeconds) {
      if (recorder.current) return;
      const next = await video.createRecorder({ maxDuration: maxSeconds });
      let finish: (path: string | null) => void = () => undefined;
      const done = new Promise<string | null>(resolve => { finish = resolve; });
      next.startRecording(path => finish(path), () => finish(null));
      recorder.current = { recorder: next, done };
    },
    async stopRecording() {
      const current = recorder.current;
      if (!current) return null;
      recorder.current = null;
      if (current.recorder.isRecording) await current.recorder.stopRecording();
      const path = await current.done;
      return path ? { uri: fileUri(path), name: "liveness.mp4", type: "video/mp4" } : null;
    },
  }), [photo, video]);
  useEffect(() => () => {
    const current = recorder.current;
    recorder.current = null;
    if (current?.recorder.isRecording) void current.recorder.cancelRecording().catch(() => undefined);
  }, []);
  const outputs = useMemo(() => (recordVideo ? [faces, photo, video] : [faces, photo]), [faces, photo, video, recordVideo]);
  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device="front"
      isActive={active}
      mirrorMode="auto"
      outputs={outputs}
      onError={error => failure.current(error)}
    />
  );
}

export const mlKitFaceProvider: NativeFaceProvider = {
  name: "mlkit",
  Camera: MlKitCamera,
  requestPermission: async () => VisionCamera.cameraPermissionStatus === "authorized" || VisionCamera.requestCameraPermission(),
};
