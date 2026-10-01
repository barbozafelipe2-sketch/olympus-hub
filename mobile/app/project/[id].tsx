import { useCallback, useState } from "react";
import {
  Alert,
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File as NativeFile } from "expo-file-system";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/lib/auth";
import { getProjectConversation } from "@/lib/chat";
import { requireSupabase } from "@/lib/supabase";
import { Button, C, Card, Screen } from "@/ui";

type Project = {
  id: string;
  name: string;
  goal: string;
  status: string;
  updated_at: string;
};
type Task = {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: number;
};
type Memory = { id: string; content: string; kind: string; importance: number };
type ProjectFile = {
  id: string;
  name: string;
  size_bytes: number;
  mime_type: string;
  storage_path: string;
  bucket_id: string;
  created_at: string;
};
type Artifact = {
  id: string;
  title: string;
  mime_type: string;
  current_version: number;
  updated_at: string;
};
type Section = "overview" | "tasks" | "files" | "memory" | "artifacts";
const sectionLabels: Array<[Section, string]> = [
  ["overview", "Overview"],
  ["tasks", "Tasks"],
  ["files", "Files"],
  ["memory", "Memory"],
  ["artifacts", "Artifacts"],
];
const allowedFileTypes = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-m4a",
  "video/mp4",
];

