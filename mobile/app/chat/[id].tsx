import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/lib/auth";
import { hasAiProviderConsent, grantAiProviderConsent } from "@/lib/ai-consent";
import { AiDataConsentModal } from "@/components/AiDataConsentModal";
import {
  getConversation,
  getMessages,
  modes,
  persistMessage,
  sendChat,
  updateConversation,
  type NativeConversation,
} from "@/lib/chat";
import { requireSupabase } from "@/lib/supabase";
import type { ChatMessage, ModeId } from "../../../src/types";
import { Button, C, Card, Screen } from "@/ui";

type NativeArtifact = {
  id: string;
  title: string;
  mime_type: string;
  current_version: number;
  updated_at: string;
};

export default function ChatScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const conversationId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { session } = useAuth();
  const [conversation, setConversation] = useState<NativeConversation | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [artifacts, setArtifacts] = useState<NativeArtifact[]>([]);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<ModeId>("zeus");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [runLabel, setRunLabel] = useState("");
  const [consentOpen, setConsentOpen] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const activeMode = useMemo(
    () => modes.find((item) => item.id === mode) ?? modes[0],
    [mode],
  );

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError("");
    try {
      const [row, history, artifactResult] = await Promise.all([
        getConversation(conversationId),
        getMessages(conversationId),
        requireSupabase()
          .from("artifacts")
          .select("id,title,mime_type,current_version,updated_at")
          .eq("conversation_id", conversationId)
          .eq("status", "active")
          .order("updated_at", { ascending: false }),
      ]);
      if (artifactResult.error) throw artifactResult.error;
      setConversation(row);
      setMode(modes.some((item) => item.id === row.mode) ? row.mode : "zeus");
      setMessages(history);
      setArtifacts((artifactResult.data ?? []) as NativeArtifact[]);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not restore this conversation.",
      );
    } finally {
      setLoading(false);
    }
  }, [conversationId]);
  useEffect(() => {
    void load();
  }, [load]);

  async function chooseMode(next: ModeId) {
    if (sending || next === mode) return;
    const previous = mode;
    setMode(next);
    setError("");
    try {
      await updateConversation(conversationId, { mode: next });
    } catch (caught) {
      setMode(previous);
      setError(
        caught instanceof Error ? caught.message : "Could not save this mode.",
      );
    }
  }

  async function submit() {
    const content = prompt.trim();
    if (!content || sending || loading || !session?.user.id || !conversation)
      return;
    if (!hasAiProviderConsent(session.user.id)) {
      setConsentOpen(true);
      return;
    }
    setPrompt("");
    setError("");
    setRunLabel("");
    setSending(true);
    let saved = false;
    try {
      const userRow = await persistMessage({
        ownerId: session.user.id,
        conversationId,
        role: "user",
        content,
      });
      saved = true;
      const next = [...messages, userRow];
      setMessages(next);
      const title = content.replace(/\s+/g, " ").slice(0, 72);
      if (conversation.title === "New chat") {
        await updateConversation(conversationId, { title });
        setConversation({ ...conversation, title });
      }
      const result = await sendChat({
        conversationId,
        mode,
        projectId: conversation.project_id,
        messages: next,
      });
      const assistant = await persistMessage({
        ownerId: session.user.id,
        conversationId,
        role: "assistant",
        content: result.reply,
        metadata: {
          request_id: result.requestId,
          execution_id: result.executionId,
          provider: result.provider,
          model: result.model,
          fallback_used: result.fallbackUsed,
          orchestration: result.orchestration,
          trace: result.trace,
          sources: result.sources,
        },
      });
      setMessages((current) => [
        ...current,
        { ...assistant, sources: result.sources },
      ]);
      if (result.artifact) {
        const { data, error: artifactError } = await requireSupabase()
          .from("artifacts")
          .select("id,title,mime_type,current_version,updated_at")
          .eq("conversation_id", conversationId)
          .eq("status", "active")
          .order("updated_at", { ascending: false });
        if (!artifactError) setArtifacts((data ?? []) as NativeArtifact[]);
      }
      setRunLabel(
        `${result.provider} · ${result.model}${result.fallbackUsed ? " · fallback" : ""}${result.orchestration.degraded ? " · degraded" : ""}`,
      );
      await updateConversation(conversationId, { mode });
    } catch (caught) {
      setError(
        `${saved ? "Your message is saved. " : ""}${caught instanceof Error ? caught.message : "OlyHub could not complete this request."}`,
      );
    } finally {
      setSending(false);
    }
  }

  async function shareArtifact(artifact: NativeArtifact) {
    try {
      const client = requireSupabase();
      if (artifact.mime_type.startsWith("image/")) {
        const { data: file, error: fileError } = await client
          .from("artifact_files")
          .select("bucket_id,storage_path")
          .eq("artifact_id", artifact.id)
          .eq("version", artifact.current_version)
          .single();
        if (fileError) throw fileError;
        const { data, error: signedError } = await client.storage
          .from(file.bucket_id)
          .createSignedUrl(file.storage_path, 900);
        if (signedError) throw signedError;
        await Linking.openURL(data.signedUrl);
        return;
      }
      const { data, error } = await client
        .from("artifact_versions")
        .select("content")
        .eq("artifact_id", artifact.id)
        .eq("version", artifact.current_version)
        .single();
      if (error) throw error;
      await Share.share({ title: artifact.title, message: data.content });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not open this artifact.",
      );
    }
  }

  function confirmDeleteArtifact(artifact: NativeArtifact) {
    Alert.alert(
      "Delete this artifact?",
      `${artifact.title} · version ${artifact.current_version}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                const client = requireSupabase();
                const { data: files, error: filesError } = await client
                  .from("artifact_files")
                  .select("bucket_id,storage_path")
                  .eq("artifact_id", artifact.id);
                if (filesError) throw filesError;
                for (const file of files ?? []) {
                  const { error: removeError } = await client.storage
                    .from(file.bucket_id)
                    .remove([file.storage_path]);
                  if (removeError) throw removeError;
                }
                const { error: deleteError } = await client
                  .from("artifacts")
                  .delete()
                  .eq("id", artifact.id);
                if (deleteError) throw deleteError;
                setArtifacts((current) =>
                  current.filter((item) => item.id !== artifact.id),
                );
              } catch (caught) {
                setError(
                  caught instanceof Error
                    ? caught.message
                    : "Could not delete this artifact.",
                );
              }
            })();
          },
        },
      ],
    );
  }

  const welcome: ChatMessage = {
    id: "welcome",
    role: "assistant",
    content: conversation?.project_id
      ? `Welcome to ${conversation.title}. This is the dedicated conversation for your Project.`
      : "Welcome to OlyHub. What would you like to work on?",
    createdAt: new Date().toISOString(),
  };
  const visible = messages.length ? messages : [welcome];

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={2}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: C.line,
            paddingHorizontal: 16,
            paddingVertical: 12,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              backgroundColor: C.raised,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ color: C.text, fontSize: 22 }}>‹</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{ color: C.text, fontSize: 16, fontWeight: "800" }}
            >
              {conversation?.title ?? "Conversation"}
            </Text>
            <Text style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
              {conversation?.project_id ? "Project workspace" : "Private chat"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reload conversation"
            onPress={() => void load()}
          >
            <Text style={{ color: C.gold, fontSize: 20 }}>↻</Text>
          </Pressable>
        </View>
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: C.line,
            paddingVertical: 10,
          }}
        >
          <FlatList
            horizontal
            data={modes}
            keyExtractor={(item) => item.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: mode === item.id }}
                onPress={() => void chooseMode(item.id)}
                style={{
                  backgroundColor: mode === item.id ? C.goldSoft : C.surface,
                  borderWidth: 1,
                  borderColor: mode === item.id ? "#78663E" : C.line,
                  borderRadius: 22,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                }}
              >
                <Text
                  style={{
                    color: mode === item.id ? C.gold : C.muted,
                    fontSize: 12,
                    fontWeight: "800",
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            )}
          />
        </View>
        {!!error && (
          <View
            style={{
              marginHorizontal: 14,
              marginTop: 10,
              backgroundColor: "#3A2024",
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text
              accessibilityRole="alert"
              style={{ color: "#FFC5C5", lineHeight: 19 }}
            >
              {error}
            </Text>
          </View>
        )}
        {!!runLabel && (
          <Text
            style={{
              color: C.dim,
              fontSize: 11,
              paddingHorizontal: 16,
              paddingTop: 8,
            }}
          >
            Last run: {runLabel}
          </Text>
        )}
        {loading ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              gap: 12,
            }}
          >
            <ActivityIndicator color={C.gold} />
            <Text style={{ color: C.muted }}>Restoring conversation…</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={visible}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 20 }}
            onContentSizeChange={() =>
              listRef.current?.scrollToEnd({ animated: true })
            }
            renderItem={({ item }) => (
              <View
                style={{
                  alignItems: item.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <View
                  style={{
                    maxWidth: "90%",
                    backgroundColor: item.role === "user" ? C.user : C.surface,
                    borderRadius: 18,
                    borderTopRightRadius: item.role === "user" ? 5 : 18,
                    borderTopLeftRadius: item.role === "assistant" ? 5 : 18,
                    borderWidth: 1,
                    borderColor: item.role === "user" ? "#34415B" : C.line,
                    padding: 14,
                  }}
                >
                  <Text
                    selectable
                    style={{ color: C.text, fontSize: 15, lineHeight: 23 }}
                  >
                    {item.content}
                  </Text>
                </View>
                {!!item.sources?.length && (
                  <View style={{ width: "90%", paddingTop: 8, gap: 6 }}>
                    {item.sources.map((source, index) => (
                      <Pressable
                        key={`${source.url}-${index}`}
                        onPress={() => void Linking.openURL(source.url)}
                      >
                        <Text
                          numberOfLines={2}
                          style={{ color: C.gold, fontSize: 12 }}
                        >
                          ↗ {source.title || source.url}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            )}
            ListFooterComponent={
              <View style={{ gap: 12, paddingTop: 6 }}>
                {sending && (
                  <View
                    style={{
                      alignSelf: "flex-start",
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 9,
                      backgroundColor: C.surface,
                      borderRadius: 15,
                      padding: 13,
                      borderWidth: 1,
                      borderColor: C.line,
                    }}
                  >
                    <ActivityIndicator color={C.gold} size="small" />
                    <Text style={{ color: C.muted, fontSize: 13 }}>
                      {activeMode.label} is working…
                    </Text>
                  </View>
                )}
                {!!artifacts.length && (
                  <View style={{ gap: 8 }}>
                    <Text
                      style={{
                        color: C.muted,
                        fontSize: 11,
                        fontWeight: "800",
                        letterSpacing: 0.8,
                      }}
                    >
                      SAVED ARTIFACTS
                    </Text>
                    {artifacts.map((artifact) => (
                      <Card
                        key={artifact.id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          padding: 12,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={{ color: C.text, fontWeight: "700" }}
                          >
                            {artifact.title}
                          </Text>
                          <Text
                            style={{ color: C.dim, fontSize: 11, marginTop: 4 }}
                          >
                            {artifact.mime_type} · v{artifact.current_version}
                          </Text>
                        </View>
                        <Text
                          onPress={() => void shareArtifact(artifact)}
                          style={{
                            color: C.gold,
                            padding: 7,
                            fontWeight: "700",
                          }}
                        >
                          Share
                        </Text>
                        <Text
                          onPress={() => confirmDeleteArtifact(artifact)}
                          style={{ color: C.red, padding: 7 }}
                        >
                          Delete
                        </Text>
                      </Card>
                    ))}
                  </View>
                )}
              </View>
            }
          />
        )}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: C.line,
            padding: 12,
            paddingBottom: Platform.OS === "ios" ? 10 : 12,
            backgroundColor: C.bg,
          }}
        >
          <TextInput
            accessibilityLabel="Message"
            value={prompt}
            onChangeText={setPrompt}
            placeholder={
              conversation?.project_id
                ? `Message ${conversation.title}…`
                : "Message OlyHub…"
            }
            placeholderTextColor={C.dim}
            multiline
            maxLength={20000}
            editable={!sending && !loading}
            onSubmitEditing={() => void submit()}
            blurOnSubmit={false}
            returnKeyType="send"
            style={{
              maxHeight: 140,
              minHeight: 50,
              color: C.text,
              backgroundColor: C.surface,
              borderColor: C.line,
              borderWidth: 1,
              borderRadius: 17,
              paddingHorizontal: 15,
              paddingVertical: 13,
              fontSize: 15,
              lineHeight: 21,
            }}
          />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: 9,
            }}
          >
            <Text
              numberOfLines={1}
              style={{ color: C.dim, fontSize: 11, flex: 1, marginRight: 12 }}
            >
              {activeMode.detail}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              disabled={!prompt.trim() || sending || loading}
              onPress={() => void submit()}
              style={{
                backgroundColor: !prompt.trim() || sending ? C.raised : C.gold,
                width: 46,
                height: 42,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: !prompt.trim() || sending ? C.dim : C.bg,
                  fontWeight: "900",
                  fontSize: 18,
                }}
              >
                {sending ? "…" : "↑"}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
      <AiDataConsentModal
        visible={consentOpen}
        onDismiss={() => setConsentOpen(false)}
        onAccept={() => {
          if (!session?.user.id) return;
          grantAiProviderConsent(session.user.id);
          setConsentOpen(false);
          void submit();
        }}
      />
    </Screen>
  );
}
