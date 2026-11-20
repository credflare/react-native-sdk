import React, { useEffect, useRef, useState } from "react";
import { Image, Text, View } from "react-native";
import { launchCamera } from "react-native-image-picker";
import {
  pick,
  errorCodes,
  isErrorWithCode,
  types,
} from "@react-native-documents/picker";
import {
  CredflareError,
  capturePolicy,
  captureSteps,
  CredflareSession,
} from "@credflare/sdk-javascript";
import type {
  CaptureSource,
  CaptureStep,
  DocumentRequirement,
} from "@credflare/sdk-javascript";
import { requestKey } from "./request-key";
import { Action, Copy, Link, Notice, SideGuide, Title, usePalette } from "./ui";
import { ui } from "./theme";

interface Capture {
  uri: string;
  name: string;
  mime: string;
  source: CaptureSource;
  key: string;
  fileId?: number;
}
export interface DocumentCaptureProps {
  session: CredflareSession;
  requirement: DocumentRequirement;
  maxFileSizeBytes: number;
  allowedFileTypes: string[];
  onSubmitted: (id: number) => void;
  onBusyChanged?: (busy: boolean) => void;
  onDirtyChanged?: (dirty: boolean) => void;
  requesterName?: string;
}
export function formatSize(bytes: number): string {
  return `${Number((bytes / 1048576).toFixed(1))} MB`;
}
const sourceName = (source: CaptureSource) =>
  source === "camera" ? "Camera photo" : "Saved file";
