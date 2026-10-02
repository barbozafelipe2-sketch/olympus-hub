import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { removeOwnedStorageObjects } from "./lib/storage-cleanup.js";

const DeleteBody = z.object({
  confirmation: z.literal("DELETE MY ACCOUNT")
});

function bearerToken(req) {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

function userClient(token) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !token) return null;

  return createClient(url, key, {
    global: {
      headers: {
        Authorization: "Bearer " + token
      }
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

function adminClient() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;

  return createClient(url, secret, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

export default async function handler(req, res) {
  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const parsed = DeleteBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Type "DELETE MY ACCOUNT" to confirm account deletion.'
    });
  }

  const token = bearerToken(req);
  const client = userClient(token);
  const admin = adminClient();

  if (!client || !token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  if (!admin) {
    return res.status(503).json({
      error:
        "Account deletion is not configured on the server. SUPABASE_SECRET_KEY is required."
    });
  }

  const {
    data: { user },
    error: authError
  } = await client.auth.getUser(token);

  if (authError || !user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    const [projectFilesDeleted, artifactFilesDeleted] = await Promise.all([
      removeOwnedStorageObjects(admin, "project-files", user.id),
      removeOwnedStorageObjects(admin, "artifact-files", user.id)
    ]);

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return res.status(200).json({
      deleted: true,
      storageObjectsDeleted: projectFilesDeleted + artifactFilesDeleted
    });
  } catch (error) {
    console.error("OlyHub account deletion failure", {
      userId: user.id,
      code: error?.code
    });

    return res.status(500).json({
      error:
        "OlyHub could not complete account deletion. No success was recorded."
    });
  }
}
