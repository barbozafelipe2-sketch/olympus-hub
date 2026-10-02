import type { Database } from "../database.types";
import { requireSupabase } from "./supabase";

export type ProjectRow =
  Database["public"]["Tables"]["projects"]["Row"];

export async function listProjects(
  status: "active" | "archived" = "active"
): Promise<ProjectRow[]> {
  const { data, error } = await requireSupabase()
    .from("projects")
    .select("*")
    .eq("status", status)
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

export async function setProjectStatus(
  projectId: string,
  status: "active" | "archived"
): Promise<void> {
  const { error } = await requireSupabase()
    .from("projects")
    .update({ status })
    .eq("id", projectId);

  if (error) throw error;
}
