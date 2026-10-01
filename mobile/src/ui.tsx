import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type TextStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export const C = {
  bg: "#090B10",
  surface: "#121620",
  raised: "#191F2B",
  line: "#282F3B",
  text: "#F6F7FA",
  muted: "#A0A8B7",
  dim: "#697384",
  gold: "#D6B36A",
  goldSoft: "#3B3221",
  green: "#70C9A0",
  red: "#EF8D8D",
  user: "#202B40",
};

export function Screen({
  children,
  scroll = false,
}: {
  children: ReactNode;
  scroll?: boolean;
}) {
  return (
    <SafeAreaView style={s.safe} edges={["top", "left", "right"]}>
      {children}
    </SafeAreaView>
  );
}

export function BrandMark({ size = 42 }: { size?: number }) {
  return (
    <View
      style={[s.mark, { width: size, height: size, borderRadius: size * 0.32 }]}
    >
      <Text style={[s.markText, { fontSize: size * 0.37 }]}>OH</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  kind = "primary",
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress?: PressableProps["onPress"];
  kind?: "primary" | "secondary" | "quiet" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: object;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        s.button,
        kind === "primary"
          ? s.primary
          : kind === "danger"
            ? s.danger
            : kind === "quiet"
              ? s.quiet
              : s.secondary,
        (disabled || loading) && s.disabled,
        pressed && !disabled && s.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={kind === "primary" ? C.bg : C.gold} />
      ) : (
        <Text
          style={[
            s.buttonText,
            kind === "primary" && { color: C.bg },
            kind === "danger" && { color: "#FFDADA" },
          ]}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: object;
}) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Label({
  children,
  style,
}: {
  children: ReactNode;
  style?: TextStyle;
}) {
  return <Text style={[s.label, style]}>{children}</Text>;
}

export const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  mark: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.gold,
  },
  markText: { color: C.bg, fontWeight: "900", letterSpacing: -1 },
  button: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  primary: { backgroundColor: C.gold },
  secondary: { backgroundColor: C.raised, borderWidth: 1, borderColor: C.line },
  quiet: { backgroundColor: "transparent" },
  danger: {
    backgroundColor: "#4A2529",
    borderWidth: 1,
    borderColor: "#704047",
  },
  buttonText: { color: C.text, fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
  card: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 20,
    padding: 18,
  },
  label: {
    color: C.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
});
