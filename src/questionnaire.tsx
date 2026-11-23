import React, { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import type { KeyboardTypeOptions } from "react-native";
import {
  CredflareError,
  answerFor,
  answerProblems,
  answersPayload,
  earlierAnswers,
  hasAnswer,
  isSupportedQuestion,
  startingAnswers,
  rejectionScreen,
  text,
  verifierName,
  visibleQuestions,
} from "@credflare/sdk-javascript";
import type { Answers, CredflareSession, FoundersAnswer, Question, QuestionProblem, RejectionScreen, SessionInfo } from "@credflare/sdk-javascript";
import { requestKey } from "./request-key";
import { countries, countryName } from "./countries";
import { Action, Copy, Link, Notice, Title, usePalette } from "./ui";
import { RejectionPanel } from "./rejection-panel";
import { SpecIcon } from "./icon";
import { ui } from "./theme";

export interface QuestionnaireProps {
  session: CredflareSession;
  info: SessionInfo;
  onSubmitted: (fields: Answers) => void;
  onBusyChanged?: (busy: boolean) => void;
  earlier?: Answers;
  onUnsupported?: (answers: Answers) => void;
  onClosed?: () => void;
  onLeave?: (code: string | null) => void;
  onRejection?: (rejection: RejectionScreen | null) => void;
}

const signedNumberKeyboard: KeyboardTypeOptions = Platform.OS === "ios" ? "numbers-and-punctuation" : "numeric";

const say = (problem: QuestionProblem) => text(problem.key, problem.values);

export function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function serverFieldErrors(errors: unknown): Record<string, string> {
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return {};
  const out: Record<string, string> = Object.create(null);
  for (const [field, messages] of Object.entries(errors as Record<string, unknown>)) {
    const first = Array.isArray(messages) ? messages[0] : messages;
    if (typeof first === "string") out[field.replace(/^fields\./, "")] = first;
  }
  return out;
}

export function CredflareQuestionnaire({ session, info, onSubmitted, onBusyChanged, earlier: local, onUnsupported, onClosed, onLeave, onRejection }: QuestionnaireProps) {
  const p = usePalette();
  const verifier = verifierName(info);
  const schema = (info.profile?.form_schema ?? []) as Question[];
  const earlier = earlierAnswers(info, local);
  const [answers, setAnswers] = useState<Answers>(() => startingAnswers(schema, earlier));
  const [checked, setChecked] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [rejection, showRejection] = useState<RejectionScreen>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<Question>();
  const key = useRef(requestKey());
  const visible = visibleQuestions(schema, answers, earlier);
  const unsupported = !visible.every(isSupportedQuestion);
  const shown = visible.filter(isSupportedQuestion);
  const handOver = useRef(onUnsupported);
  handOver.current = onUnsupported;
  useEffect(() => {
    if (unsupported) handOver.current?.(answers);
  }, [unsupported, answers]);
  const problems = checked ? answerProblems(schema, answers, earlier) : {};
  function setRejection(screen: RejectionScreen | undefined) {
    showRejection(screen);
    onRejection?.(screen ?? null);
  }
  function act(screen: RejectionScreen) {
    if (screen.action === "leave" && onLeave) return onLeave(screen.code);
    setRejection(undefined);
  }
  function working(value: boolean) {
    setBusy(value);
    onBusyChanged?.(value);
  }
  function answer(question: Question, value: unknown) {
    key.current = requestKey();
    setAnswers(current => ({ ...current, [question.key]: value }));
    setServerErrors(current => {
      const rest: Record<string, string> = Object.create(null);
      for (const key of Object.keys(current)) if (key !== question.key) rest[key] = current[key];
      return rest;
    });
  }
  async function send() {
    if (busy) return;
    setChecked(true);
    setError(undefined);
    setRejection(undefined);
    if (Object.keys(answerProblems(schema, answers, earlier)).length) return;
    working(true);
    try {
      const fields = answersPayload(schema, answers, earlier);
      await session.submitAnswers(fields, key.current);
      working(false);
      onSubmitted(fields);
    } catch (cause) {
      if (cause instanceof CredflareError && cause.status === 409 && onClosed) {
        working(false);
        return onClosed();
      }
      if (cause instanceof CredflareError && cause.status === 422) {
        key.current = requestKey();
        setServerErrors(serverFieldErrors(cause.errors));
        setRejection(rejectionScreen(cause, { requester: info.requester }));
      } else {
        setError(cause instanceof CredflareError && cause.status === 401 ? text("errors.session_expired") : text("errors.send_answers_failed"));
      }
      working(false);
    }
  }
  const inputStyle = [ui.input, { borderColor: p.border, color: p.ink, backgroundColor: p.surface }];
  function field(question: Question) {
    const value = answerFor(answers, question.key);
    const problem = hasAnswer(problems, question.key) ? say(problems[question.key]) : hasAnswer(serverErrors, question.key) ? serverErrors[question.key] : undefined;
    const title = question.required ? question.label : `${question.label} (${text("questions.optional")})`;
    const label = <Text style={[ui.subtitle, { color: p.ink }]}>{title}</Text>;
    const typed = (keyboardType: KeyboardTypeOptions, extra: Partial<React.ComponentProps<typeof TextInput>> = {}) => (
      <TextInput
        accessibilityLabel={question.label}
        value={typeof value === "string" ? value : value === undefined || value === null ? "" : String(value)}
        onChangeText={next => answer(question, next)}
        keyboardType={keyboardType}
        editable={!busy}
        placeholderTextColor={p.muted}
        style={inputStyle}
        {...extra}
      />
    );
    let control: React.ReactNode;
    switch (question.type) {
      case "textarea":
        control = typed("default", { multiline: true, style: [...inputStyle, ui.textarea] });
        break;
      case "number":
        control = typed(signedNumberKeyboard);
        break;
      case "founders":
        control = <FoundersInput label={question.label} value={value} busy={busy} onChange={next => answer(question, next)} />;
        break;
      case "date":
        control = typed("number-pad", {
          onChangeText: next => answer(question, formatDateInput(next)),
          maxLength: 10,
          autoComplete: question.key.includes("birth") ? "birthdate-full" : "off",
        });
        break;
      case "email":
        control = typed("email-address", { autoCapitalize: "none", autoCorrect: false, autoComplete: "email" });
        break;
      case "phone":
      case "tel":
        control = typed("phone-pad", { autoComplete: "tel" });
        break;
      case "select":
      case "single_select":
      case "multi_select": {
        const many = question.type === "multi_select";
        const list = Array.isArray(value) ? (value as string[]) : [];
        control = (
          <View style={{ gap: 8 }}>
            <Copy small muted>{many ? text("questions.choose_many") : text("questions.choose_one")}</Copy>
            {(question.options ?? []).map(raw => {
              const option = String(raw);
              const on = many ? list.includes(option) : value === option;
              return (
                <Pressable
                  key={option}
                  accessibilityRole={many ? "checkbox" : "radio"}
                  accessibilityState={{ checked: on, disabled: busy }}
                  disabled={busy}
                  onPress={() => answer(question, many ? (on ? list.filter(item => item !== option) : [...list, option]) : option)}
                  style={({ pressed }) => [
                    ui.choice,
                    { borderColor: on ? p.primary : p.border, backgroundColor: on || pressed ? p.soft : p.surface },
                  ]}
                >
                  <View style={[ui.tick, { borderRadius: many ? 4 : 10, borderColor: on ? p.primary : p.muted, backgroundColor: on ? p.primary : "transparent" }]} />
                  <Text style={[ui.body, { color: p.ink, flexShrink: 1 }]}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        );
        break;
      }
      case "country":
        control = (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={question.label}
            disabled={busy}
            onPress={() => setPicking(question)}
            style={({ pressed }) => [ui.choice, { borderColor: p.border, backgroundColor: pressed ? p.soft : p.surface }]}
          >
            <Text style={[ui.body, { color: typeof value === "string" ? p.ink : p.muted }]}>
              {typeof value === "string" ? countryName(value) : text("questions.choose_country")}
            </Text>
            <SpecIcon name="chevron_right" color={p.muted} />
          </Pressable>
        );
        break;
      case "consent":
        control = (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: value === true, disabled: busy }}
            disabled={busy}
            onPress={() => answer(question, value !== true)}
            style={({ pressed }) => [
              ui.choice,
              { borderColor: value === true ? p.primary : p.border, backgroundColor: value === true || pressed ? p.soft : p.surface },
            ]}
          >
            <View style={[ui.tick, { borderRadius: 4, borderColor: value === true ? p.primary : p.muted, backgroundColor: value === true ? p.primary : "transparent" }]} />
            <Text style={[ui.body, { color: p.ink, flexShrink: 1 }]}>{title}</Text>
          </Pressable>
        );
        break;
      default:
        control = typed("default");
    }
    const clearable = !question.required && typeof value === "string" && value !== "" && ["select", "single_select", "country", "date"].includes(question.type);
    return (
      <View key={question.key} style={ui.field}>
        {question.type === "consent" ? null : label}
        {control}
        {clearable ? <Link title={text("questions.founders_remove")} accessibilityLabel={`${text("questions.founders_remove")}: ${question.label}`} disabled={busy} onPress={() => answer(question, null)} /> : null}
        {problem ? <Text style={[ui.small, { color: p.error }]}>{problem}</Text> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }}>
      <Title>{text("questions.title")}</Title>
      <Copy muted>{text("questions.body", { verifier })}</Copy>
      {shown.map(field)}
      {error ? <Notice>{error}</Notice> : null}
      {busy ? <Copy small muted accessibilityLiveRegion="polite">{text("questions.sending")}</Copy> : null}
      {unsupported ? (
        <Notice>{text("receipt.host_steps")}</Notice>
      ) : rejection ? (
        <RejectionPanel rejection={rejection} onAction={() => act(rejection)} />
      ) : (
        <Action title={text("questions.send")} loading={busy} onPress={() => void send()} />
      )}
      <CountrySheet
        question={picking}
        onClose={() => setPicking(undefined)}
        onPick={code => {
          if (picking) answer(picking, code);
          setPicking(undefined);
        }}
      />
    </View>
  );
}

function FoundersInput({ label, value, busy, onChange }: { label: string; value: unknown; busy: boolean; onChange: (next: FoundersAnswer) => void }) {
  const p = usePalette();
  const current = value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<FoundersAnswer>) : {};
  const includes = current.includes_applicant === true;
  const names = Array.isArray(current.names) ? current.names.map(name => (typeof name === "string" ? name : "")) : [];
  const inputStyle = [ui.input, { borderColor: p.border, color: p.ink, backgroundColor: p.surface }];
  return (
    <View style={{ gap: 8 }}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: includes, disabled: busy }}
        disabled={busy}
        onPress={() => onChange({ includes_applicant: !includes, names })}
        style={({ pressed }) => [ui.choice, { borderColor: includes ? p.primary : p.border, backgroundColor: includes || pressed ? p.soft : p.surface }]}
      >
        <View style={[ui.tick, { borderRadius: 4, borderColor: includes ? p.primary : p.muted, backgroundColor: includes ? p.primary : "transparent" }]} />
        <Text style={[ui.body, { color: p.ink, flexShrink: 1 }]}>{text("questions.founders_includes_me")}</Text>
      </Pressable>
      {names.map((name, index) => (
        <View key={index} style={{ gap: 4 }}>
          <TextInput
            accessibilityLabel={`${label} ${index + 1}`}
            placeholder={text("questions.founders_name")}
            placeholderTextColor={p.muted}
            value={name}
            onChangeText={next => onChange({ includes_applicant: includes, names: names.map((item, at) => (at === index ? next : item)) })}
            autoComplete="name"
            editable={!busy}
            style={inputStyle}
          />
          <Link
            title={text("questions.founders_remove")}
            disabled={busy}
            onPress={() => onChange({ includes_applicant: includes, names: names.filter((_, at) => at !== index) })}
          />
        </View>
      ))}
      <Link title={text("questions.founders_add")} disabled={busy} onPress={() => onChange({ includes_applicant: includes, names: [...names, ""] })} />
    </View>
  );
}

