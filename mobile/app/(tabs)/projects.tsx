import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useAuth } from "@/lib/auth";
import {
  getProjectConversation,
  modes,
  type NativeConversation,
} from "@/lib/chat";
import { requireSupabase } from "@/lib/supabase";
import { Button, C, Card, Screen, s } from "@/ui";

type Project = {
  id: string;
  name: string;
  goal: string;
  status: "active" | "archived";
  updated_at: string;
};

export default function ProjectsScreen() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data, error: queryError } = await requireSupabase()
        .from("projects")
        .select("id,name,goal,status,updated_at")
        .eq("status", showArchived ? "archived" : "active")
        .order("updated_at", { ascending: false });
      if (queryError) throw queryError;
      setRows((data ?? []) as Project[]);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load Projects.",
      );
    }
  }, [showArchived]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function createProject() {
    const projectName = name.trim();
    if (!projectName || !session?.user.id || creating) return;
    setCreating(true);
    setError("");
    try {
      const { data, error: insertError } = await requireSupabase()
        .from("projects")
        .insert({
          owner_id: session.user.id,
          name: projectName.slice(0, 120),
          goal: goal.trim().slice(0, 1600),
        })
        .select("id,name,goal,status,updated_at")
        .single();
      if (insertError) throw insertError;
      setRows((current) => [data as Project, ...current]);
      setName("");
      setGoal("");
      Alert.alert(
        "Project created",
        "Your new Project is ready. Open it to start its dedicated conversation.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not create this Project.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function openProject(project: Project) {
    if (!session?.user.id || busyId) return;
    setBusyId(project.id);
    setError("");
    try {
      router.push(`/project/${project.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not open this Project.",
      );
    } finally {
      setBusyId("");
    }
  }

  async function changeStatus(project: Project, status: "active" | "archived") {
    try {
      const { error: updateError } = await requireSupabase()
        .from("projects")
        .update({ status })
        .eq("id", project.id);
      if (updateError) throw updateError;
      setRows((current) => current.filter((item) => item.id !== project.id));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not update this Project.",
      );
    }
  }

  const field = {
    color: C.text,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    padding: 14,
    fontSize: 15,
  } as const;
  return (
    <Screen>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 12 }}
        ListHeaderComponent={
          <View style={{ gap: 18, paddingBottom: 4 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View>
                <Text
                  style={{ color: C.text, fontSize: 25, fontWeight: "800" }}
                >
                  Projects
                </Text>
                <Text style={{ color: C.muted, marginTop: 4 }}>
                  Long-running work, kept together.
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  setShowArchived((v) => !v);
                }}
              >
                <Text style={{ color: C.gold, fontWeight: "700" }}>
                  {showArchived ? "Active" : "Archived"}
                </Text>
              </Pressable>
            </View>
            <Card style={{ gap: 12 }}>
              <Text style={{ color: C.text, fontSize: 18, fontWeight: "800" }}>
                Create a Project
              </Text>
              <Text style={{ color: C.muted, lineHeight: 20 }}>
                Give Zeus a durable goal and a dedicated conversation for the
                work.
              </Text>
              <TextInput
                accessibilityLabel="Project name"
                value={name}
                onChangeText={setName}
                placeholder="Project name"
                placeholderTextColor={C.dim}
                maxLength={120}
                style={field}
              />
              <TextInput
                accessibilityLabel="Project goal"
                value={goal}
                onChangeText={setGoal}
                placeholder="What are you trying to accomplish?"
                placeholderTextColor={C.dim}
                multiline
                maxLength={1600}
                textAlignVertical="top"
                style={[field, { minHeight: 92 }]}
              />
              {!!error && (
                <Text
                  accessibilityRole="alert"
                  style={{ color: C.red, lineHeight: 20 }}
                >
                  {error}
                </Text>
              )}
              <Button
                title="Create Project"
                onPress={() => void createProject()}
                disabled={!name.trim()}
                loading={creating}
              />
            </Card>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 4,
              }}
            >
              <Text style={{ color: C.text, fontSize: 18, fontWeight: "800" }}>
                {showArchived ? "Archived Projects" : "Your Projects"}
              </Text>
              <Text style={{ color: C.dim }}>{rows.length}</Text>
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => void openProject(item)}
            disabled={Boolean(busyId)}
          >
            <Card style={{ gap: 12 }}>
              <View
                style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 13,
                    backgroundColor: C.goldSoft,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text
                    style={{ color: C.gold, fontSize: 19, fontWeight: "800" }}
                  >
                    ▦
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: C.text, fontSize: 16, fontWeight: "800" }}
                  >
                    {item.name}
                  </Text>
                  <Text style={{ color: C.dim, fontSize: 12, marginTop: 3 }}>
                    Updated {new Date(item.updated_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text style={{ color: C.dim, fontSize: 22 }}>›</Text>
              </View>
              {!!item.goal && (
                <Text
                  numberOfLines={3}
                  style={{ color: C.muted, lineHeight: 20 }}
                >
                  {item.goal}
                </Text>
              )}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderTopColor: C.line,
                  borderTopWidth: 1,
                  paddingTop: 10,
                }}
              >
                <Text
                  style={{ color: C.gold, fontSize: 12, fontWeight: "700" }}
                >
                  {busyId === item.id ? "Opening…" : "Open workspace"}
                </Text>
                <Text
                  onPress={(event) => {
                    event.stopPropagation?.();
                    void changeStatus(
                      item,
                      showArchived ? "active" : "archived",
                    );
                  }}
                  style={{ color: C.muted, fontSize: 12, fontWeight: "700" }}
                >
                  {showArchived ? "Restore" : "Archive"}
                </Text>
              </View>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={
          <Card style={{ alignItems: "center", paddingVertical: 26, gap: 8 }}>
            <Text style={{ color: C.text, fontWeight: "700" }}>
              {showArchived ? "No archived Projects" : "No Projects yet"}
            </Text>
            <Text
              style={{ color: C.muted, textAlign: "center", lineHeight: 20 }}
            >
              {showArchived
                ? "Archived work will appear here."
                : "Create one above to give ongoing work a home."}
            </Text>
          </Card>
        }
      />
    </Screen>
  );
}
