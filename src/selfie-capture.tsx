import React, { useRef, useState } from "react";
import { Image, View } from "react-native";
import { launchCamera } from "react-native-image-picker";
import { CredflareError, selfieFileTypes } from "@credflare/sdk-javascript";
import type { CredflareSession, SessionInfo } from "@credflare/sdk-javascript";
import { Action, Copy, Link, Notice, Title } from "./ui";
import { ui } from "./theme";
import { requestKey } from "./request-key";

type Photo = {
  uri: string;
  name: string;
  mime: string;
  key: string;
  fileId?: number;
};
export function CredflareSelfieCapture({
  session,
  info,
  onSubmitted,
  onBusyChanged,
  onDirtyChanged,
}: {
  session: CredflareSession;
  info: SessionInfo;
  onSubmitted: () => void;
  onBusyChanged: (busy: boolean) => void;
  onDirtyChanged: (dirty: boolean) => void;
}) {
  const [photo, setPhoto] = useState<Photo>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string>();
  const active = useRef(false),
    submitKey = useRef(requestKey());
  function working(value: boolean) {
    active.current = value;
    setBusy(value);
    onBusyChanged(value);
  }
  async function capture() {
    if (active.current) return;
    working(true);
    setError(undefined);
    try {
      const result = await launchCamera({
        mediaType: "photo",
        cameraType: "front",
        saveToPhotos: false,
        quality: 0.9,
      });
      if (result.didCancel) return;
      if (result.errorCode === "permission")
        throw new Error(
          "Camera access is off. Enable it in Settings, then try again.",
        );
      if (result.errorCode)
        throw new Error(
          "The camera is unavailable. Try again on a device with a front camera.",
        );
      const asset = result.assets?.[0];
      if (!asset?.uri || !asset.fileName || !asset.type?.startsWith("image/"))
        throw new Error(
          "The camera did not return a readable photo. Try again.",
        );
      const extension = asset.fileName
        .split(".")
        .pop()
        ?.toLowerCase()
        .replace("jpeg", "jpg");
      if (!extension || !selfieFileTypes(info).includes(extension))
        throw new Error("This photo format is not allowed by your verifier.");
      if (
        !asset.fileSize ||
        asset.fileSize > info.upload_limits.max_file_size_bytes
      )
        throw new Error("This photo is empty or too large. Retake it.");
      setPhoto({
        uri: asset.uri,
        name: asset.fileName,
        mime: asset.type,
        key: requestKey(),
      });
      submitKey.current = requestKey();
      onDirtyChanged(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not take your selfie. Try again.",
      );
    } finally {
      working(false);
    }
  }
  async function send() {
    if (!photo || active.current) return;
    working(true);
    setError(undefined);
    try {
      if (photo.fileId === undefined) {
        const form = new FormData();
        form.append("capture_source", "camera");
        form.append("file", {
          uri: photo.uri,
          name: photo.name,
          type: photo.mime,
        });
        photo.fileId = (await session.upload("biometrics", form, photo.key)).id;
      }
      await session.submit(
        { type: "facial_verification", image_file_id: photo.fileId },
        submitKey.current,
      );
      onSubmitted();
    } catch (cause) {
      setError(
        cause instanceof CredflareError && cause.status !== 0
          ? cause.message
          : "Could not send your selfie. Check your connection and try again.",
      );
    } finally {
      working(false);
    }
  }
  return (
    <View style={{ gap: 16 }}>
      <Title>{photo ? "Review your selfie" : "Take a selfie"}</Title>
      <Copy muted>
        {photo
          ? "Make sure your face is clear and fully visible before sharing."
          : "Face the camera in even lighting. Keep your whole face visible and remove anything covering it."}
      </Copy>
      {photo ? (
        <Image
          source={{ uri: photo.uri }}
          accessibilityLabel="Your selfie preview"
          style={[ui.image, { height: 280 }]}
        />
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      {photo ? (
        <>
          <Link title="Retake selfie" disabled={busy} onPress={capture} />
          <Action
            title={busy ? "Sending selfie…" : "Send selfie"}
            disabled={busy}
            onPress={send}
          />
        </>
      ) : (
        <Action
          title="Open front camera"
          disabled={busy || !selfieFileTypes(info).length}
          onPress={capture}
        />
      )}
      {!selfieFileTypes(info).length ? (
        <Notice>
          Your verifier has not enabled a supported selfie image format. Contact
          them to continue.
        </Notice>
      ) : null}
      <Copy small muted>
        Your selfie will be sent to {info.requester?.name ?? "your verifier"}{" "}
        for review.
      </Copy>
    </View>
  );
}
