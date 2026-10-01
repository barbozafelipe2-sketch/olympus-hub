import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const indexPath = resolve("dist/index.html");
assert(existsSync(indexPath), "dist/index.html was not produced");

const html = readFileSync(indexPath, "utf8");
assert(html.includes('id="root"'), "React root is missing from production HTML");
assert(html.includes("/assets/"), "Vite asset bundle is missing from production HTML");

const apiModule = await import("../api/chat.js");
assert(typeof apiModule.default === "function", "api/chat.js must export a handler");

const appSource = readFileSync(resolve("src/App.tsx"), "utf8");
const workspaceSource = readFileSync(resolve("src/lib/workspace.ts"), "utf8");
const workspaceMigration = readFileSync(
  resolve("supabase/migrations/20261001170000_commercial_workspace_completion.sql"),
  "utf8"
);
const apiSource = readFileSync(resolve("api/chat.js"), "utf8");
assert(appSource.includes("loadMessages(first.id)"), "Home must restore saved messages");
assert(appSource.includes("void openProject(project)"), "Project cards must open a workspace");
assert(appSource.includes("void saveAnswer(message)"), "Assistant answers must be saveable");
assert(workspaceSource.includes("storage_path") && workspaceSource.includes("uploadSource"), "Sources must be stored in private object storage");
assert(workspaceMigration.includes("alter table public.artifacts enable row level security"), "Artifact metadata must have RLS enabled");
assert(workspaceMigration.includes("olyhub_storage_select_own") && workspaceMigration.includes("olyhub_storage_insert_own"), "Storage access must be owner-scoped");
assert(workspaceMigration.includes("conversations_one_per_project_idx"), "Projects must keep one canonical conversation");
assert(apiSource.includes("contextCharacters > 80000"), "Chat request context must have an aggregate budget");
assert(!appSource.includes("File transport is not enabled"), "Attachment UI must not claim upload is a placeholder");

const lock = JSON.parse(readFileSync(resolve("package-lock.json"), "utf8"));
assert(lock.lockfileVersion === 3, "Expected npm lockfile v3");
assert(
  lock.packages?.[""]?.dependencies?.["@supabase/supabase-js"] === "2.117.2",
  "Supabase dependency is not locked to the expected version"
);

console.log("OlyHub smoke: PASS");
