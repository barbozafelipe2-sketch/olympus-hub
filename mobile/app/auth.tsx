import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Button, BrandMark, C, Card, s } from "@/ui";
import { requireSupabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";

export default function AuthScreen() {
  const { configured } = useAuth();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const input = {
    minHeight: 54,
    borderRadius: 14,
    paddingHorizontal: 16,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.line,
    color: C.text,
    fontSize: 16,
  } as const;

  if (!configured)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: C.bg,
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View style={{ alignItems: "center", gap: 16 }}>
          <BrandMark size={62} />
          <Text
            style={{
              color: C.text,
              fontSize: 24,
              fontWeight: "800",
              textAlign: "center",
            }}
          >
            Connect OlyHub to continue
          </Text>
          <Text style={{ color: C.muted, textAlign: "center", lineHeight: 22 }}>
            Set the native Supabase URL and publishable key in the local or EAS
            environment. These values are public; never add provider secrets to
            the app.
          </Text>
        </View>
      </View>
    );

  async function submit() {
    setError("");
    setNotice("");
    if (!email.trim() || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      const client = requireSupabase();
      if (creating) {
        const { data, error: signupError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name.trim() || undefined } },
        });
        if (signupError) throw signupError;
        if (!data.session) {
          setNotice("Check your email to verify your account, then sign in.");
          setCreating(false);
          setPassword("");
        } else router.replace("/(tabs)");
      } else {
        const { error: signinError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signinError) throw signinError;
        router.replace("/(tabs)");
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "OlyHub could not authenticate this account.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          padding: 24,
          paddingTop: 48,
          paddingBottom: 40,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ alignItems: "center", marginBottom: 30 }}>
          <BrandMark size={64} />
          <Text
            style={{
              color: C.gold,
              fontSize: 12,
              fontWeight: "800",
              letterSpacing: 2,
              marginTop: 20,
            }}
          >
            YOUR AI WORKSPACE
          </Text>
          <Text
            style={{
              color: C.text,
              fontSize: 32,
              fontWeight: "800",
              textAlign: "center",
              marginTop: 12,
              letterSpacing: -0.8,
            }}
          >
            Your work, with{"\n"}continuity.
          </Text>
          <Text
            style={{
              color: C.muted,
              fontSize: 15,
              textAlign: "center",
              lineHeight: 23,
              marginTop: 12,
            }}
          >
            Projects, conversations and deliverables stay together in OlyHub.
          </Text>
        </View>
        <Card style={{ padding: 20, gap: 14 }}>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: C.raised,
              padding: 4,
              borderRadius: 13,
              marginBottom: 4,
            }}
          >
            {["Sign in", "Create account"].map((label, index) => (
              <Text
                key={label}
                onPress={() => {
                  setCreating(index === 1);
                  setError("");
                  setNotice("");
                }}
                style={{
                  flex: 1,
                  textAlign: "center",
                  paddingVertical: 11,
                  borderRadius: 10,
                  overflow: "hidden",
                  color: creating === (index === 1) ? C.text : C.muted,
                  backgroundColor:
                    creating === (index === 1) ? C.surface : "transparent",
                  fontWeight: "700",
                }}
              >
                {label}
              </Text>
            ))}
          </View>
          <Text style={{ color: C.text, fontSize: 20, fontWeight: "800" }}>
            {creating ? "Create your account" : "Welcome back"}
          </Text>
          {creating && (
            <TextInput
              accessibilityLabel="Name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={C.dim}
              autoComplete="name"
              maxLength={100}
              style={input}
            />
          )}
          <TextInput
            accessibilityLabel="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="Email address"
            placeholderTextColor={C.dim}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            style={input}
          />
          <TextInput
            accessibilityLabel="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Password (8+ characters)"
            placeholderTextColor={C.dim}
            secureTextEntry
            autoComplete={creating ? "new-password" : "current-password"}
            onSubmitEditing={() => void submit()}
            style={input}
          />
          {!!error && (
            <Text
              accessibilityRole="alert"
              style={{ color: C.red, lineHeight: 20 }}
            >
              {error}
            </Text>
          )}
          {!!notice && (
            <Text style={{ color: C.green, lineHeight: 20 }}>{notice}</Text>
          )}
          <Button
            title={creating ? "Create account" : "Sign in"}
            onPress={() => void submit()}
            loading={busy}
            style={{ marginTop: 2 }}
          />
          <Text
            style={{
              color: C.dim,
              fontSize: 12,
              textAlign: "center",
              lineHeight: 18,
              marginTop: 2,
            }}
          >
            Your private workspaces are protected by account-level access
            controls.
          </Text>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