function CountrySheet({ question, onPick, onClose }: { question?: Question; onPick: (code: string) => void; onClose: () => void }) {
  const p = usePalette();
  const [filter, setFilter] = useState("");
  const all = useMemo(() => countries(), []);
  const needle = filter.trim().toLowerCase();
  const list = needle ? all.filter(item => item.name.toLowerCase().includes(needle) || item.code.toLowerCase() === needle) : all;
  return (
    <Modal visible={!!question} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[ui.root, { backgroundColor: p.surface, padding: 24, gap: 12 }]}>
        <Text accessibilityRole="header" style={[ui.subtitle, { color: p.ink }]}>
          {text("questions.choose_country")}
        </Text>
        <TextInput
          accessibilityLabel={question?.label ?? text("questions.choose_country")}
          value={filter}
          onChangeText={setFilter}
          autoCorrect={false}
          style={[ui.input, { borderColor: p.border, color: p.ink }]}
        />
        <FlatList
          data={list}
          keyExtractor={item => item.code}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => onPick(item.code)}
              style={({ pressed }) => [ui.choice, { borderWidth: 0, backgroundColor: pressed ? p.soft : p.surface }]}
            >
              <Text style={[ui.body, { color: p.ink }]}>{item.name}</Text>
            </Pressable>
          )}
        />
        <Link title={text("common.cancel")} onPress={onClose} />
      </View>
    </Modal>
  );
}
