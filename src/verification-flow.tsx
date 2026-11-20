import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import {
  CredflareError,
  CredflareSession,
  isCaptureSupported,
  methodSummary,
} from "@credflare/sdk-javascript";
import type {
  DocumentRequirement,
  SessionDescriptor,
  SessionInfo,
} from "@credflare/sdk-javascript";
import { CredflareDocumentCapture } from "./document-capture";
import {
  Action,
  ConfirmSheet,
  Copy,
  DocumentIllustration,
  Link,
  Notice,
  SecuredBy,
  Title,
  VerifierHeader,
  usePalette,
} from "./ui";
import { ui } from "./theme";
export interface VerificationProps {
  sessionProvider: () => Promise<SessionDescriptor>;
  onClose: () => void;
  onSubmitted?: (info: SessionInfo) => void;
  onCancelled?: () => void;
  autoStart?: boolean;
}
interface DocumentSection {
  key: string;
  label: string;
  items: DocumentRequirement[];
}
export function documentSections(docs: DocumentRequirement[]): DocumentSection[] {
  const required = docs.filter((doc) => doc.rule !== "any_of");
  const groups = new Map<string, DocumentRequirement[]>();
  for (const doc of docs.filter((item) => item.rule === "any_of")) {
    const key = doc.group_key ?? `doc-${doc.document_type.id}`;
    groups.set(key, [...(groups.get(key) ?? []), doc]);
  }
  return [
    ...(required.length
      ? [{ key: "required", label: "Required", items: required }]
      : []),
    ...[...groups].map(([key, items]) => {
      const count = items[0].remaining_required ?? items[0].min_required ?? 1;
      return {
        key,
        label:
          items.length === 1
            ? "Required"
            : count === 1
            ? "Provide one of these"
            : `Provide ${count} of these`,
        items,
      };
    }),
  ];
}
export function CredflareVerification({
  sessionProvider,
  onClose,
  onSubmitted,
  onCancelled,
  autoStart = false,
}: VerificationProps) {
  const p = usePalette(),
    client = useRef<CredflareSession | undefined>(undefined),
    active = useRef(false),
    mounted = useRef(true);
  const [info, setInfo] = useState<SessionInfo>(),
    [document, setDocument] = useState<DocumentRequirement>(),
    [loading, setLoading] = useState(false),
    [captureBusy, setCaptureBusy] = useState(false),
    [captureDirty, setCaptureDirty] = useState(false),
    [error, setError] = useState<string>(),
    [confirmExit, setConfirmExit] = useState(false),
    [confirmDiscard, setConfirmDiscard] = useState(false),
    [pendingReceipt, setPendingReceipt] = useState(false);
  const message = (cause: unknown, fallback: string) =>
    cause instanceof CredflareError
      ? cause.status === 401
        ? "Your session has expired. Close this screen and start again."
        : cause.status === 0
        ? fallback
        : cause.message
      : fallback;
  const start = useCallback(async () => {
    if (active.current || client.current) return;
    active.current = true;
    setLoading(true);
    setError(undefined);
    try {
      const next = new CredflareSession(await sessionProvider());
      const metadata = await next.get();
      if (mounted.current) {
        client.current = next;
        setInfo(metadata);
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          message(
            cause,
            "We could not start. Check your connection and try again."
          )
        );
    } finally {
      active.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [sessionProvider]);
  useEffect(() => {
    mounted.current = true;
    if (autoStart) void start();
    return () => {
      mounted.current = false;
    };
  }, [autoStart, start]);
  async function refresh() {
    if (active.current) return;
    active.current = true;
    setLoading(true);
    setError(undefined);
    setDocument(undefined);
    setCaptureDirty(false);
    setPendingReceipt(true);
    try {
      const metadata = await client.current!.get();
      if (!mounted.current) return;
      setInfo(metadata);
      setPendingReceipt(false);
      const profile = metadata.profile;
      if (
        !profile?.document_requirements.length &&
        !profile?.form_schema?.length &&
        !profile?.verification_requirements.length
      )
        onSubmitted?.(metadata);
    } catch (cause) {
      if (mounted.current)
        setError(
          message(cause, "We could not check what is still needed. Try again.")
        );
    } finally {
      active.current = false;
      if (mounted.current) setLoading(false);
    }
  }
  function leaveDocument() {
    if (captureDirty) setConfirmDiscard(true);
    else setDocument(undefined);
  }
  const verifier = info?.requester?.name ?? "your verifier";
  const docs = info?.profile?.document_requirements ?? [];
  const otherSteps =
    !!info?.profile?.form_schema?.length ||
    !!info?.profile?.verification_requirements.length;
  const allReceived = !!info && !docs.length && !otherSteps && !pendingReceipt;
  const notice = error ? <Notice>{error}</Notice> : null;
  return (
    <View style={[ui.root, { backgroundColor: p.surface }]}>
      <VerifierHeader
        name={info?.requester?.name}
        logoUrl={info?.requester?.logo_url}
        sandbox={info?.environment === "sandbox"}
        onClose={allReceived ? onClose : () => setConfirmExit(true)}
        disabled={loading || captureBusy}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={ui.page}
      >
        {loading ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ gap: 20, paddingVertical: 64 }}
          >
            <ActivityIndicator size="large" color={p.primary} />
            <Copy muted style={{ textAlign: "center" }}>
              {info ? "Checking what is still needed…" : "Getting ready…"}
            </Copy>
          </View>
        ) : !info ? (
          <>
            <View style={ui.sectionGap} />
            <DocumentIllustration />
            <Title>Share your documents</Title>
            <Copy muted>
              Choose a document, add each requested side, then review before
              sending.
            </Copy>
            {notice}
            <View style={ui.sectionGap} />
            <Action title={error ? "Try again" : "Start"} onPress={start} />
          </>
        ) : pendingReceipt ? (
          <>
            <Title>Your document was sent</Title>
            {notice}
            <Action title="Check again" onPress={refresh} />
          </>
        ) : allReceived ? (
          <>
            <View style={ui.sectionGap} />
            <DocumentIllustration />
            <Title>Documents received</Title>
            <Copy muted>
              {info.requester?.name ?? "Your verifier"} will review what you
              sent. You can close this screen.
            </Copy>
            <View style={ui.sectionGap} />
            <Action title="Done" onPress={onClose} />
          </>
        ) : document ? (
          <>
            <View style={{ alignSelf: "flex-start" }}>
              <Link
                title="‹ Documents"
                disabled={captureBusy}
                onPress={leaveDocument}
              />
            </View>
            <CredflareDocumentCapture
              key={document.document_type.id}
              session={client.current!}
              requirement={document}
              requesterName={info.requester?.name}
              maxFileSizeBytes={info.upload_limits.max_file_size_bytes}
              allowedFileTypes={info.upload_limits.allowed_file_types}
              onSubmitted={() => void refresh()}
              onBusyChanged={setCaptureBusy}
              onDirtyChanged={setCaptureDirty}
            />
          </>
        ) : !docs.length ? (
          <>
            <View style={ui.sectionGap} />
            <Title>Documents received</Title>
            <Copy muted>
              {info.requester?.name ? `${info.requester.name}'s app` : "The app"}{" "}
              will guide you through the remaining steps.
            </Copy>
            {notice}
            <View style={ui.sectionGap} />
            <Action title="Return to app" onPress={onClose} />
          </>
        ) : (
          <>
            <Title>Documents requested</Title>
            <Copy muted>Requested by {verifier}.</Copy>
            {info.custom_message ? (
              <View style={[ui.panel, { backgroundColor: p.soft }]}>
                <Copy>{info.custom_message}</Copy>
              </View>
            ) : null}
            {notice}
            {documentSections(docs).map((section) => (
              <View key={section.key} style={ui.section}>
                <Text style={[ui.sectionLabel, { color: p.muted }]}>
                  {section.label}
                </Text>
                {section.items.map((doc) => {
                  const supported = isCaptureSupported(doc);
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !supported }}
                      disabled={!supported}
                      key={doc.document_type.id}
                      onPress={() => {
                        setDocument(doc);
                        setError(undefined);
                      }}
                      style={({ pressed }) => [
                        ui.option,
                        {
                          borderColor: p.border,
                          backgroundColor: pressed ? p.soft : p.surface,
                          opacity: supported ? 1 : 0.7,
                        },
                      ]}
                    >
                      <View style={ui.optionBody}>
                        <Text style={[ui.subtitle, { color: p.ink }]}>
                          {doc.document_type.name}
                        </Text>
                        <Copy small muted>
                          {supported
                            ? methodSummary(doc)
                            : `Not available in this app. Contact ${verifier}.`}
                        </Copy>
                      </View>
                      {supported && (
                        <Text style={[ui.chevron, { color: p.muted }]}>›</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </>
        )}
        <SecuredBy />
      </ScrollView>
      <ConfirmSheet
        visible={confirmExit}
        title="Leave for now?"
        body="Documents you already sent are kept. You can come back through the app that asked for them."
        stay="Keep going"
        leave="Leave for now"
        onStay={() => setConfirmExit(false)}
        onLeave={() => {
          setConfirmExit(false);
          onCancelled?.();
          onClose();
        }}
      />
      <ConfirmSheet
        visible={confirmDiscard}
        title="Discard these photos and files?"
        body="You have not sent this document yet."
        stay="Keep editing"
        leave="Discard"
        onStay={() => setConfirmDiscard(false)}
        onLeave={() => {
          setConfirmDiscard(false);
          setCaptureDirty(false);
          setDocument(undefined);
        }}
      />
    </View>
  );
}
