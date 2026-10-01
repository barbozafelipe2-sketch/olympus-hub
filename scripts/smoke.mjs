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

const lock = JSON.parse(readFileSync(resolve("package-lock.json"), "utf8"));
assert(lock.lockfileVersion === 3, "Expected npm lockfile v3");
assert(
  lock.packages?.[""]?.dependencies?.["@supabase/supabase-js"] === "2.117.2",
  "Supabase dependency is not locked to the expected version"
);

for (const path of [
  "src/lib/memory.ts",
  "src/lib/projectFiles.ts",
  "src/components/ProjectWorkspace.tsx",
  "supabase/migrations/20261001151323_project_memory_and_private_files.sql",
  "supabase/migrations/20261001151359_fix_project_file_storage_policies.sql"
]) {
  assert(existsSync(resolve(path)), path + " is missing");
}

const projectWorkspace = readFileSync(
  resolve("src/components/ProjectWorkspace.tsx"),
  "utf8"
);
assert(
  projectWorkspace.includes("buildMemoryContext") &&
    projectWorkspace.includes("uploadProjectFiles"),
  "Project workspace is not wired to memory/files"
);

const chatApi = readFileSync(resolve("api/chat.js"), "utf8");
assert(
  chatApi.includes("Approved project memory") &&
    chatApi.includes("metadata only; do not claim file contents were read"),
  "Chat API is missing memory/file grounding safeguards"
);

console.log("OlyHub smoke: PASS");
