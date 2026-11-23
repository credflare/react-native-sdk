import React, { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { Platform, StyleSheet } from "react-native";
import {
  Camera,
  CommonResolutions,
  VisionCamera,
  getCameraDevice,
  usePhotoOutput,
  useVideoOutput,
} from "react-native-vision-camera";
import type { CameraOutput, Recorder } from "react-native-vision-camera";
import type { FaceProviderName, FaceSample } from "@credflare/sdk-javascript";
import { normalizeMlKitFaces } from "./mlkit";
import { VisionSignalNormalizer } from "./vision";
import type { VisionFaceDetectorFactory } from "./specs/face-vision.nitro";

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
  isAvailable?: () => Promise<boolean>;
}

const fileUri = (path: string) => (path.startsWith("file://") ? path : `file://${path}`);

type FaceOutputFactory = (onSample: (sample: FaceSample) => void, onError: (error: Error) => void) => CameraOutput;

const mlKitOutput: FaceOutputFactory = (onSample, onError) => {
  const { createFaceDetectorOutput } = require("react-native-vision-camera-face-detector") as typeof import("react-native-vision-camera-face-detector");
  return createFaceDetectorOutput({
    performanceMode: "fast",
    runClassifications: true,
    cameraFacing: "front",
    autoMode: false,
    onFacesDetected: detected => onSample(normalizeMlKitFaces(detected, Date.now())),
    onError,
  });
};

let visionFactory: VisionFaceDetectorFactory | undefined;

const visionOutput: FaceOutputFactory = (onSample, onError) => {
  if (!visionFactory) {
    const { NitroModules } = require("react-native-nitro-modules") as typeof import("react-native-nitro-modules");
    visionFactory = NitroModules.createHybridObject<VisionFaceDetectorFactory>("VisionFaceDetectorFactory");
  }
  const normalizer = new VisionSignalNormalizer();
  return visionFactory.createOutput({
    onReading: reading => onSample(normalizer.sample(reading, Date.now())),
    onError,
  });
};

function faceCamera(createOutput: FaceOutputFactory) {
  return function FaceCamera(props: LivenessCameraProps) {
    return <NativeCamera {...props} createOutput={createOutput} />;
  };
}

function NativeCamera({ active, recordVideo, handle, onSample, onError, createOutput }: LivenessCameraProps & { createOutput: FaceOutputFactory }) {
  const sample = useRef(onSample), failure = useRef(onError);
  sample.current = onSample;
  failure.current = onError;
  const photo = usePhotoOutput({ targetResolution: CommonResolutions.HD_4_3, containerFormat: "jpeg", quality: 0.9 });
  const video = useVideoOutput({ targetResolution: CommonResolutions.VGA_4_3, enableAudio: false, fileType: "mp4" });
  const faces = useMemo(
    () => createOutput(next => sample.current(next), error => failure.current(error)),
    [createOutput],
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

const requestPermission = async () => VisionCamera.cameraPermissionStatus === "authorized" || VisionCamera.requestCameraPermission();
const isAvailable = async () => getCameraDevice(await VisionCamera.createDeviceFactory(), "front") != null;

export const visionFaceProvider: NativeFaceProvider = {
  name: "vision",
  Camera: faceCamera(visionOutput),
  requestPermission,
  isAvailable,
};

const androidMlKitFaceProvider: NativeFaceProvider = {
  name: "mlkit",
  Camera: faceCamera(mlKitOutput),
  requestPermission,
  isAvailable,
};

export const nativeFaceProvider: NativeFaceProvider = Platform.OS === "ios" ? visionFaceProvider : androidMlKitFaceProvider;

/** @deprecated Use `nativeFaceProvider`. On iOS this is the Apple Vision provider. */
export const mlKitFaceProvider: NativeFaceProvider = nativeFaceProvider;
