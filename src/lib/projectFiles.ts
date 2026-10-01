import type { Database } from "../database.types";
import { requireSupabase } from "./supabase";

export type ProjectFileRow =
  Database["public"]["Tables"]["project_files"]["Row"];

const BUCKET = "project-files";
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_FILES_PER_UPLOAD = 8;

export class ProjectFileUploadError extends Error {
  constructor(
    message: string,
    readonly uploadedCount: number
  ) {
    super(message);
    this.name = "ProjectFileUploadError";
  }
}

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
  if (input.files.length > MAX_FILES_PER_UPLOAD) {
    throw new Error("Select up to 8 project files per upload.");
  }

  for (const file of input.files) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(file.name + " is larger than the 20 MB project-file limit.");
    }

    if (!file.type) {
      throw new Error(file.name + " has an unsupported or unknown file type.");
    }
  }

  const client = requireSupabase();
  const uploaded: ProjectFileRow[] = [];

  for (const file of input.files) {
    try {
      const safeName = cleanFileName(file.name);
      const storagePath =
        input.ownerId + "/" +
        input.projectId + "/" +
        crypto.randomUUID() + "-" + safeName;
      const mimeType = file.type;

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
    } catch (caught) {
      if (uploaded.length > 0) {
        throw new ProjectFileUploadError(
          "Upload stopped after " + uploaded.length + " of " + input.files.length +
            " files. Completed files were kept in this Project.",
          uploaded.length
        );
      }
      throw caught;
    }
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
