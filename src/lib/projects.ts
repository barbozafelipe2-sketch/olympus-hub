import type { Database } from "../database.types";
import { requireSupabase } from "./supabase";

export type ProjectRow =
  Database["public"]["Tables"]["projects"]["Row"];

export async function listProjects(): Promise<ProjectRow[]> {
  const { data, error } = await requireSupabase()
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function createProject(input: {
  ownerId: string;
  name: string;
  goal: string;
}): Promise<ProjectRow> {
  const { data, error } = await requireSupabase()
    .from("projects")
    .insert({
      owner_id: input.ownerId,
      name: input.name.trim(),
      goal: input.goal.trim()
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function archiveProject(projectId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from("projects")
    .update({ status: "archived" })
    .eq("id", projectId);

  if (error) throw error;
}

export async function restoreProject(projectId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from("projects")
    .update({ status: "active" })
    .eq("id", projectId);

  if (error) throw error;
}
