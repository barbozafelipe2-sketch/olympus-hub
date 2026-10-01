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
  "supabase/migrations/20261001151359_fix_project_file_storage_policies.sql",
  "supabase/migrations/20261001153000_durable_execution_traces.sql"
]) {
  assert(existsSync(resolve(path)), path + " is missing");
}

const projectWorkspace = readFileSync(
  resolve("src/components/ProjectWorkspace.tsx"),
  "utf8"
);
assert(
  projectWorkspace.includes("addProjectMemory") &&
    projectWorkspace.includes("uploadProjectFiles") &&
    projectWorkspace.includes("projectId: project.id") &&
    projectWorkspace.includes("conversationId"),
  "Project workspace is not wired to memory/files/canonical context"
);

const chatApi = readFileSync(resolve("api/chat.js"), "utf8");
assert(
  chatApi.includes("Project memory is user-approved context") &&
    chatApi.includes("Never claim to have read a stored file") &&
    chatApi.includes("loadCanonicalProjectContext") &&
    chatApi.includes('from("executions")'),
  "Chat API is missing canonical context or durable execution safeguards"
);

for (const path of ["api/lib/providers.js", "api/lib/orchestrator.js"]) {
  assert(existsSync(resolve(path)), path + " is missing");
}

const orchestrator = readFileSync(resolve("api/lib/orchestrator.js"), "utf8");
assert(
  orchestrator.includes("executeZeus") &&
    orchestrator.includes("executeOlympus") &&
    orchestrator.includes("withOpenAIFallback"),
  "Zeus/Olympus orchestration is not wired"
);

console.log("OlyHub smoke: PASS");
