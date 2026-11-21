import React, { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import {
  CredflareError,
  challengeRejected,
  createChallengeRun,
  facialSettings,
  livenessErrorMessage,
  sendLivenessEvidence,
  text,
  verifierName,
} from "@credflare/sdk-javascript";
import type {
  CopyKey,
  CredflareSession,
  FaceSample,
  GestureEvidence,
  LivenessChallenge,
  LivenessEvidence,
  SessionInfo,
} from "@credflare/sdk-javascript";
import type { CapturedFile, LivenessCameraHandle, NativeFaceProvider } from "./liveness-camera";
import { requestKey } from "./request-key";
import { Action, Copy, Link, Notice, Title, usePalette } from "./ui";
import { SpecIcon } from "./icon";
import { ui } from "./theme";

type Phase = "intro" | "starting" | "running" | "selfie" | "review" | "failed";

export interface LivenessProps {
  session: CredflareSession;
  info: SessionInfo;
  provider: NativeFaceProvider;
  onSubmitted: () => void;
  onBusyChanged?: (busy: boolean) => void;
}

export function CredflareLiveness({ session, info, provider, onSubmitted, onBusyChanged }: LivenessProps) {
  const p = usePalette();
  const settings = facialSettings(info.profile?.verification_requirements);
  const verifier = verifierName(info);
  const [phase, setPhase] = useState<Phase>("intro");
  const [hint, setHint] = useState<CopyKey>("liveness.position.no_face");
  const [progress, setProgress] = useState<string>("");
  const [tracked, setTracked] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [selfie, setSelfie] = useState<CapturedFile>();
  const camera = useRef<LivenessCameraHandle | null>(null);
  const mounted = useRef(true);
  const run = useRef<{
    challenge: LivenessChallenge;
    engine: ReturnType<typeof createChallengeRun>;
    origin: number | null;
    finished: boolean;
    gestures: GestureEvidence[];
    frames: Promise<void>[];
    recordingStarted: boolean;
    clip: CapturedFile | null;
  } | null>(null);
  const evidence = useRef<LivenessEvidence | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  function working(value: boolean) {
    setBusy(value);
    onBusyChanged?.(value);
  }
  function fail(message: string) {
    const current = run.current;
    if (current) current.finished = true;
    void camera.current?.stopRecording().catch(() => null);
    run.current = null;
    if (!mounted.current) return;
    setRecording(false);
    setError(message);
    setPhase("failed");
    working(false);
  }
  async function start() {
    working(true);
    setError(undefined);
    setPhase("starting");
    evidence.current = null;
    setSelfie(undefined);
    try {
      if (!(await provider.requestPermission())) return fail(text("errors.camera_denied"));
    } catch {
      return fail(text("errors.camera_unavailable"));
    }
    let challenge: LivenessChallenge;
    try {
      challenge = await session.createLivenessChallenge(requestKey());
    } catch (cause) {
      return fail(cause instanceof CredflareError && cause.status !== 0 ? livenessErrorMessage(cause) : text("errors.challenge_failed"));
    }
    if (!mounted.current) return;
    run.current = {
      challenge,
      engine: createChallengeRun({ gestures: challenge.gestures, provider: provider.name, expiresAt: Date.parse(challenge.expires_at) }),
      origin: null,
      finished: false,
      gestures: [],
      frames: [],
      recordingStarted: false,
      clip: null,
    };
    setHint("liveness.position.no_face");
    setProgress("");
    setPhase("running");
  }
  async function finish(outcome: "pass" | "timeout" | "expired") {
    const current = run.current;
    if (!current) return;
    current.finished = true;
    setRecording(false);
    const clip = await camera.current?.stopRecording().catch(() => null) ?? null;
    if (outcome !== "pass") return fail(text(outcome === "timeout" ? "liveness.timeout" : "liveness.expired"));
    if (current.challenge.record_video && !clip) return fail(text("errors.camera_unavailable"));
    try {
      await Promise.all(current.frames);
    } catch {
      return fail(text("errors.camera_no_photo"));
    }
    current.clip = clip;
    if (!mounted.current) return;
    setHint("liveness.success");
    setPhase("selfie");
    working(false);
  }
  function onSample(raw: FaceSample) {
    const current = run.current;
    if (!current || current.finished) return;
    current.origin ??= raw.t;
    const update = current.engine.push({ ...raw, t: raw.t - current.origin });
    if (update.stage === "gesture" && !current.recordingStarted && current.challenge.record_video) {
      current.recordingStarted = true;
      void camera.current?.startRecording(current.challenge.max_video_seconds)
        .then(() => { if (mounted.current && !current.finished) setRecording(true); })
        .catch(() => fail(text("errors.camera_unavailable")));
    }
    if (update.completed) {
      const done = update.completed;
      const pending: GestureEvidence = { gesture: done.gesture, completedAt: Date.now(), key: requestKey(), file: { uri: "", name: "", type: "" } };
      current.gestures.push(pending);
      current.frames.push(
        camera.current!.takePhoto(done.gesture).then(file => { pending.file = file; }),
      );
    }
    const total = current.challenge.gestures.length;
    setHint(update.hint);
    setTracked(update.stage === "gesture" && update.tracked);
    setProgress(update.stage === "gesture" || update.stage === "pass" ? text("liveness.progress", { current: Math.min(update.gestureIndex + 1, total), total }) : "");
    if (update.stage === "pass" || update.stage === "timeout" || update.stage === "expired") void finish(update.stage);
  }
  async function takeSelfie() {
    const current = run.current;
    if (!current || busy) return;
    working(true);
    try {
      const photo = await camera.current!.takePhoto("selfie");
      evidence.current = {
        challenge: current.challenge,
        provider: provider.name,
        gestures: current.gestures,
        video: current.clip ? { file: current.clip, key: requestKey() } : null,
        selfie: { file: photo, key: requestKey() },
        submitKey: requestKey(),
        capturedAt: Date.now(),
      };
      setSelfie(photo);
      setError(undefined);
      setPhase("review");
    } catch {
      setError(text("errors.selfie_failed"));
    } finally {
      working(false);
    }
  }
  async function send() {
    if (!evidence.current || busy) return;
    working(true);
    setError(undefined);
    setStatus(text("liveness.sending"));
    try {
      await sendLivenessEvidence(session, evidence.current, (current, total) => setStatus(text("sending.uploading_progress", { current, total })));
      run.current = null;
      onSubmitted();
    } catch (cause) {
      if (!mounted.current) return;
      setStatus(undefined);
      if (challengeRejected(cause)) return fail(text("liveness.expired"));
      setError(livenessErrorMessage(cause, text("errors.send_selfie_failed")));
      working(false);
    }
  }
  const privacy = <Copy small muted>{text("selfie.privacy", { verifier })}</Copy>;
  const icon = <View style={{ alignItems: "center" }}><SpecIcon name="selfie" color={p.primary} /></View>;
  const CameraView = provider.Camera;
  const cameraActive = phase === "running" || phase === "selfie";
  return (
    <View style={{ gap: 16 }}>
      {phase === "intro" || phase === "starting" || phase === "failed" ? (
        <>
          {icon}
          <Title>{text("liveness.title")}</Title>
          <Copy muted>{text("liveness.body", { total: settings?.gesture_count ?? 3 })}</Copy>
          {settings?.record_video !== false ? <Copy small muted>{text("video.consent", { verifier })}</Copy> : null}
          {error ? <Notice>{error}</Notice> : null}
          <Action
            title={phase === "failed" ? text("liveness.retry") : phase === "starting" ? text("selfie.starting_camera") : text("liveness.start")}
            loading={phase === "starting"}
            onPress={() => void start()}
          />
          {privacy}
        </>
      ) : null}
      {cameraActive ? (
        <>
          <Title>{phase === "selfie" ? text("selfie.title") : text("liveness.title")}</Title>
          {phase === "selfie" ? <Copy muted>{text("selfie.guidance")}</Copy> : null}
          <View style={[ui.camera, { backgroundColor: p.soft }]}>
            <View style={{ flex: 1 }}>
              <CameraView
                active
                recordVideo={!!run.current?.challenge.record_video}
                handle={camera}
                onSample={onSample}
                onError={() => fail(text("errors.camera_unavailable"))}
              />
            </View>
            <View pointerEvents="none" style={[ui.oval, { borderColor: tracked || phase === "selfie" ? p.success : p.primary }]} />
            {recording ? (
              <View style={[ui.recording, { backgroundColor: p.surface }]}>
                <Text style={[ui.small, { color: p.error }]}>{text("video.recording")}</Text>
              </View>
            ) : null}
          </View>
          {phase === "running" ? (
            <>
              <Text accessibilityLiveRegion="polite" style={[ui.hint, { color: p.ink }]}>{text(hint)}</Text>
              {progress ? <Copy small muted>{progress}</Copy> : null}
            </>
          ) : (
            <>
              {error ? <Notice>{error}</Notice> : null}
              <Action title={text("selfie.take")} loading={busy} onPress={() => void takeSelfie()} />
              {privacy}
            </>
          )}
        </>
      ) : null}
      {phase === "review" && selfie ? (
        <>
          <Title>{text("selfie.review_title")}</Title>
          <Copy muted>{text("selfie.review_body")}</Copy>
          <Image source={{ uri: selfie.uri }} accessibilityLabel={text("selfie.preview_label")} style={[ui.camera, { resizeMode: "cover" }]} />
          {error ? <Notice>{error}</Notice> : null}
          {status ? <Copy small muted accessibilityLiveRegion="polite">{status}</Copy> : null}
          <Action title={text("selfie.send")} loading={busy} onPress={() => void send()} />
          <Link title={text("selfie.retake")} disabled={busy} onPress={() => void start()} />
          {privacy}
        </>
      ) : null}
    </View>
  );
}
