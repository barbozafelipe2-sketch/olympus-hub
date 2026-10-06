import { z } from "zod";
import type { ChatMessage, ModeId } from "../../../src/types";
import { requireSupabase } from "./supabase";

const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL?.trim().replace(/\/$/, "");

export const modes: Array<{ id: ModeId; label: string; detail: string }> = [
  { id: "zeus", label: "Zeus", detail: "Smart routing with OpenAI fallback" },
  { id: "olympus", label: "Olympus", detail: "Multi-model council" },
];

const chatResponseSchema = z.object({
  reply: z.string().min(1),
  requestId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  fallbackUsed: z.boolean(),
  executionId: z.string().nullable(),
  trace: z.array(z.unknown()),
  orchestration: z.object({
    mode: z.enum(["zeus", "olympus"]),
    calls: z.number(),
    multiProvider: z.boolean(),
    degraded: z.boolean(),
  }),
  artifact: z.unknown().nullable(),
  capabilities: z.array(z.unknown()),
  sources: z.array(z.object({ title: z.string(), url: z.string().url() })),
  usage: z.object({ totalTokens: z.number() }),
  quota: z.unknown(),
  usageRecorded: z.boolean(),
});

export async function sendChat(input: {
  conversationId: string;
  messages: ChatMessage[];
  mode: ModeId;
  projectId?: string | null;
}) {
  if (!apiBase) throw new Error("The OlyHub API address is not configured.");
  const {
    data: { session },
    error,
  } = await requireSupabase().auth.getSession();
  if (error || !session?.access_token)
    throw new Error("Your session expired. Sign in again.");
  const response = await fetch(`${apiBase}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      mode: input.mode,
      conversationId: input.conversationId,
      projectContext: input.projectId
        ? {
            projectId: input.projectId,
            conversationId: input.conversationId,
          }
        : undefined,
      messages: input.messages
        .slice(-40)
        .map(({ role, content }) => ({ role, content })),
    }),
    signal: AbortSignal.timeout(90_000),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "OlyHub could not complete this request.";
    throw new Error(message);
  }
  const parsed = chatResponseSchema.safeParse(body);
  if (!parsed.success)
    throw new Error("OlyHub received an invalid server response.");
  return parsed.data;
}

export type NativeConversation = {
  id: string;
  owner_id: string;
  project_id: string | null;
  title: string;
  mode: ModeId;
  updated_at: string;
};

export async function listHomeConversations() {
  const { data, error } = await requireSupabase()
    .from("conversations")
    .select("id,owner_id,project_id,title,mode,updated_at")
    .is("project_id", null)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw error;
  return (data ?? []) as NativeConversation[];
}

export async function createConversation(
  ownerId: string,
  mode: ModeId,
  project?: { id: string; name: string },
) {
  const { data, error } = await requireSupabase()
    .from("conversations")
    .insert({
      owner_id: ownerId,
      project_id: project?.id ?? null,
      title: project?.name ?? "New chat",
      mode,
    })
    .select("id,owner_id,project_id,title,mode,updated_at")
    .single();
  if (error) throw error;
  return data as NativeConversation;
}

export async function getProjectConversation(
  ownerId: string,
  project: { id: string; name: string },
  mode: ModeId,
) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("conversations")
    .select("id,owner_id,project_id,title,mode,updated_at")
    .eq("project_id", project.id)
    .maybeSingle();
  if (error) throw error;
  if (data) return data as NativeConversation;
  try {
    return await createConversation(ownerId, mode, project);
  } catch (insertError) {
    const { data: raced, error: raceError } = await client
      .from("conversations")
      .select("id,owner_id,project_id,title,mode,updated_at")
      .eq("project_id", project.id)
      .maybeSingle();
    if (raceError || !raced) throw insertError;
    return raced as NativeConversation;
  }
}

export async function getConversation(id: string) {
  const { data, error } = await requireSupabase()
    .from("conversations")
    .select("id,owner_id,project_id,title,mode,updated_at")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as NativeConversation;
}

export async function getMessages(
  conversationId: string,
): Promise<ChatMessage[]> {
  const { data, error } = await requireSupabase()
    .from("messages")
    .select("id,role,content,created_at,metadata")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role === "assistant" ? "assistant" : "user",
    content: row.content,
    createdAt: row.created_at,
    sources: Array.isArray(row.metadata?.sources)
      ? (row.metadata.sources as ChatMessage["sources"])
      : [],
  }));
}

export async function persistMessage(input: {
  ownerId: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await requireSupabase()
    .from("messages")
    .insert({
      owner_id: input.ownerId,
      conversation_id: input.conversationId,
      role: input.role,
      content: input.content,
      metadata: input.metadata ?? {},
    })
    .select("id,role,content,created_at")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    role: data.role === "assistant" ? "assistant" : "user",
    content: data.content,
    createdAt: data.created_at,
  } as ChatMessage;
}

export async function updateConversation(
  id: string,
  patch: { mode?: ModeId; title?: string },
) {
  const { error } = await requireSupabase()
    .from("conversations")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
