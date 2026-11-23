import React, { useEffect, useRef, useState } from "react";
import { Text, TextInput, View } from "react-native";
import {
  CredflareError,
  codeDestinationProblem,
  normalizePhone,
  rejectionScreen,
  requirements,
  text,
  verifierName,
} from "@credflare/sdk-javascript";
import type { CodeChannel, CodeRequest, CopyKey, CredflareSession, RejectionScreen, SessionInfo } from "@credflare/sdk-javascript";
import { Action, Copy, Link, Notice, Title, usePalette } from "./ui";
import { RejectionPanel } from "./rejection-panel";
import { ui } from "./theme";

const rules = requirements.contact_codes;

interface PendingCode {
  destination: string;
  typed: string;
  sends_remaining: number | null;
}

export interface ContactCodeProps {
  session: CredflareSession;
  info: SessionInfo;
  channel: CodeChannel;
  onSubmitted: () => void;
  onLeave: (code: string | null) => void;
  onBusyChanged?: (busy: boolean) => void;
  onRejection?: (rejection: RejectionScreen | null) => void;
  onClosed?: () => void;
}

export function CredflareContactCode({ session, info, channel, onSubmitted, onLeave, onBusyChanged, onRejection, onClosed }: ContactCodeProps) {
  const p = usePalette();
  const verifier = verifierName(info);
  const say = (key: string) => text(`${channel}.${key}` as CopyKey, { verifier });
  const [phase, setPhase] = useState<"destination" | "code">("destination");
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState<PendingCode>();
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [invalid, setInvalid] = useState<string>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const [rejection, showRejection] = useState<RejectionScreen>();
  const [busy, setBusy] = useState<"sending" | "confirming" | null>(null);
  const codeInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const waiting = Math.max(0, Math.ceil((resendAt - now) / 1000));
  useEffect(() => {
    if (waiting <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [waiting]);
  function setRejection(screen: RejectionScreen | undefined) {
    showRejection(screen);
    onRejection?.(screen ?? null);
  }
  function working(value: "sending" | "confirming" | null) {
    setBusy(value);
    onBusyChanged?.(value !== null);
  }
  function failed(cause: unknown, fallback: CopyKey) {
    if (cause instanceof CredflareError && cause.status === 409 && onClosed) return onClosed();
    if (cause instanceof CredflareError && cause.status === 422) {
      const screen = rejectionScreen(cause, { requester: info.requester });
      if (screen.action === "wait") {
        const hinted = typeof cause.details?.resend_available_at === "string" ? Date.parse(cause.details.resend_available_at) : NaN;
        const at = Date.now();
        setResendAt(current => (!Number.isNaN(hinted) ? hinted : current > at ? current : at + rules.resend_seconds * 1000));
        setNow(Date.now());
        const elsewhere = !!sent && sent.typed !== destination;
        if (sent) setDestination(sent.typed);
        else setSent({ destination: destination.trim(), typed: destination, sends_remaining: null });
        setRejection(undefined);
        setError(screen.message);
        setNote(elsewhere ? text(channel === "email" ? "email.change_after" : "phone.change_after") : undefined);
        setPhase("code");
        setTimeout(() => codeInput.current?.focus(), 0);
        return;
      }
      if (screen.action === "reenter_code") setCode("");
      setRejection(screen);
      return;
    }
    setRejection(undefined);
    setError(cause instanceof CredflareError && cause.status === 401 ? text("errors.session_expired") : text(fallback));
  }
  async function send(value = destination) {
    if (busy) return;
    const problem = codeDestinationProblem(channel, value);
    if (problem) {
      setInvalid(text(problem));
      return;
    }
    setInvalid(undefined);
    setError(undefined);
    working("sending");
    try {
      const next: CodeRequest = await session.requestCode(channel, channel === "phone" ? normalizePhone(value) : value.trim());
      if (!mounted.current) return;
      setSent({ destination: next.destination, typed: value, sends_remaining: next.sends_remaining });
      setNote(undefined);
      const ready = Date.parse(next.resend_available_at);
      setResendAt(Number.isNaN(ready) ? Date.now() + rules.resend_seconds * 1000 : ready);
      setNow(Date.now());
      setCode("");
      setRejection(undefined);
      setPhase("code");
    } catch (cause) {
      if (mounted.current) failed(cause, "errors.send_code_failed");
    } finally {
      if (mounted.current) working(null);
    }
  }
  async function confirm() {
    if (busy) return;
    const digits = code.replace(/\D/g, "");
    if (digits.length !== rules.code_length) {
      codeInput.current?.focus();
      return;
    }
    setError(undefined);
    working("confirming");
    try {
      await session.confirmCode(channel, digits);
      if (!mounted.current) return;
      working(null);
      onSubmitted();
    } catch (cause) {
      if (!mounted.current) return;
      failed(cause, "errors.confirm_code_failed");
      working(null);
    }
  }
  function act(screen: RejectionScreen) {
    switch (screen.action) {
      case "leave":
        return onLeave(screen.code);
      case "new_code":
        return void send();
      case "reenter_code":
        setRejection(undefined);
        setCode("");
        return setTimeout(() => codeInput.current?.focus(), 0);
      default:
        return setRejection(undefined);
    }
  }
  const inputStyle = [ui.input, { borderColor: p.border, color: p.ink, backgroundColor: p.surface }];
  const canResend = !!sent && (sent.sends_remaining === null || sent.sends_remaining > 0);
  const resendLine = canResend
    ? waiting > 0
      ? <Copy small muted accessibilityLiveRegion="polite">{text("contact_code.resend_in", { seconds: waiting })}</Copy>
      : <Link title={text("contact_code.resend")} disabled={!!busy} onPress={() => void send()} />
    : null;
  return (
    <View style={{ gap: 16 }}>
      <Title>{phase === "code" ? text("contact_code.title") : say("title")}</Title>
      {rejection ? (
        <RejectionPanel
          rejection={rejection}
          loading={busy === "sending"}
          status={rejection.action === "wait" && waiting > 0 ? text("contact_code.resend_in", { seconds: waiting }) : null}
          onAction={() => act(rejection)}
        />
      ) : phase === "destination" ? (
        <>
          <Copy muted>{say("body")}</Copy>
          <View style={ui.field}>
            <Text style={[ui.sectionLabel, { color: p.muted }]}>{say("label")}</Text>
            <TextInput
              accessibilityLabel={say("label")}
              value={destination}
              onChangeText={value => { setDestination(value); setInvalid(undefined); }}
              placeholder={channel === "email" ? text("email.placeholder") : undefined}
              placeholderTextColor={p.muted}
              keyboardType={channel === "email" ? "email-address" : "phone-pad"}
              autoComplete={channel === "email" ? "email" : "tel"}
              textContentType={channel === "email" ? "emailAddress" : "telephoneNumber"}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={channel === "email" ? rules.email_max_length : rules.phone_max_length}
              editable={!busy}
              returnKeyType="send"
              onSubmitEditing={() => void send()}
              style={inputStyle}
            />
            {channel === "phone" ? <Copy small muted>{text("phone.hint")}</Copy> : null}
          </View>
          {invalid ? <Notice>{invalid}</Notice> : null}
          {error ? <Notice>{error}</Notice> : null}
          {busy === "sending" ? <Copy small muted accessibilityLiveRegion="polite">{text("contact_code.sending")}</Copy> : null}
          <Action title={say("send")} loading={busy === "sending"} onPress={() => void send()} />
        </>
      ) : (
        <>
          <Copy muted>{text("contact_code.body", { destination: sent?.destination ?? "", minutes: rules.ttl_minutes })}</Copy>
          <View style={ui.field}>
            <Text style={[ui.sectionLabel, { color: p.muted }]}>{text("contact_code.label")}</Text>
            <TextInput
              ref={codeInput}
              accessibilityLabel={text("contact_code.label")}
              value={code}
              onChangeText={value => setCode(value.replace(/\D/g, "").slice(0, rules.code_length))}
              keyboardType="number-pad"
              autoComplete={channel === "phone" ? "sms-otp" : "one-time-code"}
              textContentType="oneTimeCode"
              maxLength={rules.code_length}
              editable={!busy}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void confirm()}
              style={[...inputStyle, ui.code]}
            />
          </View>
          {error ? <Notice>{error}</Notice> : null}
          {note ? <Copy small muted>{note}</Copy> : null}
          {busy === "confirming" ? <Copy small muted accessibilityLiveRegion="polite">{text("contact_code.confirming")}</Copy> : null}
          <Action
            title={text("contact_code.confirm")}
            loading={busy === "confirming"}
            disabled={code.length !== rules.code_length || busy === "sending"}
            onPress={() => void confirm()}
          />
          {resendLine}
          {sent && sent.sends_remaining !== null && sent.sends_remaining > 0 ? <Copy small muted>{text("contact_code.sends_remaining", { count: sent.sends_remaining })}</Copy> : null}
          <Link
            title={say("change")}
            disabled={!!busy}
            onPress={() => { setPhase("destination"); setError(undefined); setNote(undefined); }}
          />
        </>
      )}
    </View>
  );
}
