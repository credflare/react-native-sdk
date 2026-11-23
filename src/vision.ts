import type { FaceSample } from "@credflare/sdk-javascript";
import type { VisionFaceReading } from "./specs/face-vision.nitro";

export type { VisionFaceReading };

const clamp = (value: number) => Math.min(1, Math.max(0, value));

function median(values: number[]): number | null {
  if (values.length < VisionSignalNormalizer.baselineFrames) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export class VisionSignalNormalizer {
  static readonly fallbackEyeRatio = 0.27;
  static readonly fallbackMouthRatio = 0.95;
  static readonly baselineFrames = 8;
  static readonly closedEyeFraction = 0.35;
  static readonly fullSmileWidening = 0.18;

  private eyeRatios: number[] = [];
  private mouthRatios: number[] = [];

  get eyeBaseline(): number {
    return median(this.eyeRatios) ?? VisionSignalNormalizer.fallbackEyeRatio;
  }

  get mouthBaseline(): number {
    return median(this.mouthRatios) ?? VisionSignalNormalizer.fallbackMouthRatio;
  }

  eyeOpen(ratio: number): number {
    if (this.eyeRatios.length < VisionSignalNormalizer.baselineFrames) this.eyeRatios.push(ratio);
    const relative = ratio / this.eyeBaseline;
    return clamp((relative - VisionSignalNormalizer.closedEyeFraction) / (1 - VisionSignalNormalizer.closedEyeFraction));
  }

  smile(ratio: number): number {
    if (this.mouthRatios.length < VisionSignalNormalizer.baselineFrames) this.mouthRatios.push(ratio);
    return clamp((ratio / this.mouthBaseline - 1) / VisionSignalNormalizer.fullSmileWidening);
  }

  static contractYaw(radians: number): number {
    return (radians * 180) / Math.PI;
  }

  static contractPitch(radians: number): number {
    return (-radians * 180) / Math.PI;
  }

  static contractBox(x: number, y: number, width: number, height: number): NonNullable<FaceSample["box"]> {
    return { x, y: 1 - (y + height), w: width, h: height };
  }

  sample(reading: VisionFaceReading, t: number): FaceSample {
    if (reading.faces !== 1)
      return { t, faces: reading.faces, box: null, eye_open: null, smile: null, yaw: null, pitch: null };
    return {
      t,
      faces: 1,
      box: VisionSignalNormalizer.contractBox(reading.x, reading.y, reading.width, reading.height),
      eye_open: reading.eyeRatio === undefined ? null : this.eyeOpen(reading.eyeRatio),
      smile: reading.mouthRatio === undefined ? null : this.smile(reading.mouthRatio),
      yaw: reading.yaw === undefined ? null : VisionSignalNormalizer.contractYaw(reading.yaw),
      pitch: reading.pitch === undefined ? null : VisionSignalNormalizer.contractPitch(reading.pitch),
    };
  }
}
