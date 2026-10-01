import type { Database } from "../database.types";
import { requireSupabase } from "./supabase";

export type ProjectFileRow =
  Database["public"]["Tables"]["project_files"]["Row"];

const BUCKET = "project-files";
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function cleanFileName(name: string) {
  return name
    .replace(/[^a-zA-Z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "file";
}

export async function listProjectFiles(projectId: string): Promise<ProjectFileRow[]> {
  const { data, error } = await requireSupabase()
    .from("project_files")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function uploadProjectFiles(input: {
  ownerId: string;
  projectId: string;
  files: File[];
}): Promise<ProjectFileRow[]> {
  const client = requireSupabase();
  const uploaded: ProjectFileRow[] = [];

  for (const file of input.files.slice(0, 8)) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(file.name + " is larger than the 20 MB project-file limit.");
    }

    const safeName = cleanFileName(file.name);
    const storagePath =
      input.ownerId + "/" +
      input.projectId + "/" +
      crypto.randomUUID() + "-" + safeName;
    const mimeType = file.type || "application/octet-stream";

    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        cacheControl: "3600",
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) throw uploadError;

    const { data: metadata, error: metadataError } = await client
      .from("project_files")
      .insert({
        owner_id: input.ownerId,
        project_id: input.projectId,
        storage_path: storagePath,
        name: safeName,
        mime_type: mimeType,
        size_bytes: file.size
      })
      .select("*")
      .single();

    if (metadataError) {
      await client.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
      throw metadataError;
    }

    uploaded.push(metadata);
  }

  return uploaded;
}

export async function downloadProjectFile(file: ProjectFileRow): Promise<void> {
  const { data, error } = await requireSupabase().storage
    .from(BUCKET)
    .download(file.storage_path);

  if (error) throw error;

  const url = URL.createObjectURL(data);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function deleteProjectFile(file: ProjectFileRow): Promise<void> {
  const client = requireSupabase();
  const { error: storageError } = await client.storage
    .from(BUCKET)
    .remove([file.storage_path]);

  if (storageError) throw storageError;

  const { error: metadataError } = await client
    .from("project_files")
    .delete()
    .eq("id", file.id);

  if (metadataError) throw metadataError;
}
