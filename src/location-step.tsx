import React, { useRef, useState } from "react";
import { PermissionsAndroid, Platform, View } from "react-native";
import Geolocation from "react-native-geolocation-service";
import type { GeoError, GeoPosition } from "react-native-geolocation-service";
import {
  CredflareError,
  LocationError,
  acquireFix,
  livenessErrorMessage,
  location as locationSpec,
  locationCopy,
  locationErrorKey,
  locationRejection,
  locationSettings,
  locationSubmission,
  text,
  verifierName,
} from "@credflare/sdk-javascript";
import type { CredflareSession, LocationFix, SessionInfo } from "@credflare/sdk-javascript";
import { requestKey } from "./request-key";
import { Action, Copy, Link, Notice, Title, usePalette } from "./ui";
import { SpecIcon } from "./icon";
import { ui } from "./theme";

export interface Locator {
  requestPermission(): Promise<boolean>;
  getFix(): Promise<LocationFix>;
}

export function positionToFix(position: GeoPosition, os: string = Platform.OS): LocationFix {
  const provider = position.provider === "gps" || position.provider === "network" ? position.provider : "fused";
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
    altitude: position.coords.altitude ?? null,
    fixTime: position.timestamp,
    isMock: os === "android" && typeof position.mocked === "boolean" ? position.mocked : null,
    provider,
  };
}

export const nativeLocator: Locator = {
  async requestPermission() {
    if (Platform.OS === "android") {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      return result === PermissionsAndroid.RESULTS.GRANTED;
    }
    return (await Geolocation.requestAuthorization("whenInUse")) === "granted";
  },
  getFix() {
    return new Promise((resolve, reject) =>
      Geolocation.getCurrentPosition(
        position => resolve(positionToFix(position)),
        (error: GeoError) =>
          reject(new LocationError(error.code === 1 ? "permission_denied" : error.code === 3 ? "timeout" : "unavailable", error.message)),
        {
          enableHighAccuracy: true,
          accuracy: { android: "high", ios: "best" },
          timeout: locationSpec.fix_timeout_s * 1000,
          maximumAge: 0,
          showLocationDialog: true,
        },
      ),
    );
  },
};

type Phase = "consent" | "locating" | "found";

export function CredflareLocation({
  session,
  info,
  locator = nativeLocator,
  onSubmitted,
  onBusyChanged,
}: {
  session: CredflareSession;
  info: SessionInfo;
  locator?: Locator;
  onSubmitted: () => void;
  onBusyChanged?: (busy: boolean) => void;
}) {
  const p = usePalette();
  const settings = locationSettings(info.profile?.verification_requirements);
  const verifier = verifierName(info);
  const copy = locationCopy(settings, verifier);
  const [phase, setPhase] = useState<Phase>("consent");
  const [waiting, setWaiting] = useState(text("location.waiting"));
  const [fix, setFix] = useState<LocationFix>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submitKey = useRef(requestKey());
  function working(value: boolean) {
    setBusy(value);
    onBusyChanged?.(value);
  }
  async function locate() {
    if (busy) return;
    working(true);
    setError(undefined);
    try {
      if (!(await locator.requestPermission())) throw new LocationError("permission_denied");
      setWaiting(text("location.waiting"));
      setPhase("locating");
      const next = await acquireFix(() => locator.getFix(), settings!, {
        onAttempt: attempt => { if (attempt > 1) setWaiting(text("location.waiting_accuracy")); },
      });
      submitKey.current = requestKey();
      setFix(next);
      setPhase("found");
    } catch (cause) {
      setPhase("consent");
      setError(cause instanceof LocationError ? text(locationErrorKey(cause.code), { verifier }) : text("location.unavailable"));
    } finally {
      working(false);
    }
  }
  async function send() {
    if (!fix || busy) return;
    working(true);
    setError(undefined);
    try {
      const { type: _type, ...submission } = locationSubmission(fix);
      await session.submitLocation(submission, submitKey.current);
      onSubmitted();
    } catch (cause) {
      if (cause instanceof CredflareError && cause.status === 422) submitKey.current = requestKey();
      setError(
        cause instanceof CredflareError && cause.status !== 0
          ? locationRejection(cause.code, settings) ?? livenessErrorMessage(cause)
          : text("errors.send_location_failed"),
      );
    } finally {
      working(false);
    }
  }
  return (
    <View style={{ gap: 16 }}>
      <View style={{ alignItems: "center" }}><SpecIcon name="location" color={p.primary} /></View>
      <Title>{copy.title}</Title>
      {phase === "consent" ? (
        <>
          <Copy muted>{copy.why}</Copy>
          {copy.need ? <Copy>{copy.need}</Copy> : null}
          <Copy small muted>{text("location.what_shared")}</Copy>
          <Copy small muted>{text("location.permission_prompt")}</Copy>
          {error ? <Notice>{error}</Notice> : null}
          <Action title={error ? text("location.retry") : text("location.share")} loading={busy} onPress={() => void locate()} />
        </>
      ) : phase === "locating" ? (
        <Copy muted accessibilityLiveRegion="polite">{waiting}</Copy>
      ) : fix ? (
        <>
          <Copy style={ui.subtitle}>{text("location.found_title")}</Copy>
          <Copy muted>{text("location.found_body")}</Copy>
          <View style={[ui.infoCard, { borderColor: p.border }]}>
            <Copy small muted>{text("location.accuracy_label")}</Copy>
            <Copy>{text("location.accuracy_value", { meters: Math.round(fix.accuracy ?? 0) })}</Copy>
            <Copy small muted>{text("location.coordinates_label")}</Copy>
            <Copy>{`${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)}`}</Copy>
            <Copy small muted>{text("location.time_label")}</Copy>
            <Copy>{new Date(fix.fixTime).toLocaleTimeString()}</Copy>
          </View>
          {error ? <Notice>{error}</Notice> : null}
          <Action title={text("location.send")} loading={busy} onPress={() => void send()} />
          <Link title={text("location.retry")} disabled={busy} onPress={() => void locate()} />
        </>
      ) : null}
    </View>
  );
}
