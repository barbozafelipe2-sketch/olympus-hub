import type { Database } from "../database.types";
import { requireSupabase } from "./supabase";

export type MemoryRow =
  Database["public"]["Tables"]["project_memories"]["Row"];

export type MemoryKind =
  | "fact"
  | "preference"
  | "decision"
  | "outcome"
  | "instruction";

export async function listProjectMemories(projectId: string): Promise<MemoryRow[]> {
  const { data, error } = await requireSupabase()
    .from("project_memories")
    .select("*")
    .eq("project_id", projectId)
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function addProjectMemory(input: {
  ownerId: string;
  projectId: string;
  kind: MemoryKind;
  content: string;
  importance: number;
}): Promise<MemoryRow> {
  const content = input.content.trim();
  if (!content) throw new Error("Memory cannot be empty.");

  const { data, error } = await requireSupabase()
    .from("project_memories")
    .insert({
      owner_id: input.ownerId,
      project_id: input.projectId,
      kind: input.kind,
      content,
      importance: Math.min(5, Math.max(1, input.importance))
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") throw new Error("That memory already exists.");
    if (error.message.includes("memory_item_limit")) {
      throw new Error("This project memory is full: 40 items maximum.");
    }
    if (error.message.includes("memory_character_limit")) {
      throw new Error("This project memory is full: 15,000 characters maximum.");
    }
    throw error;
  }

  return data;
}

export async function deleteProjectMemory(memoryId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from("project_memories")
    .delete()
    .eq("id", memoryId);

  if (error) throw error;
}

export function buildMemoryContext(memories: MemoryRow[]) {
  return memories.slice(0, 12).map((memory) => ({
    kind: memory.kind,
    content: memory.content,
    importance: memory.importance
  }));
}
