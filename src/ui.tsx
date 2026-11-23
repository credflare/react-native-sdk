import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  Text,
  View,
  useColorScheme,
} from "react-native";
import type { TextProps } from "react-native";
import { text } from "@credflare/sdk-javascript";
import type { IconName } from "@credflare/sdk-javascript";
import { palettes, ui } from "./theme";
import { SpecIcon } from "./icon";
export function usePalette() {
  return useColorScheme() === "dark" ? palettes.dark : palettes.light;
}
export function Copy(props: TextProps & { muted?: boolean; small?: boolean }) {
  const p = usePalette();
  return (
    <Text
      {...props}
      style={[
        props.small ? ui.small : ui.body,
        { color: props.muted ? p.muted : p.ink },
        props.style,
      ]}
    />
  );
}
export function Title({ children }: { children: React.ReactNode }) {
  const p = usePalette();
  return (
    <Text
      accessibilityRole="header"
      style={[ui.title, { color: p.ink, textAlign: "center" }]}
    >
      {children}
    </Text>
  );
}
export function Action({
  title,
  onPress,
  disabled = false,
  secondary = false,
  loading = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  loading?: boolean;
}) {
  const p = usePalette();
  const color = secondary ? p.primary : p.onPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        ui.button,
        {
          backgroundColor: secondary ? p.surface : p.primary,
          borderColor: secondary ? p.border : p.primary,
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        },
      ]}
    >
      {loading && <ActivityIndicator size="small" color={color} />}
      <Text style={[ui.buttonText, { color }]}>{title}</Text>
    </Pressable>
  );
}
export function Link({
  title,
  onPress,
  disabled = false,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const p = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={ui.ghost}
    >
      <Text
        style={[
          ui.buttonText,
          { color: p.primary, opacity: disabled ? 0.5 : 1 },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function Notice({ children }: { children: string }) {
  const p = usePalette();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[ui.notice, { borderColor: p.error, alignItems: "center", gap: 6 }]}
    >
      <SpecIcon name="error" color={p.error} />
      <Copy style={{ color: p.error }}>{children}</Copy>
    </View>
  );
}
export function Illustration({ name }: { name: IconName }) {
  const p = usePalette();
  return (
    <View accessible={false} style={ui.illustration}>
      <SpecIcon name={name} color={p.primary} size={name === "received_illustration" ? 64 : 40} />
    </View>
  );
}
export function BrandHeader() {
  const p = usePalette();
  return (
    <View style={ui.header}>
      <View style={ui.brand}>
        <Image
          source={require("../assets/credflare-mark.png")}
          accessibilityIgnoresInvertColors
          style={ui.mark}
        />
        <Text style={[ui.brandText, { color: p.ink }]}>Credflare</Text>
      </View>
    </View>
  );
}
export function VerifierHeader({
  name,
  logoUrl,
  sandbox = false,
  onClose,
  disabled = false,
}: {
  name?: string;
  logoUrl?: string | null;
  sandbox?: boolean;
  onClose: () => void;
  disabled?: boolean;
}) {
  const p = usePalette();
  return (
    <View style={ui.header}>
      <View style={ui.headerSide} />
      <View style={ui.verifier}>
        {logoUrl || name ? (
          <View style={ui.verifierRow}>
            {logoUrl ? (
              <Image
                source={{ uri: logoUrl }}
                accessibilityIgnoresInvertColors
                resizeMode="contain"
                style={ui.verifierLogo}
              />
            ) : null}
            {name ? (
              <Text style={[ui.verifierName, { color: p.ink }]}>{name}</Text>
            ) : null}
          </View>
        ) : null}
        {sandbox && (
          <View style={[ui.chip, { backgroundColor: p.warningSoft }]}>
            <Text style={[ui.chipText, { color: p.warningInk }]}>
              {text("common.test_mode")}
            </Text>
          </View>
        )}
      </View>
      <View style={ui.headerSide}>
        <Link title={text("common.close")} onPress={onClose} disabled={disabled} />
      </View>
    </View>
  );
}
export function SecuredBy() {
  const p = usePalette();
  return (
    <View style={ui.footer}>
      <Image
        source={require("../assets/credflare-mark.png")}
        accessibilityIgnoresInvertColors
        style={ui.footerMark}
      />
      <Text style={[ui.small, { color: p.muted, fontSize: 12 }]}>
        {text("common.secured_by")}
      </Text>
    </View>
  );
}
export function DocumentIllustration() {
  return <Illustration name="document" />;
}
export function SideGuide({ side }: { side: "front" | "back" }) {
  const p = usePalette();
  const line = (width: `${number}%`, color: string) => (
    <View style={[ui.cardLine, { width, backgroundColor: color }]} />
  );
  return (
    <View
      accessible={false}
      style={[ui.guide, { borderColor: p.border, backgroundColor: p.soft }]}
    >
      <View
        style={[ui.card, { borderColor: p.border, backgroundColor: p.surface }]}
      >
        {side === "front" ? (
          <View style={ui.cardRow}>
            <View style={[ui.cardPhoto, { backgroundColor: p.soft }]}>
              <View style={[ui.cardHead, { backgroundColor: p.border }]} />
              <View style={[ui.cardShoulders, { backgroundColor: p.border }]} />
            </View>
            <View style={ui.cardLines}>
              {line("55%", p.accent)}
              {line("90%", p.border)}
              {line("75%", p.border)}
              {line("60%", p.border)}
            </View>
          </View>
        ) : (
          <View style={ui.cardBack}>
            <View style={[ui.cardStripe, { backgroundColor: p.muted }]} />
            <View style={ui.cardLines}>
              {line("85%", p.border)}
              {line("65%", p.border)}
            </View>
            <View style={ui.cardBarcode}>
              {[3, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 2, 1, 3].map((w, i) => (
                <View
                  key={i}
                  style={{ width: w, height: "100%", backgroundColor: p.muted }}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}
export function ConfirmSheet({
  visible,
  title,
  body,
  stay,
  leave,
  onStay,
  onLeave,
}: {
  visible: boolean;
  title: string;
  body: string;
  stay: string;
  leave: string;
  onStay: () => void;
  onLeave: () => void;
}) {
  const p = usePalette();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onStay}
    >
      <View style={ui.modalGround}>
        <Pressable
          accessibilityLabel={stay}
          style={ui.modalScrim}
          onPress={onStay}
        />
        <View style={[ui.modal, { backgroundColor: p.surface }]}>
          <Text
            accessibilityRole="header"
            style={[ui.subtitle, { color: p.ink }]}
          >
            {title}
          </Text>
          <Copy muted>{body}</Copy>
          <Action title={stay} onPress={onStay} />
          <Link title={leave} onPress={onLeave} />
        </View>
      </View>
    </Modal>
  );
}
