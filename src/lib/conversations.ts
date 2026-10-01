import type { Database, Json } from "../database.types";
import type { ApiSource, ChatMessage, ModeId } from "../types";
import { requireSupabase } from "./supabase";

export type ConversationRow =
  Database["public"]["Tables"]["conversations"]["Row"];

export type MessageRow =
  Database["public"]["Tables"]["messages"]["Row"];


function sourcesFromMetadata(metadata: Json): ApiSource[] {
  if (!metadata || Array.isArray(metadata) || typeof metadata !== "object") {
    return [];
  }

  const value = metadata.sources;
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (source): source is { title: string; url: string } =>
        Boolean(
          source &&
            !Array.isArray(source) &&
            typeof source === "object" &&
            typeof source.title === "string" &&
            typeof source.url === "string"
        )
    )
    .map((source) => ({
      title: source.title.slice(0, 300),
      url: source.url
    }))
    .slice(0, 12);
}

export async function getOrCreateProjectConversation(input: {
  ownerId: string;
  projectId: string;
  projectName: string;
  mode: ModeId;
}): Promise<ConversationRow> {
  const client = requireSupabase();

  const { data: existing, error: lookupError } = await client
    .from("conversations")
    .select("*")
    .eq("project_id", input.projectId)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    return existing;
  }

  const { data, error } = await client
    .from("conversations")
    .insert({
      owner_id: input.ownerId,
      project_id: input.projectId,
      title: input.projectName.slice(0, 160),
      mode: input.mode
    })
    .select("*")
    .single();

  if (error) {
    const { data: raced, error: racedError } = await client
      .from("conversations")
      .select("*")
      .eq("project_id", input.projectId)
      .maybeSingle();

    if (racedError || !raced) throw error;
    return raced;
  }

  return data;
}

export async function setConversationMode(
  conversationId: string,
  mode: ModeId
): Promise<void> {
  const { error } = await requireSupabase()
    .from("conversations")
    .update({ mode })
    .eq("id", conversationId);

  if (error) throw error;
}

export async function loadConversationMessages(
  conversationId: string
): Promise<ChatMessage[]> {
  const { data, error } = await requireSupabase()
    .from("messages")
    .select("id, role, content, created_at, metadata")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    createdAt: row.created_at,
    sources: sourcesFromMetadata(row.metadata)
  }));
}

export async function persistMessage(input: {
  conversationId: string;
  ownerId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Json;
}): Promise<ChatMessage> {
  const { data, error } = await requireSupabase()
    .from("messages")
    .insert({
      conversation_id: input.conversationId,
      owner_id: input.ownerId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {}
    })
    .select("id, role, content, created_at, metadata")
    .single();

  if (error) throw error;

  return {
    id: data.id,
    role: data.role === "assistant" ? "assistant" : "user",
    content: data.content,
    createdAt: data.created_at,
    sources: sourcesFromMetadata(data.metadata)
  };
}

export async function touchConversationAndProject(input: {
  conversationId: string;
  projectId: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const client = requireSupabase();

  const [conversationResult, projectResult] = await Promise.all([
    client
      .from("conversations")
      .update({ updated_at: now })
      .eq("id", input.conversationId),
    client.from("projects").update({ updated_at: now }).eq("id", input.projectId)
  ]);

  if (conversationResult.error) throw conversationResult.error;
  if (projectResult.error) throw projectResult.error;
}


export async function listHomeConversations(
  limit = 8
): Promise<ConversationRow[]> {
  const { data, error } = await requireSupabase()
    .from("conversations")
    .select("*")
    .is("project_id", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ?? [];
}

export async function createHomeConversation(input: {
  ownerId: string;
  mode: ModeId;
  title?: string;
}): Promise<ConversationRow> {
  const { data, error } = await requireSupabase()
    .from("conversations")
    .insert({
      owner_id: input.ownerId,
      project_id: null,
      title: (input.title || "New chat").slice(0, 160),
      mode: input.mode
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function renameConversation(
  conversationId: string,
  title: string
): Promise<void> {
  const { error } = await requireSupabase()
    .from("conversations")
    .update({
      title: title.trim().slice(0, 160) || "New chat",
      updated_at: new Date().toISOString()
    })
    .eq("id", conversationId);

  if (error) throw error;
}

export async function touchConversation(
  conversationId: string
): Promise<void> {
  const { error } = await requireSupabase()
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  if (error) throw error;
}
