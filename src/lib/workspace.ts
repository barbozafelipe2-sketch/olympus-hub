import type { Database } from "../database.types";
import type { ModeId, Role } from "../types";
import { requireSupabase } from "./supabase";

type Conversation = Database["public"]["Tables"]["conversations"]["Row"];
type Message = Database["public"]["Tables"]["messages"]["Row"];
type Artifact = Database["public"]["Tables"]["artifacts"]["Row"];
type Task = Database["public"]["Tables"]["project_tasks"]["Row"];

export type ArtifactRow = Artifact;
export type TaskRow = Task;

function sourceMimeType(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    txt: "text/plain", md: "text/markdown", csv: "text/csv",
    json: "application/json", xml: "application/xml", html: "text/html"
  };
  return (extension && types[extension]) || "text/plain";
}

export async function listConversations(projectId: string | null = null) {
  const { data: authData } = await requireSupabase().auth.getUser();
  if (!authData.user) throw new Error("Sign in to load conversations.");

  let query = requireSupabase()
    .from("conversations")
    .select("*")
    .eq("owner_id", authData.user.id)
    .order("updated_at", { ascending: false })
    .limit(40);

  query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Conversation[];
}

export async function ensureConversation(input: {
  ownerId: string;
  projectId: string | null;
  mode: ModeId;
  firstMessage: string;
}) {
  if (input.projectId) {
    const { data: existing, error: lookupError } = await requireSupabase()
      .from("conversations")
      .select("*")
      .eq("owner_id", input.ownerId)
      .eq("project_id", input.projectId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return existing as Conversation;
  }

  const title = input.firstMessage.replace(/\s+/g, " ").trim().slice(0, 72) || "New chat";
  const { data, error } = await requireSupabase()
    .from("conversations")
    .insert({
      owner_id: input.ownerId,
      project_id: input.projectId,
      mode: input.mode,
      title
    })
    .select("*")
    .single();
  if (error) {
    // A second tab may create the permanent project chat at the same time.
    if (input.projectId && error.code === "23505") {
      const { data: raced, error: raceError } = await requireSupabase()
        .from("conversations")
        .select("*")
        .eq("owner_id", input.ownerId)
        .eq("project_id", input.projectId)
        .single();
      if (!raceError && raced) return raced as Conversation;
    }
    throw error;
  }
  return data as Conversation;
}

export async function loadMessages(conversationId: string) {
  const { data, error } = await requireSupabase()
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as Message[];
}

export async function addMessage(input: {
  ownerId: string;
  conversationId: string;
  role: Role;
  content: string;
  mode: ModeId;
}) {
  const { data, error } = await requireSupabase()
    .from("messages")
    .insert({
      owner_id: input.ownerId,
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      metadata: { mode: input.mode }
    })
    .select("*")
    .single();
  if (error) throw error;

  const { error: updateError } = await requireSupabase()
    .from("conversations")
    .update({ mode: input.mode, updated_at: new Date().toISOString() })
    .eq("id", input.conversationId)
    .eq("owner_id", input.ownerId);
  if (updateError) throw updateError;
  return data as Message;
}

export async function listArtifacts(conversationId: string | null, projectId: string | null) {
  let query = requireSupabase()
    .from("artifacts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(30);
  if (conversationId) query = query.eq("conversation_id", conversationId);
  else if (projectId) query = query.eq("project_id", projectId);
  else query = query.is("project_id", null).is("conversation_id", null);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Artifact[];
}

export async function saveArtifact(input: {
  ownerId: string;
  conversationId: string;
  projectId: string | null;
  name: string;
  content: string;
}) {
  const supabase = requireSupabase();
  const safeName = input.name.replace(/[^\p{L}\p{N} ._-]/gu, "-").trim().slice(0, 120) || "OlyHub answer";
  const name = `${safeName}.md`;
  const storagePath = `${input.ownerId}/${input.conversationId}/${crypto.randomUUID()}-${name}`;
  const file = new File([input.content], name, { type: "text/markdown;charset=utf-8" });
  const { error: uploadError } = await supabase.storage
    .from("olyhub-user-files")
    .upload(storagePath, file, { contentType: "text/markdown", upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("artifacts")
    .insert({
      owner_id: input.ownerId,
      conversation_id: input.conversationId,
      project_id: input.projectId,
      kind: "generated",
      name,
      mime_type: "text/markdown",
      size_bytes: new TextEncoder().encode(input.content).byteLength,
      storage_path: storagePath
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from("olyhub-user-files").remove([storagePath]);
    throw error;
  }
  return data as Artifact;
}

export async function uploadSource(input: {
  ownerId: string;
  conversationId: string;
  projectId: string | null;
  file: File;
}) {
  const supabase = requireSupabase();
  const storagePath = `${input.ownerId}/${input.conversationId}/${crypto.randomUUID()}-${input.file.name.replace(/[^\p{L}\p{N} ._-]/gu, "-")}`;
  const { error: uploadError } = await supabase.storage
    .from("olyhub-user-files")
    .upload(storagePath, input.file, { contentType: sourceMimeType(input.file), upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase
    .from("artifacts")
    .insert({
      owner_id: input.ownerId,
      conversation_id: input.conversationId,
      project_id: input.projectId,
      kind: "source",
      name: input.file.name,
      mime_type: sourceMimeType(input.file),
      size_bytes: input.file.size,
      storage_path: storagePath
    })
    .select("*")
    .single();
  if (error) {
    await supabase.storage.from("olyhub-user-files").remove([storagePath]);
    throw error;
  }
  return data as Artifact;
}

export async function signedArtifactUrl(storagePath: string) {
  const { data, error } = await requireSupabase()
    .storage.from("olyhub-user-files").createSignedUrl(storagePath, 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function listProjectTasks(projectId: string) {
  const { data, error } = await requireSupabase()
    .from("project_tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Task[];
}

export async function createProjectTask(input: { ownerId: string; projectId: string; title: string }) {
  const { data, error } = await requireSupabase()
    .from("project_tasks")
    .insert({ owner_id: input.ownerId, project_id: input.projectId, title: input.title.trim() })
    .select("*")
    .single();
  if (error) throw error;
  return data as Task;
}

export async function updateProjectTask(id: string, status: Task["status"]) {
  const { data, error } = await requireSupabase()
    .from("project_tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data as Task;
}

export async function deleteArtifact(artifact: Artifact) {
  const supabase = requireSupabase();
  const { error: storageError } = await supabase.storage
    .from("olyhub-user-files").remove([artifact.storage_path]);
  if (storageError) throw storageError;
  const { error } = await supabase.from("artifacts").delete().eq("id", artifact.id);
  if (error) throw error;
}
