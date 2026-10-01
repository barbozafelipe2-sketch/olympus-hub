import type { Database } from "../database.types";
import { downloadBlob } from "./download";
import { requireSupabase } from "./supabase";

export type ArtifactRow =
  Database["public"]["Tables"]["artifacts"]["Row"];

type ArtifactFileRow =
  Database["public"]["Tables"]["artifact_files"]["Row"];

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

async function currentBinaryFile(
  artifact: ArtifactRow
): Promise<ArtifactFileRow | null> {
  const { data, error } = await requireSupabase()
    .from("artifact_files")
    .select("*")
    .eq("artifact_id", artifact.id)
    .eq("version", artifact.current_version)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getArtifactPreviewUrl(
  artifact: ArtifactRow
): Promise<string | null> {
  if (!artifact.mime_type.startsWith("image/")) return null;

  const file = await currentBinaryFile(artifact);
  if (!file) return null;

  const { data, error } = await requireSupabase().storage
    .from(file.bucket_id)
    .createSignedUrl(file.storage_path, 3600);

  if (error) throw error;
  return data.signedUrl;
}

export async function downloadArtifact(artifact: ArtifactRow): Promise<void> {
  const client = requireSupabase();

  if (artifact.mime_type.startsWith("image/")) {
    const file = await currentBinaryFile(artifact);
    if (!file) throw new Error("Image artifact file is unavailable.");

    const { data, error } = await client.storage
      .from(file.bucket_id)
      .download(file.storage_path);

    if (error) throw error;

    const extension =
      file.mime_type === "image/webp"
        ? ".webp"
        : file.mime_type === "image/jpeg"
          ? ".jpg"
          : ".png";

    const filename =
      artifact.title.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 100) +
      extension;
    downloadBlob(data, filename);
    return;
  }

  const { data, error } = await client
    .from("artifact_versions")
    .select("content")
    .eq("artifact_id", artifact.id)
    .eq("version", artifact.current_version)
    .single();

  if (error) throw error;

  const blob = new Blob([data.content], {
    type: artifact.mime_type || "text/markdown"
  });
  const extension =
    artifact.mime_type === "application/json"
      ? ".json"
      : artifact.mime_type === "text/csv"
        ? ".csv"
        : ".md";

  const filename =
    artifact.title.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 100) +
    extension;
  downloadBlob(blob, filename);
}

export async function deleteArtifact(artifactId: string): Promise<void> {
  const client = requireSupabase();

  const { data: files, error: filesError } = await client
    .from("artifact_files")
    .select("bucket_id, storage_path")
    .eq("artifact_id", artifactId);

  if (filesError) throw filesError;

  for (const file of files ?? []) {
    const { error } = await client.storage
      .from(file.bucket_id)
      .remove([file.storage_path]);

    if (error) throw error;
  }

  const { error } = await client
    .from("artifacts")
    .delete()
    .eq("id", artifactId);

  if (error) throw error;
}
