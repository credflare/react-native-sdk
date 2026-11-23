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
  text,
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
  text(source === "camera" ? "capture.source_camera" : "capture.source_upload");
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
        {text("errors.document_unsupported", {
          verifier: requesterName ?? text("common.verifier_fallback"),
        })}
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
          throw new Error(text("errors.camera_denied"));
        if (result.errorCode)
          throw new Error(text("errors.camera_unavailable"));
        const asset = result.assets?.[0];
        if (!asset?.uri || !asset.fileName)
          throw new Error(text("errors.camera_no_photo"));
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
          throw new Error(text("errors.file_unreadable"));
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
          text("errors.file_type", {
            types: allowedFileTypes.join(", ").toUpperCase(),
          })
        );
      if (file.size !== undefined && file.size > maxFileSizeBytes)
        throw new Error(
          text("errors.file_too_large", { size: formatSize(maxFileSizeBytes) })
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
          : text("errors.add_file_failed")
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
              ? text("sending.uploading_progress", { current: done, total: uploads.length })
              : text("sending.uploading")
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
      setSending(text("sending.sending"));
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
          : text("errors.send_document_failed")
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
            accessibilityLabel={text("capture.preview_label", { side: label.toLowerCase() })}
            style={ui.image}
          />
        ) : (
          <>
            <Text style={[ui.subtitle, { color: p.ink }]}>
              {file.mime === "application/pdf" ? text("capture.preview_pdf") : text("capture.preview_document")}
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
  const instruction = !step
    ? ""
    : step.source === "camera"
    ? text("capture.instruction_camera", { document: requirement.document_type.name })
    : step.source === "upload"
    ? `${text(
        allowedFileTypes.includes("pdf") ? "capture.instruction_upload_pdf" : "capture.instruction_upload",
        { side: step.label.toLowerCase() }
      )}${firstUpload ? ` ${text("capture.also_saved_file")}` : ""}`
    : text("capture.instruction_either", { side: step.label.toLowerCase() });
  return (
    <View style={{ gap: 16 }}>
      <View style={{ gap: 4 }}>
        <Text style={[ui.eyebrow, { color: p.muted }]}>
          {requirement.document_type.name}
        </Text>
        <Title>{reviewing ? text("review.title") : step!.label}</Title>
        {!reviewing && <Copy muted>{step!.sourceLabel}</Copy>}
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={text("common.step_progress", { current: position, total })}
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
          {text("common.step_progress", { current: position, total })}
        </Copy>
      </View>
      {!reviewing ? (
        selected ? (
          <>
            {preview(selected, step!.label)}
            <Copy muted>{text("capture.check_photo")}</Copy>
            {selected.source === "upload" && (
              <Copy small muted numberOfLines={1}>
                {selected.name}
              </Copy>
            )}
            {error && <Notice>{error}</Notice>}
            <View style={ui.links}>
              <Link
                title={
                  selected.source === "camera" ? text("capture.retake_photo") : text("capture.change_file")
                }
                disabled={busy}
                onPress={() => select(step!, selected.source)}
              />
              {step!.source === "camera_or_upload" && (
                <Link
                  title={
                    selected.source === "camera"
                      ? text("capture.use_file_instead")
                      : text("capture.use_photo_instead")
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
                editing || index + 1 === steps.length ? text("review.title") : text("common.continue")
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
                title={text("capture.take_photo")}
                disabled={busy}
                onPress={() => select(step!, "camera")}
              />
            )}
            {canUpload && (
              <Action
                title={text("capture.choose_file")}
                secondary={step!.source === "camera_or_upload"}
                disabled={busy}
                onPress={() => select(step!, "upload")}
              />
            )}
            {canUpload && (
              <Copy small muted style={{ textAlign: "center" }}>
                {text("capture.file_limits", { types: allowedFileTypes.join(", ").toUpperCase(), size: formatSize(maxFileSizeBytes) })}
              </Copy>
            )}
          </>
        )
      ) : (
        <>
          <Copy muted>{text("review.body")}</Copy>
          {steps.map((item) => (
            <View key={item.id} style={{ gap: 4 }}>
              <Text style={[ui.subtitle, { color: p.ink }]}>
                {text("review.item", { side: item.label, source: sourceName(captures[item.id]!.source) })}
              </Text>
              {preview(captures[item.id]!, item.label, true)}
              <Link
                title={text("review.change")}
                disabled={busy}
                onPress={() => {
                  setIndex(steps.indexOf(item));
                  setEditing(true);
                  setError(undefined);
                }}
              />
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
              {sending}
            </Copy>
          )}
          <Action
            title={text("review.send")}
            onPress={send}
            loading={busy}
          />
        </>
      )}
    </View>
  );
}
