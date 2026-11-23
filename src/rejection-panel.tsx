import React from "react";
import { Linking, Text, View } from "react-native";
import type { RejectionScreen } from "@credflare/sdk-javascript";
import { Action, Copy, usePalette } from "./ui";
import { SpecIcon } from "./icon";
import { ui } from "./theme";

export function RejectionPanel({
  rejection,
  onAction,
  disabled = false,
  loading = false,
  status,
}: {
  rejection: RejectionScreen;
  onAction: () => void;
  disabled?: boolean;
  loading?: boolean;
  status?: string | null;
}) {
  const p = usePalette();
  return (
    <View style={{ gap: 16 }}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[ui.notice, { borderColor: p.error, alignItems: "center", gap: 8 }]}
      >
        <SpecIcon name="error" color={p.error} />
        {rejection.title ? (
          <Text accessibilityRole="header" style={[ui.subtitle, { color: p.ink }]}>
            {rejection.title}
          </Text>
        ) : null}
        <Copy style={{ color: rejection.title ? p.ink : p.error }}>{rejection.message}</Copy>
        <Copy small muted>{rejection.requestedBy}</Copy>
        <HelpLine rejection={rejection} />
      </View>
      {status ? <Copy small muted accessibilityLiveRegion="polite">{status}</Copy> : null}
      <Action title={rejection.actionLabel} onPress={onAction} disabled={disabled} loading={loading} />
    </View>
  );
}

function HelpLine({ rejection }: { rejection: RejectionScreen }) {
  const p = usePalette();
  const link = rejection.helpLink;
  const at = link ? rejection.help.indexOf(link.text) : -1;
  if (!link || at < 0) return <Copy small muted>{rejection.help}</Copy>;
  return (
    <Copy small muted>
      {rejection.help.slice(0, at)}
      <Text
        accessibilityRole="link"
        onPress={() => void Linking.openURL(link.href).catch(() => null)}
        style={{ color: p.primary, textDecorationLine: "underline" }}
      >
        {link.text}
      </Text>
      {rejection.help.slice(at + link.text.length)}
    </Copy>
  );
}
