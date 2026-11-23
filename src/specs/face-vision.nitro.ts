import type { HybridObject } from "react-native-nitro-modules";
import type { CameraOutput } from "react-native-vision-camera";

export interface VisionFaceReading {
  faces: number;
  x: number;
  y: number;
  width: number;
  height: number;
  yaw?: number;
  pitch?: number;
  eyeRatio?: number;
  mouthRatio?: number;
}

export interface VisionFaceOutputOptions {
  onReading: (reading: VisionFaceReading) => void;
  onError: (error: Error) => void;
}

export interface VisionFaceDetectorFactory extends HybridObject<{ ios: "swift" }> {
  createOutput(options: VisionFaceOutputOptions): CameraOutput;
}
