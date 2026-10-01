import { useState } from "react";
import { Alert, Modal, Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Button, BrandMark, C, Card, Screen } from "@/ui";
import { requireSupabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");

export default function SettingsScreen() {
  const { session } = useAuth();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    const { error: signOutError } = await requireSupabase().auth.signOut();
    if (signOutError) {
      Alert.alert("Sign out failed", signOutError.message);
      return;
    }
    router.replace("/auth");
  }

  async function deleteAccount() {
    if (phrase !== "DELETE MY ACCOUNT" || !apiBase) return;
    setBusy(true);
    setError("");
    try {
      const {
        data: { session },
      } = await requireSupabase().auth.getSession();
      if (!session?.access_token)
        throw new Error("Your session expired. Sign in again.");
      const response = await fetch(`${apiBase}/api/account`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmation: phrase }),
      });
      const result: unknown = await response.json().catch(() => null);
      if (
        !response.ok ||
        !result ||
        typeof result !== "object" ||
        !("deleted" in result) ||
        result.deleted !== true
      ) {
        const message =
          result &&
          typeof result === "object" &&
          "error" in result &&
          typeof result.error === "string"
            ? result.error
            : "OlyHub could not delete this account.";
        throw new Error(message);
      }
      await requireSupabase().auth.signOut({ scope: "local" });
      setDeleteOpen(false);
      router.replace("/auth");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Account deletion failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, padding: 20, gap: 16 }}>
        <View style={{ marginBottom: 4 }}>
          <Text style={{ color: C.text, fontSize: 25, fontWeight: "800" }}>
            Settings
          </Text>
          <Text style={{ color: C.muted, marginTop: 4 }}>
            Your OlyHub account and access.
          </Text>
        </View>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <BrandMark />
          <View style={{ flex: 1 }}>
            <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>
              {session?.user.email ?? "OlyHub account"}
            </Text>
            <Text style={{ color: C.muted, marginTop: 4 }}>
              Commercial workspace
            </Text>
          </View>
          <View
            style={{
              backgroundColor: "#17372E",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 20,
            }}
          >
            <Text style={{ color: C.green, fontSize: 11, fontWeight: "800" }}>
              SECURE
            </Text>
          </View>
        </Card>
        <Card style={{ gap: 8 }}>
          <Text style={{ color: C.text, fontWeight: "800", fontSize: 16 }}>
            Private by account
          </Text>
          <Text style={{ color: C.muted, lineHeight: 21 }}>
            Projects, chats and files are protected by Supabase authentication
            and row-level security. OlyHub’s commercial workspace is separate
            from Zeus Proxy.
          </Text>
        </Card>
        <View style={{ flex: 1 }} />
        <Button
          title="Sign out"
          kind="secondary"
          onPress={() => void signOut()}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            setPhrase("");
            setError("");
            setDeleteOpen(true);
          }}
          style={{ alignItems: "center", paddingVertical: 14 }}
        >
          <Text style={{ color: C.red, fontWeight: "700" }}>
            Delete account and data
          </Text>
        </Pressable>
        <Modal
          visible={deleteOpen}
          animationType="slide"
          transparent
          onRequestClose={() => setDeleteOpen(false)}
        >
          <View
            style={{
              flex: 1,
              justifyContent: "flex-end",
              backgroundColor: "#0009",
            }}
          >
            <View
              style={{
                backgroundColor: C.surface,
                padding: 22,
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
                gap: 14,
                borderWidth: 1,
                borderColor: C.line,
              }}
            >
              <Text style={{ color: C.red, fontWeight: "800", fontSize: 20 }}>
                Delete your account?
              </Text>
              <Text style={{ color: C.muted, lineHeight: 21 }}>
                This permanently removes your OlyHub account, private files and
                project data. This cannot be undone.
              </Text>
              <TextInput
                accessibilityLabel="Confirmation phrase"
                value={phrase}
                onChangeText={setPhrase}
                placeholder="Type DELETE MY ACCOUNT"
                placeholderTextColor={C.dim}
                autoCapitalize="characters"
                style={{
                  color: C.text,
                  backgroundColor: C.raised,
                  borderWidth: 1,
                  borderColor: C.line,
                  borderRadius: 14,
                  padding: 14,
                }}
              />
              {!!error && (
                <Text accessibilityRole="alert" style={{ color: C.red }}>
                  {error}
                </Text>
              )}
              <Button
                title="Permanently delete account"
                kind="danger"
                onPress={() => void deleteAccount()}
                loading={busy}
                disabled={phrase !== "DELETE MY ACCOUNT" || !apiBase}
              />
              <Button
                title="Cancel"
                kind="secondary"
                onPress={() => setDeleteOpen(false)}
              />
            </View>
          </View>
        </Modal>
      </View>
    </Screen>
  );
}
