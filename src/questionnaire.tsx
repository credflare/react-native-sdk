import React, { useMemo, useRef, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import type { KeyboardTypeOptions } from "react-native";
import {
  CredflareError,
  answerProblems,
  answersPayload,
  rejectionScreen,
  text,
  verifierName,
  visibleQuestions,
} from "@credflare/sdk-javascript";
import type { Answers, CredflareSession, Question, QuestionProblem, RejectionScreen, SessionInfo } from "@credflare/sdk-javascript";
import { requestKey } from "./request-key";
import { countries, countryName } from "./countries";
import { Action, Copy, Link, Notice, Title, usePalette } from "./ui";
import { RejectionPanel } from "./rejection-panel";
import { SpecIcon } from "./icon";
import { ui } from "./theme";

export interface QuestionnaireProps {
  session: CredflareSession;
  info: SessionInfo;
  onSubmitted: () => void;
  onBusyChanged?: (busy: boolean) => void;
}

const say = (problem: QuestionProblem) => text(problem.key, problem.values);

export function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`;
}

function serverFieldErrors(errors: unknown): Record<string, string> {
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return {};
  const out: Record<string, string> = {};
  for (const [field, messages] of Object.entries(errors as Record<string, unknown>)) {
    const first = Array.isArray(messages) ? messages[0] : messages;
    if (typeof first === "string") out[field.replace(/^fields\./, "")] = first;
  }
  return out;
}

export function CredflareQuestionnaire({ session, info, onSubmitted, onBusyChanged }: QuestionnaireProps) {
  const p = usePalette();
  const verifier = verifierName(info);
  const schema = (info.profile?.form_schema ?? []) as Question[];
  const [answers, setAnswers] = useState<Answers>({});
  const [checked, setChecked] = useState(false);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [rejection, setRejection] = useState<RejectionScreen>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<Question>();
  const key = useRef(requestKey());
  const shown = visibleQuestions(schema, answers);
  const problems = checked ? answerProblems(schema, answers) : {};
  function working(value: boolean) {
    setBusy(value);
    onBusyChanged?.(value);
  }
  function answer(question: Question, value: unknown) {
    key.current = requestKey();
    setAnswers(current => ({ ...current, [question.key]: value }));
    setServerErrors(({ [question.key]: _gone, ...rest }) => rest);
  }
  async function send() {
    if (busy) return;
    setChecked(true);
    setError(undefined);
    setRejection(undefined);
    if (Object.keys(answerProblems(schema, answers)).length) return;
    working(true);
    try {
      await session.submitAnswers(answersPayload(schema, answers), key.current);
      working(false);
      onSubmitted();
    } catch (cause) {
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
    const value = answers[question.key];
    const problem = problems[question.key] ? say(problems[question.key]) : serverErrors[question.key];
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
        control = typed("decimal-pad");
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
    return (
      <View key={question.key} style={ui.field}>
        {question.type === "consent" ? null : label}
        {control}
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
      {rejection ? (
        <RejectionPanel rejection={rejection} onAction={() => setRejection(undefined)} />
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

function CountrySheet({ question, onPick, onClose }: { question?: Question; onPick: (code: string) => void; onClose: () => void }) {
  const p = usePalette();
  const [filter, setFilter] = useState("");
  const all = useMemo(() => countries(), []);
  const needle = filter.trim().toLowerCase();
  const list = needle ? all.filter(item => item.name.toLowerCase().includes(needle) || item.code.toLowerCase() === needle) : all;
  return (
    <Modal visible={!!question} animationType="slide" onRequestClose={onClose}>
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