export function CredflareDocumentCapture({
  session,
  requirement,
  maxFileSizeBytes,
  allowedFileTypes,
  onSubmitted,
  onBusyChanged,
  onDirtyChanged,
  requesterName,
}: DocumentCaptureProps) {
  const p = usePalette();
  const [captures, setCaptures] = useState<Record<string, Capture>>({});
  const [index, setIndex] = useState(0),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [sending, setSending] = useState<string>(),
    [error, setError] = useState<string>();
  const active = useRef(false),
    submitKey = useRef("");
  const dirty = Object.keys(captures).length > 0;
  useEffect(() => {
    onDirtyChanged?.(dirty);
  }, [dirty, onDirtyChanged]);
  let steps: CaptureStep[];
  try {
    steps = captureSteps(requirement);
  } catch {
    return (
      <Notice>
        {`This document cannot be collected in this app. Contact ${
          requesterName ?? "your verifier"
        }.`}
      </Notice>
    );
  }
  const total = steps.length + 1,
    reviewing = index >= steps.length,
    step = steps[index],
    selected = step ? captures[step.id] : undefined,
    position = Math.min(index + 1, total);
  function toggle(value: boolean) {
    active.current = value;
    setBusy(value);
    onBusyChanged?.(value);
  }
  async function select(current: CaptureStep, source: CaptureSource) {
    if (active.current) return;
    toggle(true);
    setError(undefined);
    try {
      let file: { uri: string; name: string; mime: string; size?: number };
      if (source === "camera") {
        const result = await launchCamera({
          mediaType: "photo",
          cameraType: "back",
          saveToPhotos: false,
          quality: 1,
        });
        if (result.didCancel) return;
        if (result.errorCode === "permission")
          throw new Error(
            "Camera access is off. Turn it on in Settings, then try again."
          );
        if (result.errorCode)
          throw new Error(
            "The camera is unavailable. Try again on a device with a camera."
          );
        const asset = result.assets?.[0];
        if (!asset?.uri || !asset.fileName)
          throw new Error("The camera did not return a photo. Try again.");
        file = {
          uri: asset.uri,
          name: asset.fileName,
          mime: asset.type ?? "application/octet-stream",
          size: asset.fileSize,
        };
      } else {
        const allowed: string[] = [];
        if (
          allowedFileTypes.some((type) =>
            ["jpg", "png", "webp", "heic"].includes(type)
          )
        )
          allowed.push(types.images);
        if (allowedFileTypes.includes("pdf")) allowed.push(types.pdf);
        if (allowedFileTypes.includes("docx")) allowed.push(types.docx);
        const [result] = await pick({
          type: allowed,
          mode: "import",
          allowMultiSelection: false,
          allowVirtualFiles: false,
        });
        if (result.error || !result.name || !result.hasRequestedType)
          throw new Error("This file could not be read. Choose another file.");
        file = {
          uri: result.uri,
          name: result.name,
          mime: result.type ?? "application/octet-stream",
          size: result.size ?? undefined,
        };
      }
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!ext || !allowedFileTypes.includes(ext === "jpeg" ? "jpg" : ext))
        throw new Error(
          `Choose a ${allowedFileTypes.join(", ").toUpperCase()} file.`
        );
      if (file.size !== undefined && file.size > maxFileSizeBytes)
        throw new Error(
          `This file is larger than ${formatSize(
            maxFileSizeBytes
          )}. Choose a smaller file.`
        );
      setCaptures((value) => ({
        ...value,
        [current.id]: { ...file, source, key: requestKey() },
      }));
      submitKey.current = requestKey();
    } catch (cause) {
      if (
        isErrorWithCode(cause) &&
        cause.code === errorCodes.OPERATION_CANCELED
      )
        return;
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not add this file. Try again."
      );
    } finally {
      toggle(false);
    }
  }
  function next() {
    setIndex(editing ? steps.length : index + 1);
    setEditing(false);
    setError(undefined);
  }
  async function send() {
    if (active.current) return;
    toggle(true);
    setError(undefined);
    try {
      const evidence = [];
      const uploads = steps.filter((item) => captures[item.id]!.fileId === undefined);
      let done = 0;
      for (const item of steps) {
        const file = captures[item.id]!;
        if (file.fileId === undefined) {
          done += 1;
          setSending(
            uploads.length > 1
              ? `Uploading ${done} of ${uploads.length}`
              : "Uploading"
          );
          const form = new FormData();
          form.append("side", item.side);
          form.append("capture_source", file.source);
          form.append("document_type_id", String(requirement.document_type.id));
          form.append("file", {
            uri: file.uri,
            name: file.name,
            type: file.mime,
          });
          file.fileId = (await session.upload("documents", form, file.key)).id;
        }
        evidence.push({
          file_id: file.fileId,
          side: item.side,
          source: file.source,
        });
      }
      setSending("Sending");
      const result = await session.submit(
        {
          type: "document_verification",
          document_type_id: requirement.document_type.id,
          evidence,
        },
        submitKey.current
      );
      onSubmitted(result.id);
    } catch (cause) {
      setError(
        cause instanceof CredflareError && cause.status !== 0
          ? cause.message
          : "Could not send this document. Check your connection and try again."
      );
    } finally {
      setSending(undefined);
      toggle(false);
    }
  }
  function preview(file: Capture, label: string, compact = false) {
    return (
      <View
        style={[
          ui.preview,
          { backgroundColor: p.soft, height: compact ? 150 : 230 },
        ]}
      >
        {file.mime.startsWith("image/") ? (
          <Image
            source={{ uri: file.uri }}
            accessibilityLabel={`${label} preview`}
            style={ui.image}
          />
        ) : (
          <>
            <Text style={[ui.subtitle, { color: p.ink }]}>
              {file.mime === "application/pdf" ? "PDF" : "Document"}
            </Text>
            <Copy small muted numberOfLines={2} style={{ textAlign: "center" }}>
              {file.name}
            </Copy>
          </>
        )}
      </View>
    );
  }
  const canUpload = !!step && step.source !== "camera";
  const firstUpload =
    capturePolicy(requirement) === "snapshot_and_upload" &&
    step?.source === "upload" &&
    steps.findIndex((item) => item.source === "upload") === index;
  const side = step?.side ?? "front";
  const instruction = !step
    ? ""
    : step.source === "camera"
    ? "Place the document on a flat surface. Keep all four corners visible and avoid reflections."
    : step.source === "upload"
    ? `Choose a clear ${
        allowedFileTypes.includes("pdf") ? "photo, scan or PDF" : "photo or scan"
      } of the ${side}.${
        firstUpload
          ? ` ${requesterName ?? "Your verifier"} also needs a saved file of each side.`
          : ""
      }`
    : `Take a photo or choose a saved file of the ${side}.`;
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={[ui.eyebrow, { color: p.muted }]}>
          {requirement.document_type.name}
        </Text>
        <Title>{reviewing ? "Review before sending" : step!.label}</Title>
        {!reviewing && <Copy muted>{step!.sourceLabel}</Copy>}
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`Step ${position} of ${total}`}
        accessibilityValue={{ min: 0, max: total, now: position }}
        style={ui.progress}
      >
        <View style={[ui.progressTrack, { backgroundColor: p.soft }]}>
          <View
            style={[
              ui.progressFill,
              {
                backgroundColor: p.primary,
                width: `${(position / total) * 100}%`,
              },
            ]}
          />
        </View>
        <Copy small muted>
          Step {position} of {total}
        </Copy>
      </View>
      {!reviewing ? (
        selected ? (
          <>
            {preview(selected, step!.label)}
            <Copy muted>
              Check that all four corners are visible, the text is sharp and
              there is no glare.
            </Copy>
            {selected.source === "upload" && (
              <Copy small muted numberOfLines={1}>
                {selected.name}
              </Copy>
            )}
            {error && <Notice>{error}</Notice>}
            <View style={ui.row}>
              <Link
                title={
                  selected.source === "camera" ? "Retake photo" : "Change file"
                }
                disabled={busy}
                onPress={() => select(step!, selected.source)}
              />
              {step!.source === "either" && (
                <Link
                  title={
                    selected.source === "camera"
                      ? "Use a file instead"
                      : "Take a photo instead"
                  }
                  disabled={busy}
                  onPress={() =>
                    select(
                      step!,
                      selected.source === "camera" ? "upload" : "camera"
                    )
                  }
                />
              )}
            </View>
            <Action
              title={
                editing || index + 1 === steps.length ? "Review" : "Continue"
              }
              onPress={next}
              disabled={busy}
            />
          </>
        ) : (
          <>
            <Copy>{instruction}</Copy>
            <SideGuide side={step!.side} />
            {error && <Notice>{error}</Notice>}
            {step!.source !== "upload" && (
              <Action
                title="Take photo"
                disabled={busy}
                onPress={() => select(step!, "camera")}
              />
            )}
            {canUpload && (
              <Action
                title="Choose a file"
                secondary={step!.source === "either"}
                disabled={busy}
                onPress={() => select(step!, "upload")}
              />
            )}
            {canUpload && (
              <Copy small muted style={{ textAlign: "center" }}>
                {allowedFileTypes.join(", ").toUpperCase()}, up to{" "}
                {formatSize(maxFileSizeBytes)}
              </Copy>
            )}
          </>
        )
      ) : (
        <>
          <Copy muted>Check each photo and file before you send them.</Copy>
          {steps.map((item) => (
            <View key={item.id} style={{ gap: 4 }}>
              <View style={ui.row}>
                <Text style={[ui.subtitle, ui.flex, { color: p.ink }]}>
                  {item.label} · {sourceName(captures[item.id]!.source)}
                </Text>
                <Link
                  title="Change"
                  disabled={busy}
                  onPress={() => {
                    setIndex(steps.indexOf(item));
                    setEditing(true);
                    setError(undefined);
                  }}
                />
              </View>
              {preview(captures[item.id]!, item.label, true)}
            </View>
          ))}
          {error && <Notice>{error}</Notice>}
          {sending && (
            <Copy
              small
              muted
              accessibilityLiveRegion="polite"
              style={{ textAlign: "center" }}
            >
              {sending}…
            </Copy>
          )}
          <Action
            title="Send document"
            onPress={send}
            loading={busy}
          />
        </>
      )}
    </View>
  );
}
