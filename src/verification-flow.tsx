import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  CredflareError,
  CredflareSession,
  isCaptureSupported,
  documentsNextKey,
  methodSummary,
  nextStep,
  receiptKey,
  text,
  verifierName,
} from "@credflare/sdk-javascript";
import type {
  DocumentRequirement,
  FlowStep,
  SessionDescriptor,
  SessionInfo,
} from "@credflare/sdk-javascript";
import { CredflareLiveness } from "./liveness-capture";
import { CredflareLocation } from "./location-step";
import type { Locator } from "./location-step";
import { mlKitFaceProvider } from "./liveness-camera";
import type { NativeFaceProvider } from "./liveness-camera";
import { CredflareDocumentCapture } from "./document-capture";
import { CredflareContactCode } from "./contact-code-step";
import { CredflareQuestionnaire } from "./questionnaire";
import { SpecIcon } from "./icon";
import {
  Action,
  ConfirmSheet,
  Copy,
  DocumentIllustration,
  Illustration,
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
  faceProvider?: NativeFaceProvider;
  locator?: Locator;
}
interface DocumentSection {
  key: string;
  label: string;
  items: DocumentRequirement[];
}
export function documentSections(
  docs: DocumentRequirement[],
): DocumentSection[] {
  const required = docs.filter(doc => doc.rule !== "any_of");
  const groups = new Map<string, DocumentRequirement[]>();
  for (const doc of docs.filter(item => item.rule === "any_of")) {
    const key = doc.group_key ?? `doc-${doc.document_type.id}`;
    groups.set(key, [...(groups.get(key) ?? []), doc]);
  }
  return [
    ...(required.length
      ? [{ key: "required", label: text("documents.section_required"), items: required }]
      : []),
    ...[...groups].map(([key, items]) => {
      const count = items[0].remaining_required ?? items[0].min_required ?? 1;
      return {
        key,
        label:
          items.length === 1
            ? text("documents.section_required")
            : count === 1
            ? text("documents.section_one_of")
            : text("documents.section_count_of", { count }),
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
  faceProvider = mlKitFaceProvider,
  locator,
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
    [pendingReceipt, setPendingReceipt] = useState(false),
    [received, setReceived] = useState<string[]>([]);
  const message = (cause: unknown, fallback: string) =>
    cause instanceof CredflareError
      ? cause.status === 401
        ? text("errors.session_expired")
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
            text("errors.start_failed"),
          ),
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
      if (nextStep(metadata) === "done") onSubmitted?.(metadata);
    } catch {
      if (mounted.current) setError(text("errors.refresh_failed"));
    } finally {
      active.current = false;
      if (mounted.current) setLoading(false);
    }
  }
  function leaveDocument() {
    if (captureDirty) setConfirmDiscard(true);
    else setDocument(undefined);
  }
  const verifier = verifierName(info);
  const docs = info?.profile?.document_requirements ?? [];
  const step = info ? nextStep(info) : null;
  const allReceived = !pendingReceipt && (step === "done" || step === "host");
  const receive = (label: string) => {
    setReceived(items => [...items, label]);
    void refresh();
  };
  const receiveStep = (done: FlowStep) => {
    const key = receiptKey(done);
    receive(key ? text(key) : text("receipt.title"));
  };
  useEffect(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!loading && !captureBusy) {
        if (allReceived) onClose();
        else setConfirmExit(true);
      }
      return true;
    });
    return () => listener.remove();
  }, [allReceived, loading, captureBusy, onClose]);
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
            <Copy muted>
              {info ? text("intro.checking") : text("common.loading")}
            </Copy>
          </View>
        ) : !info ? (
          <>
            <View style={ui.sectionGap} />
            <DocumentIllustration />
            <Title>{text("intro.title")}</Title>
            <Copy muted>{text("intro.body", { verifier })}</Copy>
            {notice}
            <View style={ui.sectionGap} />
            <Action
              title={error ? text("common.try_again") : text("intro.start")}
              onPress={start}
            />
          </>
        ) : pendingReceipt ? (
          <>
            <Title>{text("sending.sent_title")}</Title>
            <Copy muted>{text("sending.sent_body")}</Copy>
            {notice}
            <Action title={text("common.try_again")} onPress={refresh} />
          </>
        ) : allReceived ? (
          <>
            <View style={ui.sectionGap} />
            <Illustration name="received_illustration" />
            <Title>{text("receipt.title")}</Title>
            <Copy muted>{text("receipt.body", { verifier })}</Copy>
            {received.map((label, index) => (
              <View
                key={`${label}-${index}`}
                style={[ui.infoCard, { borderColor: p.border }]}
              >
                <SpecIcon name="received" color={p.success} />
                <Copy>{label}</Copy>
              </View>
            ))}
            {step === "host" ? (
              <Copy muted>{text("receipt.host_steps")}</Copy>
            ) : null}
            {notice}
            <View style={ui.sectionGap} />
            <Action
              title={
                step === "host"
                  ? text("common.return_to_app")
                  : text("receipt.done")
              }
              onPress={onClose}
            />
          </>
        ) : document ? (
          <>
            <View style={{ alignSelf: "center" }}>
              <Pressable
                accessibilityRole="button"
                disabled={captureBusy}
                onPress={leaveDocument}
                style={[ui.ghost, { flexDirection: "row", gap: 4 }]}
              >
                <SpecIcon name="chevron_left" color={p.primary} />
                <Text style={[ui.buttonText, { color: p.primary }]}>
                  {text("documents.back")}
                </Text>
              </Pressable>
            </View>
            <CredflareDocumentCapture
              key={document.document_type.id}
              session={client.current!}
              requirement={document}
              requesterName={info.requester?.name}
              maxFileSizeBytes={info.upload_limits.max_file_size_bytes}
              allowedFileTypes={info.upload_limits.allowed_file_types}
              onSubmitted={() =>
                receive(
                  text("receipt.document", {
                    document: document.document_type.name,
                  }),
                )
              }
              onBusyChanged={setCaptureBusy}
              onDirtyChanged={setCaptureDirty}
            />
          </>
        ) : step === "facial_verification" ? (
          <CredflareLiveness
            session={client.current!}
            info={info}
            provider={faceProvider}
            onSubmitted={() => receiveStep("facial_verification")}
            onBusyChanged={setCaptureBusy}
          />
        ) : step === "location_verification" ? (
          <CredflareLocation
            session={client.current!}
            info={info}
            locator={locator}
            onSubmitted={() => receiveStep("location_verification")}
            onBusyChanged={setCaptureBusy}
          />
        ) : step === "questions" ? (
          <CredflareQuestionnaire
            key={JSON.stringify(info.profile?.form_schema)}
            session={client.current!}
            info={info}
            onSubmitted={() => receiveStep("questions")}
            onBusyChanged={setCaptureBusy}
          />
        ) : step === "email_verification" || step === "phone_verification" ? (
          <CredflareContactCode
            key={step}
            session={client.current!}
            info={info}
            channel={step === "email_verification" ? "email" : "phone"}
            onSubmitted={() => receiveStep(step)}
            onLeave={onClose}
            onBusyChanged={setCaptureBusy}
          />
        ) : (
          <>
            <Illustration name="id_card" />
            <Title>{text("documents.title")}</Title>
            <Copy muted>{text("documents.requested_by", { verifier })}</Copy>
            {documentsNextKey(info) ? (
              <Copy small muted>{text(documentsNextKey(info)!)}</Copy>
            ) : null}
            {info.custom_message ? (
              <View style={[ui.panel, { backgroundColor: p.soft }]}>
                <Copy>{info.custom_message}</Copy>
              </View>
            ) : null}
            {notice}
            {documentSections(docs).map(section => (
              <View key={section.key} style={ui.section}>
                <Text style={[ui.sectionLabel, { color: p.muted }]}>
                  {section.label}
                </Text>
                {section.items.map(doc => {
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
                      <SpecIcon name="document" color={p.primary} />
                      <View style={ui.optionBody}>
                        <Text style={[ui.subtitle, { color: p.ink }]}>
                          {doc.document_type.name}
                        </Text>
                        <Copy small muted>
                          {supported
                            ? methodSummary(doc)
                            : text("documents.unavailable", { verifier })}
                        </Copy>
                      </View>
                      {supported && (
                        <SpecIcon name="chevron_right" color={p.muted} />
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
        title={text("exit.title")}
        body={text("exit.body")}
        stay={text("exit.stay")}
        leave={text("exit.leave")}
        onStay={() => setConfirmExit(false)}
        onLeave={() => {
          setConfirmExit(false);
          onCancelled?.();
          onClose();
        }}
      />
      <ConfirmSheet
        visible={confirmDiscard}
        title={text("exit.discard_title")}
        body={text("exit.discard_body")}
        stay={text("exit.discard_stay")}
        leave={text("exit.discard_leave")}
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
