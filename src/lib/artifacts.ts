import type { Database } from "../database.types";
import { requireSupabase } from "./supabase";

export type ArtifactRow =
  Database["public"]["Tables"]["artifacts"]["Row"];

export async function listProjectArtifacts(
  projectId: string
): Promise<ArtifactRow[]> {
  const { data, error } = await requireSupabase()
    .from("artifacts")
    .select("*")
    .eq("project_id", projectId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function downloadArtifact(artifact: ArtifactRow): Promise<void> {
  const { data, error } = await requireSupabase()
    .from("artifact_versions")
    .select("content")
    .eq("artifact_id", artifact.id)
    .eq("version", artifact.current_version)
    .single();

  if (error) throw error;

  const blob = new Blob([data.content], {
    type: artifact.mime_type || "text/markdown"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const extension =
    artifact.mime_type === "application/json"
      ? ".json"
      : artifact.mime_type === "text/csv"
        ? ".csv"
        : ".md";

  anchor.href = url;
  anchor.download =
    artifact.title.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 100) + extension;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function deleteArtifact(artifactId: string): Promise<void> {
  const { error } = await requireSupabase()
    .from("artifacts")
    .delete()
    .eq("id", artifactId);

  if (error) throw error;
}


export async function listConversationArtifacts(
  conversationId: string
): Promise<ArtifactRow[]> {
  const { data, error } = await requireSupabase()
    .from("artifacts")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("status", "active")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}
