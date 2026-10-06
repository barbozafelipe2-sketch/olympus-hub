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
  "api/lib/storage-cleanup.js",
  "scripts/account-storage-cleanup.test.mjs",
  "src/lib/memory.ts",
  "src/lib/projectFiles.ts",
  "src/lib/artifacts.ts",
  "src/lib/account.ts",
  "src/lib/settings.ts",
  "src/lib/tasks.ts",
  "src/components/ProjectWorkspace.tsx",
  "src/components/SettingsView.tsx",
  "src/components/Onboarding.tsx",
  "api/account.js",
  "public/manifest.webmanifest",
  "public/icons/olyhub.svg",
  "public/icons/olyhub-180.png",
  "public/icons/olyhub-192.png",
  "public/icons/olyhub-512.png",
  "public/sw.js",
  "supabase/migrations/20261001151323_project_memory_and_private_files.sql",
  "supabase/migrations/20261001151359_fix_project_file_storage_policies.sql",
  "supabase/migrations/20261001152742_durable_execution_traces.sql",
  "supabase/migrations/20261001153147_artifact_engine_foundation.sql",
  "supabase/migrations/20261001153233_index_artifacts_conversation.sql",
  "supabase/migrations/20261001154043_usage_ledger_and_account_limits.sql",
  "supabase/migrations/20261001154212_usage_quota_summary_rpc.sql",
  "supabase/migrations/20261001173347_profile_onboarding_state.sql",
  "supabase/migrations/20261001174355_conversation_checkpoints.sql",
  "api/health.js",
  "api/lib/capabilities.js",
  "src/components/MessageSources.tsx",
  "scripts/e2e-isolation.mjs",
  ".github/workflows/e2e-staging.yml"
]) {
  assert(existsSync(resolve(path)), path + " is missing");
}

