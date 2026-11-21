import type { FaceSample } from "@credflare/sdk-javascript";

export interface MlKitFaceLike {
  bounds: { x: number; y: number; width: number; height: number };
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  smilingProbability?: number;
  yawAngle: number;
  pitchAngle: number;
  frameWidth: number;
  frameHeight: number;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

export function normalizeMlKitFaces(faces: readonly MlKitFaceLike[], t: number): FaceSample {
  const face = faces[0];
  if (!face || !face.frameWidth || !face.frameHeight)
    return { t, faces: 0, box: null, eye_open: null, smile: null, yaw: null, pitch: null };
  const x = clamp(face.bounds.x / face.frameWidth), y = clamp(face.bounds.y / face.frameHeight);
  const right = clamp((face.bounds.x + face.bounds.width) / face.frameWidth);
  const bottom = clamp((face.bounds.y + face.bounds.height) / face.frameHeight);
  const left = face.leftEyeOpenProbability, rightEye = face.rightEyeOpenProbability;
  return {
    t,
    faces: faces.length,
    box: { x, y, w: right - x, h: bottom - y },
    eye_open: left === undefined || rightEye === undefined ? null : (left + rightEye) / 2,
    smile: face.smilingProbability ?? null,
    yaw: face.yawAngle,
    pitch: face.pitchAngle,
  };
}