export default function ProjectScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id;
  const { session } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [section, setSection] = useState<Section>("overview");
  const [taskDraft, setTaskDraft] = useState("");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryKind, setMemoryKind] = useState("fact");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    const client = requireSupabase();
    try {
      const [projectRes, taskRes, fileRes, memoryRes, artifactRes] =
        await Promise.all([
          client
            .from("projects")
            .select("id,name,goal,status,updated_at")
            .eq("id", projectId)
            .single(),
          client
            .from("project_tasks")
            .select("id,title,status,priority")
            .eq("project_id", projectId)
            .order("priority", { ascending: false }),
          client
            .from("project_files")
            .select(
              "id,name,size_bytes,mime_type,storage_path,bucket_id,created_at",
            )
            .eq("project_id", projectId)
            .order("created_at", { ascending: false }),
          client
            .from("project_memories")
            .select("id,content,kind,importance")
            .eq("project_id", projectId)
            .order("importance", { ascending: false }),
          client
            .from("artifacts")
            .select("id,title,mime_type,current_version,updated_at")
            .eq("project_id", projectId)
            .eq("status", "active")
            .order("updated_at", { ascending: false }),
        ]);
      const failed = [
        projectRes.error,
        taskRes.error,
        fileRes.error,
        memoryRes.error,
        artifactRes.error,
      ].find(Boolean);
      if (failed) throw failed;
      setProject(projectRes.data as Project);
      setTasks((taskRes.data ?? []) as Task[]);
      setFiles((fileRes.data ?? []) as ProjectFile[]);
      setMemories((memoryRes.data ?? []) as Memory[]);
      setArtifacts((artifactRes.data ?? []) as Artifact[]);
      setError("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not restore this Project.",
      );
    }
  }, [projectId]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function createTask() {
    const title = taskDraft.trim();
    if (!title || !session?.user.id) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: createError } = await requireSupabase()
        .from("project_tasks")
        .insert({
          owner_id: session.user.id,
          project_id: projectId,
          title: title.slice(0, 240),
          status: "todo",
          priority: 1,
        })
        .select("id,title,status,priority")
        .single();
      if (createError) throw createError;
      setTasks((current) => [...current, data as Task]);
      setTaskDraft("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save the task.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cycleTask(task: Task) {
    const next =
      task.status === "todo"
        ? "in_progress"
        : task.status === "in_progress"
          ? "done"
          : "todo";
    try {
      const { error: updateError } = await requireSupabase()
        .from("project_tasks")
        .update({ status: next })
        .eq("id", task.id);
      if (updateError) throw updateError;
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, status: next } : item,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not update the task.",
      );
    }
  }

  async function removeTask(task: Task) {
    Alert.alert("Delete this task?", task.title, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const { error: deleteError } = await requireSupabase()
              .from("project_tasks")
              .delete()
              .eq("id", task.id);
            if (deleteError) {
              setError(deleteError.message);
              return;
            }
            setTasks((current) =>
              current.filter((item) => item.id !== task.id),
            );
          })();
        },
      },
    ]);
  }

  async function addMemory() {
    const content = memoryDraft.trim();
    if (!content || !session?.user.id) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: insertError } = await requireSupabase()
        .from("project_memories")
        .insert({
          owner_id: session.user.id,
          project_id: projectId,
          kind: memoryKind,
          content: content.slice(0, 1500),
          importance: 3,
        })
        .select("id,content,kind,importance")
        .single();
      if (insertError) throw insertError;
      setMemories((current) => [data as Memory, ...current]);
      setMemoryDraft("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save this memory.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeMemory(memory: Memory) {
    Alert.alert("Remove saved memory?", memory.content.slice(0, 100), [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const { error: deleteError } = await requireSupabase()
              .from("project_memories")
              .delete()
              .eq("id", memory.id);
            if (deleteError) {
              setError(deleteError.message);
              return;
            }
            setMemories((current) =>
              current.filter((item) => item.id !== memory.id),
            );
          })();
        },
      },
    ]);
  }

  async function pickFiles() {
    if (!session?.user.id || busy) return;
    setError("");
    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: true,
        copyToCacheDirectory: true,
        type: allowedFileTypes,
      });
      if (result.canceled) return;
      if (result.assets.length > 8)
        throw new Error("Select up to 8 files at a time.");
      setBusy(true);
      for (const asset of result.assets) {
        const mime = asset.mimeType?.trim();
        if (!mime)
          throw new Error(`${asset.name} has an unsupported file type.`);
        const safeName =
          asset.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 180) || "file";
        const path = `${session.user.id}/${projectId}/${crypto.randomUUID()}-${safeName}`;
        const localFile = new NativeFile(asset.uri);
        const size = asset.size ?? localFile.size;
        if (size > 20 * 1024 * 1024)
          throw new Error(`${asset.name} is larger than 20 MB.`);
        const client = requireSupabase();
        const { error: uploadError } = await client.storage
          .from("project-files")
          .upload(path, localFile, {
            cacheControl: "3600",
            contentType: mime,
            upsert: false,
          });
        if (uploadError) throw uploadError;
        const { data, error: rowError } = await client
          .from("project_files")
          .insert({
            owner_id: session.user.id,
            project_id: projectId,
            storage_path: path,
            name: safeName,
            mime_type: mime,
            size_bytes: size,
          })
          .select(
            "id,name,size_bytes,mime_type,storage_path,bucket_id,created_at",
          )
          .single();
        if (rowError) {
          await client.storage.from("project-files").remove([path]);
          throw rowError;
        }
        setFiles((current) => [data as ProjectFile, ...current]);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? `File upload failed: ${caught.message}`
          : "File upload failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteFile(file: ProjectFile) {
    Alert.alert("Delete this Project file?", file.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void (async () => {
            const client = requireSupabase();
            const { error: storageError } = await client.storage
              .from(file.bucket_id)
              .remove([file.storage_path]);
            if (storageError) {
              setError(storageError.message);
              return;
            }
            const { error: rowError } = await client
              .from("project_files")
              .delete()
              .eq("id", file.id);
            if (rowError) {
              setError(rowError.message);
              return;
            }
            setFiles((current) =>
              current.filter((item) => item.id !== file.id),
            );
          })();
        },
      },
    ]);
  }

  async function openFile(file: ProjectFile) {
    const { data, error: signedError } = await requireSupabase()
      .storage.from(file.bucket_id)
      .createSignedUrl(file.storage_path, 900);
    if (signedError) {
      setError(signedError.message);
      return;
    }
    await Linking.openURL(data.signedUrl);
  }

  async function openArtifact(artifact: Artifact) {
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
      const { data, error: contentError } = await client
        .from("artifact_versions")
        .select("content")
        .eq("artifact_id", artifact.id)
        .eq("version", artifact.current_version)
        .single();
      if (contentError) throw contentError;
      await Share.share({ title: artifact.title, message: data.content });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not open this artifact.",
      );
    }
  }

  async function openChat() {
    if (!session?.user.id || !project) return;
    setBusy(true);
    try {
      const row = await getProjectConversation(
        session.user.id,
        project,
        "zeus",
      );
      router.push(`/chat/${row.id}`);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not open the Project chat.",
      );
    } finally {
      setBusy(false);
    }
  }

  const field = {
    color: C.text,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  } as const;
  return (
    <Screen>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: C.line,
          }}
        >
          <Pressable
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
              style={{
                color: C.muted,
                fontSize: 10,
                fontWeight: "800",
                letterSpacing: 1,
              }}
            >
              PROJECT
            </Text>
            <Text
              numberOfLines={1}
              style={{
                color: C.text,
                fontSize: 18,
                fontWeight: "800",
                marginTop: 2,
              }}
            >
              {project?.name ?? "Loading…"}
            </Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{
            maxHeight: 54,
            borderBottomWidth: 1,
            borderBottomColor: C.line,
          }}
          contentContainerStyle={{
            paddingHorizontal: 14,
            alignItems: "center",
            gap: 7,
          }}
        >
          {sectionLabels.map(([id, label]) => (
            <Pressable
              key={id}
              onPress={() => setSection(id)}
              style={{
                backgroundColor: section === id ? C.goldSoft : "transparent",
                borderRadius: 20,
                paddingHorizontal: 13,
                paddingVertical: 8,
              }}
            >
              <Text
                style={{
                  color: section === id ? C.gold : C.muted,
                  fontWeight: "800",
                  fontSize: 12,
                }}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
        {!!error && (
          <Text
            accessibilityRole="alert"
            style={{
              color: C.red,
              backgroundColor: "#3A2024",
              margin: 14,
              padding: 11,
              borderRadius: 10,
            }}
          >
            {error}
          </Text>
        )}
        {!project ? (
          <View style={{ flex: 1, justifyContent: "center" }}>
            <Text style={{ color: C.muted, textAlign: "center" }}>
              Loading Project…
            </Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingBottom: 30, gap: 14 }}
          >
            {section === "overview" && (
              <>
                <Card style={{ gap: 12 }}>
                  <Text
                    style={{
                      color: C.gold,
                      fontWeight: "800",
                      fontSize: 12,
                      letterSpacing: 1,
                    }}
                  >
                    DURABLE WORKSPACE
                  </Text>
                  <Text
                    style={{ color: C.text, fontSize: 24, fontWeight: "800" }}
                  >
                    {project.name}
                  </Text>
                  <Text style={{ color: C.muted, lineHeight: 21 }}>
                    {project.goal ||
                      "No goal set. Edit this Project on the web app to add one."}
                  </Text>
                  <Button
                    title="Open Project conversation"
                    onPress={() => void openChat()}
                    loading={busy}
                  />
                </Card>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {(
                    [
                      ["Tasks", tasks.length, "tasks"],
                      ["Files", files.length, "files"],
                      ["Memory", memories.length, "memory"],
                      ["Artifacts", artifacts.length, "artifacts"],
                    ] as const
                  ).map(([label, count, target]) => (
                    <Pressable
                      key={label}
                      onPress={() => setSection(target)}
                      style={{ flex: 1 }}
                    >
                      <Card
                        style={{ padding: 12, alignItems: "center", gap: 3 }}
                      >
                        <Text
                          style={{
                            color: C.gold,
                            fontSize: 21,
                            fontWeight: "800",
                          }}
                        >
                          {count}
                        </Text>
                        <Text style={{ color: C.muted, fontSize: 11 }}>
                          {label}
                        </Text>
                      </Card>
                    </Pressable>
                  ))}
                </View>
                <Card style={{ gap: 7 }}>
                  <Text
                    style={{ color: C.text, fontSize: 16, fontWeight: "800" }}
                  >
                    Latest activity
                  </Text>
                  <Text style={{ color: C.muted }}>
                    This Project keeps its conversation, approved memory, tasks,
                    files and generated artifacts in one place.
                  </Text>
                </Card>
              </>
            )}
            {section === "tasks" && (
              <>
                <Card style={{ gap: 11 }}>
                  <Text
                    style={{ color: C.text, fontSize: 19, fontWeight: "800" }}
                  >
                    Project tasks
                  </Text>
                  <Text style={{ color: C.muted }}>
                    Zeus and Olympus can use these tasks as project context.
                  </Text>
                  <TextInput
                    accessibilityLabel="Next action"
                    value={taskDraft}
                    onChangeText={setTaskDraft}
                    maxLength={240}
                    placeholder="Next action…"
                    placeholderTextColor={C.dim}
                    style={field}
                  />
                  <Button
                    title="Add task"
                    onPress={() => void createTask()}
                    loading={busy}
                    disabled={!taskDraft.trim()}
                  />
                </Card>
                {tasks.map((task) => (
                  <Card
                    key={task.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 13,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void cycleTask(task)}
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 12,
                        backgroundColor:
                          task.status === "done" ? "#18372E" : C.raised,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: task.status === "done" ? C.green : C.gold,
                          fontWeight: "900",
                        }}
                      >
                        {task.status === "done"
                          ? "✓"
                          : task.status === "in_progress"
                            ? "◷"
                            : "○"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void cycleTask(task)}
                      style={{ flex: 1 }}
                    >
                      <Text
                        style={{
                          color: task.status === "done" ? C.dim : C.text,
                          textDecorationLine:
                            task.status === "done" ? "line-through" : "none",
                          fontWeight: "700",
                        }}
                      >
                        {task.title}
                      </Text>
                      <Text
                        style={{ color: C.dim, fontSize: 11, marginTop: 4 }}
                      >
                        {task.status.replace("_", " ")}
                      </Text>
                    </Pressable>
                    <Text
                      onPress={() => removeTask(task)}
                      style={{ color: C.dim, padding: 8 }}
                    >
                      Delete
                    </Text>
                  </Card>
                ))}
              </>
            )}
            {section === "files" && (
              <>
                <Card style={{ gap: 11 }}>
                  <Text
                    style={{ color: C.text, fontSize: 19, fontWeight: "800" }}
                  >
                    Project files
                  </Text>
                  <Text style={{ color: C.muted, lineHeight: 19 }}>
                    Private files stay in this Project. Supported text,
                    Markdown, CSV and JSON files can be read by the Project
                    assistant.
                  </Text>
                  <Button
                    title="Choose files from device"
                    onPress={() => void pickFiles()}
                    loading={busy}
                  />
                </Card>
                {files.map((file) => (
                  <Card
                    key={file.id}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      padding: 13,
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        numberOfLines={1}
                        style={{ color: C.text, fontWeight: "700" }}
                      >
                        {file.name}
                      </Text>
                      <Text
                        style={{ color: C.dim, fontSize: 11, marginTop: 4 }}
                      >
                        {file.size_bytes < 1024 * 1024
                          ? `${Math.max(1, Math.round(file.size_bytes / 1024))} KB`
                          : `${(file.size_bytes / 1048576).toFixed(1)} MB`}{" "}
                        · {file.mime_type}
                      </Text>
                    </View>
                    <Text
                      onPress={() => void openFile(file)}
                      style={{ color: C.gold, padding: 6 }}
                    >
                      Open
                    </Text>
                    <Text
                      onPress={() => deleteFile(file)}
                      style={{ color: C.red, padding: 6 }}
                    >
                      Delete
                    </Text>
                  </Card>
                ))}
              </>
            )}
            {section === "memory" && (
              <>
                <Card style={{ gap: 11 }}>
                  <Text
                    style={{ color: C.text, fontSize: 19, fontWeight: "800" }}
                  >
                    Approved memory
                  </Text>
                  <Text style={{ color: C.muted, lineHeight: 19 }}>
                    Only facts you explicitly save become durable Project
                    memory. Remove anything you no longer want retained.
                  </Text>
                  <View
                    style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}
                  >
                    {[
                      "fact",
                      "preference",
                      "decision",
                      "outcome",
                      "instruction",
                    ].map((kind) => (
                      <Pressable
                        key={kind}
                        onPress={() => setMemoryKind(kind)}
                        style={{
                          backgroundColor:
                            memoryKind === kind ? C.goldSoft : C.raised,
                          borderRadius: 18,
                          paddingHorizontal: 10,
                          paddingVertical: 7,
                        }}
                      >
                        <Text
                          style={{
                            color: memoryKind === kind ? C.gold : C.muted,
                            fontSize: 11,
                            fontWeight: "700",
                          }}
                        >
                          {kind}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <TextInput
                    accessibilityLabel="Memory content"
                    value={memoryDraft}
                    onChangeText={setMemoryDraft}
                    placeholder="A useful fact, preference or decision…"
                    placeholderTextColor={C.dim}
                    maxLength={1500}
                    multiline
                    style={[field, { minHeight: 92, textAlignVertical: "top" }]}
                  />
                  <Button
                    title="Save approved memory"
                    onPress={() => void addMemory()}
                    loading={busy}
                    disabled={!memoryDraft.trim()}
                  />
                </Card>
                {memories.map((memory) => (
                  <Card key={memory.id} style={{ gap: 7, padding: 14 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          color: C.gold,
                          fontSize: 11,
                          fontWeight: "800",
                          textTransform: "uppercase",
                        }}
                      >
                        {memory.kind} · importance {memory.importance}/5
                      </Text>
                      <Text
                        onPress={() => removeMemory(memory)}
                        style={{ color: C.red, fontSize: 12 }}
                      >
                        Remove
                      </Text>
                    </View>
                    <Text style={{ color: C.text, lineHeight: 20 }}>
                      {memory.content}
                    </Text>
                  </Card>
                ))}
              </>
            )}
            {section === "artifacts" && (
              <>
                <Card style={{ gap: 8 }}>
                  <Text
                    style={{ color: C.text, fontSize: 19, fontWeight: "800" }}
                  >
                    Generated artifacts
                  </Text>
                  <Text style={{ color: C.muted, lineHeight: 19 }}>
                    Deliverables created in this Project are saved with
                    versions. Select a text artifact to share its current
                    version.
                  </Text>
                </Card>
                {artifacts.map((artifact) => (
                  <Pressable
                    key={artifact.id}
                    onPress={() => void openArtifact(artifact)}
                  >
                    <Card
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 11,
                        padding: 14,
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
                        <Text style={{ color: C.gold, fontWeight: "900" }}>
                          ▤
                        </Text>
                      </View>
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
                      <Text style={{ color: C.gold }}>Share</Text>
                    </Card>
                  </Pressable>
                ))}
              </>
            )}
          </ScrollView>
        )}
      </View>
    </Screen>
  );
}