const projectWorkspace = readFileSync(
  resolve("src/components/ProjectWorkspace.tsx"),
  "utf8"
);
assert(
  projectWorkspace.includes("addProjectMemory") &&
    projectWorkspace.includes("listProjectTasks") &&
    projectWorkspace.includes("setProjectTaskStatus") &&
    projectWorkspace.includes("uploadProjectFiles") &&
    projectWorkspace.includes("listProjectArtifacts") &&
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

const capabilities = readFileSync(resolve("api/lib/capabilities.js"), "utf8");
assert(
  capabilities.includes("readRequestedProjectFiles") &&
    capabilities.includes("runWebSearchCapability") &&
    capabilities.includes('"web_search"') &&
    capabilities.includes("persistRequestedArtifact") &&
    capabilities.includes("create_artifact_with_version"),
  "Capability Broker / Artifact Engine is not wired"
);

const orchestrator = readFileSync(resolve("api/lib/orchestrator.js"), "utf8");
assert(
  orchestrator.includes("executeZeus") &&
    orchestrator.includes("executeOlympus") &&
    orchestrator.includes("withProviderFallback") &&
    orchestrator.includes("Unsupported OlyHub mode.") &&
    !orchestrator.includes("executeDirect") &&
    chatApi.includes('z.enum(["zeus", "olympus"])'),
  "Zeus/Olympus orchestration and provider failover boundary are not wired"
);




const appSource = readFileSync(resolve("src/App.tsx"), "utf8");
assert(
  appSource.includes("<SettingsView") &&
    appSource.includes("<Onboarding") &&
    !appSource.includes("File transport is not enabled"),
  "Commercial Settings/onboarding or honest Home capability boundary regressed"
);

const accountApi = readFileSync(resolve("api/account.js"), "utf8");
assert(
  accountApi.includes("SUPABASE_SECRET_KEY") &&
    accountApi.includes("deleteUser") &&
    accountApi.includes('removeOwnedStorageObjects(admin, "project-files"') &&
    accountApi.includes('removeOwnedStorageObjects(admin, "artifact-files"'),
  "Account deletion must clean private Project and image-artifact Storage before Auth deletion"
);




const mainSource = readFileSync(resolve("src/main.tsx"), "utf8");
const serviceWorker = readFileSync(resolve("public/sw.js"), "utf8");
const manifest = JSON.parse(
  readFileSync(resolve("public/manifest.webmanifest"), "utf8")
);

assert(
  mainSource.includes('serviceWorker.register("/sw.js")') &&
    manifest.display === "standalone" &&
    Array.isArray(manifest.icons) &&
    manifest.icons.some((icon) => icon.sizes === "192x192" && icon.type === "image/png") &&
    manifest.icons.some((icon) => icon.sizes === "512x512" && icon.type === "image/png"),
  "PWA install foundation must include standard PNG icon sizes"
);

const appHtml = readFileSync(resolve("index.html"), "utf8");
assert(
  appHtml.includes('rel="apple-touch-icon"') &&
    serviceWorker.includes("olyhub-180.png") &&
    serviceWorker.includes("olyhub-192.png") &&
    serviceWorker.includes("olyhub-512.png"),
  "PWA must advertise and precache Apple/web home-screen icons"
);

for (const [filename, size] of [
  ["olyhub-180.png", 180],
  ["olyhub-192.png", 192],
  ["olyhub-512.png", 512]
]) {
  const png = readFileSync(resolve("public/icons/" + filename));
  assert(
    png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      png.readUInt32BE(16) === size &&
      png.readUInt32BE(20) === size &&
      existsSync(resolve("dist/icons/" + filename)),
    filename + " must be a valid square PNG copied into the production build"
  );
}

assert(
  serviceWorker.includes('url.pathname.startsWith("/api/")') &&
    !serviceWorker.includes('cache.put("/api/'),
  "Service worker must never cache authenticated API responses"
);




assert(
  chatApi.includes("refreshConversationCheckpoint") &&
    chatApi.includes('from("conversation_checkpoints")') &&
    chatApi.includes("recentMessages"),
  "Project long-history checkpointing is not wired"
);

assert(
  projectWorkspace.includes(".slice(-24)") &&
    appSource.includes(".slice(-40)") &&
    appSource.includes("conversationId: conversation.id"),
  "Client history windows are not bounded"
);

const settingsLibrary = readFileSync(resolve("src/lib/settings.ts"), "utf8");
const settingsView = readFileSync(
  resolve("src/components/SettingsView.tsx"),
  "utf8"
);
assert(
  settingsLibrary.includes('.from("executions")') &&
    settingsLibrary.includes(".limit(8)") &&
    settingsView.includes("Recent executions") &&
    settingsView.includes("Not configured") &&
    settingsView.includes("Pricing is not assigned"),
  "Settings must show scoped execution history and an honest no-billing state"
);

const healthApi = readFileSync(resolve("api/health.js"), "utf8");
assert(
  healthApi.includes('liveProviderHealth: "not_probed"') &&
    healthApi.includes("deploymentStatus"),
  "Health endpoint must distinguish configuration from live provider health"
);


assert(
  chatApi.includes('from("project_tasks")') &&
    chatApi.includes("Project tasks (current durable work state)"),
  "Project tasks are not grounded in server-side AI context"
);


assert(
  chatApi.includes("runWebSearchCapability") &&
    chatApi.includes("sources: webCapability.sources") &&
    chatApi.includes("combineUsage"),
  "Web search is not integrated into orchestration/usage response"
);

const messageSources = readFileSync(
  resolve("src/components/MessageSources.tsx"),
  "utf8"
);
const conversations = readFileSync(
  resolve("src/lib/conversations.ts"),
  "utf8"
);
assert(
  messageSources.includes('target="_blank"') &&
    messageSources.includes("source.url") &&
    conversations.includes("sourcesFromMetadata") &&
    conversations.includes('parsed.protocol === "https:"'),
  "Persistent clickable citation rendering is incomplete"
);

const e2eIsolation = readFileSync(
  resolve("scripts/e2e-isolation.mjs"),
  "utf8"
);
assert(
  e2eIsolation.includes("RLS isolation failed") &&
    e2eIsolation.includes('from("projects").delete()'),
  "Two-user RLS isolation E2E harness is incomplete"
);

console.log("OlyHub smoke: PASS");
