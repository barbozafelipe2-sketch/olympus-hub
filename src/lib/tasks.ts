import type { Database } from "../database.types";
import { requireSupabase } from "./supabase";

export type ProjectTaskRow =
  Database["public"]["Tables"]["project_tasks"]["Row"];

export type ProjectTaskStatus = "todo" | "in_progress" | "done";

export async function listProjectTasks(
  projectId: string
): Promise<ProjectTaskRow[]> {
  const { data, error } = await requireSupabase()
    .from("project_tasks")
    .select("*")
    .eq("project_id", projectId)
    .order("status", { ascending: true })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createProjectTask(input: {
  ownerId: string;
  projectId: string;
  title: string;
  priority?: number;
}): Promise<ProjectTaskRow> {
  const title = input.title.trim();
  if (!title) throw new Error("Task title cannot be empty.");

  const { data, error } = await requireSupabase()
    .from("project_tasks")
    .insert({
      owner_id: input.ownerId,
      project_id: input.projectId,
      title: title.slice(0, 240),
      status: "todo",
      priority: Math.min(3, Math.max(0, input.priority ?? 1))
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function setProjectTaskStatus(
  taskId: string,
  status: ProjectTaskStatus
): Promise<ProjectTaskRow> {
  const { data, error } = await requireSupabase()
    .from("project_tasks")
    .update({ status })
    .eq("id", taskId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProjectTask(taskId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from("project_tasks")
    .delete()
    .eq("id", taskId);

  if (error) throw error;
}
