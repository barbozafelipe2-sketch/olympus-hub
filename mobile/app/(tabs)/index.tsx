import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth";
import {
  createConversation,
  listHomeConversations,
  type NativeConversation,
} from "@/lib/chat";
import { requireSupabase } from "@/lib/supabase";
import { Button, BrandMark, C, Card, Screen, s } from "@/ui";

export default function HomeScreen() {
  const { session } = useAuth();
  const [rows, setRows] = useState<NativeConversation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setError("");
      setRows(await listHomeConversations());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load your conversations.",
      );
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function newChat() {
    if (!session?.user.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const row = await createConversation(session.user.id, "zeus");
      router.push(`/chat/${row.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not start a chat.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 30, gap: 14 }}
        refreshControl={
          <RefreshControl
            tintColor={C.gold}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 22, paddingBottom: 6 }}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <BrandMark />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: C.text,
                    fontSize: 24,
                    fontWeight: "800",
                    letterSpacing: -0.5,
                  }}
                >
                  OlyHub
                </Text>
                <Text style={{ color: C.muted, marginTop: 2 }}>
                  Your AI workspace
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh"
                onPress={() => {
                  setRefreshing(true);
                  void load().finally(() => setRefreshing(false));
                }}
              >
                <Text style={{ color: C.gold, fontSize: 22 }}>↻</Text>
              </Pressable>
            </View>
            <Card
              style={{
                backgroundColor: "#191A1F",
                borderColor: "#4B422F",
                gap: 14,
              }}
            >
              <Text
                style={{
                  color: C.gold,
                  fontSize: 12,
                  fontWeight: "800",
                  letterSpacing: 1.4,
                }}
              >
                ONE PLACE FOR THE WORK
              </Text>
              <Text
                style={{
                  color: C.text,
                  fontSize: 25,
                  lineHeight: 31,
                  fontWeight: "800",
                  letterSpacing: -0.5,
                }}
              >
                Keep the goal.{"\n"}Keep the context.
              </Text>
              <Text style={{ color: C.muted, lineHeight: 21 }}>
                Start with Zeus for everyday work, or open a Project when you
                want a dedicated space for files, decisions and ongoing tasks.
              </Text>
              <Button
                title="＋   Start a new chat"
                onPress={() => void newChat()}
                loading={busy}
              />
            </Card>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Card style={{ flex: 1, padding: 14 }}>
                <Text
                  style={{ color: C.gold, fontSize: 20, fontWeight: "800" }}
                >
                  Zeus
                </Text>
                <Text
                  style={{
                    color: C.muted,
                    fontSize: 12,
                    lineHeight: 18,
                    marginTop: 4,
                  }}
                >
                  Your default assistant
                </Text>
              </Card>
              <Card style={{ flex: 1, padding: 14 }}>
                <Text
                  style={{ color: C.gold, fontSize: 20, fontWeight: "800" }}
                >
                  Olympus
                </Text>
                <Text
                  style={{
                    color: C.muted,
                    fontSize: 12,
                    lineHeight: 18,
                    marginTop: 4,
                  }}
                >
                  Multi-model council
                </Text>
              </Card>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 4,
              }}
            >
              <Text style={{ color: C.text, fontSize: 18, fontWeight: "800" }}>
                Recent conversations
              </Text>
              <Pressable onPress={() => void load()}>
                <Text style={{ color: C.gold, fontWeight: "700" }}>
                  Refresh
                </Text>
              </Pressable>
            </View>
            {!!error && (
              <Text accessibilityRole="alert" style={{ color: C.red }}>
                {error}
              </Text>
            )}
            {!rows.length && (
              <Card
                style={{ alignItems: "center", paddingVertical: 25, gap: 8 }}
              >
                <Text style={{ color: C.text, fontWeight: "700" }}>
                  Your history starts here
                </Text>
                <Text
                  style={{
                    color: C.muted,
                    textAlign: "center",
                    lineHeight: 20,
                  }}
                >
                  Chats remain available when you come back.
                </Text>
              </Card>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/chat/${item.id}`)}>
            <Card
              style={{
                flexDirection: "row",
                alignItems: "center",
                padding: 15,
                gap: 12,
              }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 12,
                  backgroundColor: C.goldSoft,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: C.gold, fontWeight: "900" }}>✦</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{ color: C.text, fontSize: 15, fontWeight: "700" }}
                >
                  {item.title}
                </Text>
                <Text style={{ color: C.dim, marginTop: 4, fontSize: 12 }}>
                  {item.mode.toUpperCase()} ·{" "}
                  {new Date(item.updated_at).toLocaleDateString()}
                </Text>
              </View>
              <Text style={{ color: C.dim, fontSize: 20 }}>›</Text>
            </Card>
          </Pressable>
        )}
        ListFooterComponent={
          busy ? (
            <ActivityIndicator color={C.gold} style={{ margin: 14 }} />
          ) : null
        }
      />
    </Screen>
  );
}
