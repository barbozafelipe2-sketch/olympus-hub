import { createClient } from "@supabase/supabase-js";

const required = [
  "E2E_SUPABASE_URL",
  "E2E_SUPABASE_PUBLISHABLE_KEY",
  "E2E_USER_A_EMAIL",
  "E2E_USER_A_PASSWORD",
  "E2E_USER_B_EMAIL",
  "E2E_USER_B_PASSWORD"
];

for (const name of required) {
  if (!process.env[name]) {
    throw new Error("Missing required E2E environment variable: " + name);
  }
}

const url = process.env.E2E_SUPABASE_URL;
const key = process.env.E2E_SUPABASE_PUBLISHABLE_KEY;

function client() {
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false
    }
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(supabase, email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error || !data.user) {
    throw new Error("E2E sign-in failed for " + email + ": " + (error?.message || "no user"));
  }

  return data.user;
}

const a = client();
const b = client();
let projectId = null;

try {
  const [userA, userB] = await Promise.all([
    login(a, process.env.E2E_USER_A_EMAIL, process.env.E2E_USER_A_PASSWORD),
    login(b, process.env.E2E_USER_B_EMAIL, process.env.E2E_USER_B_PASSWORD)
  ]);

  assert(userA.id !== userB.id, "E2E test accounts must be two different users.");

  const stamp = new Date().toISOString();
  const { data: project, error: projectError } = await a
    .from("projects")
    .insert({
      owner_id: userA.id,
      name: "E2E Isolation " + stamp,
      goal: "Temporary isolation test. Safe to delete."
    })
    .select("*")
    .single();

  if (projectError) throw projectError;
  projectId = project.id;

  const { data: conversation, error: conversationError } = await a
    .from("conversations")
    .insert({
      owner_id: userA.id,
      project_id: project.id,
      title: "E2E conversation",
      mode: "zeus"
    })
    .select("*")
    .single();

  if (conversationError) throw conversationError;

  const [{ error: messageError }, { error: memoryError }, { error: taskError }] =
    await Promise.all([
      a.from("messages").insert({
        conversation_id: conversation.id,
        owner_id: userA.id,
        role: "user",
        content: "private-e2e-message"
      }),
      a.from("project_memories").insert({
        owner_id: userA.id,
        project_id: project.id,
        kind: "fact",
        content: "private-e2e-memory",
        importance: 5
      }),
      a.from("project_tasks").insert({
        owner_id: userA.id,
        project_id: project.id,
        title: "private-e2e-task",
        status: "todo",
        priority: 3
      })
    ]);

  if (messageError) throw messageError;
  if (memoryError) throw memoryError;
  if (taskError) throw taskError;

  const { data: artifactRpc, error: artifactError } = await a.rpc(
    "create_artifact_with_version",
    {
      p_project_id: project.id,
      p_conversation_id: conversation.id,
      p_title: "Private E2E Artifact",
      p_kind: "document",
      p_mime_type: "text/markdown",
      p_content: "# private-e2e-artifact",
      p_provider: "e2e",
      p_model: "e2e",
      p_request_id: "e2e-" + stamp
    }
  );

  if (artifactError) throw artifactError;
  const artifactId = artifactRpc?.[0]?.artifact_id;
  assert(artifactId, "User A artifact was not created.");

  const checks = await Promise.all([
    b.from("projects").select("id").eq("id", project.id),
    b.from("conversations").select("id").eq("id", conversation.id),
    b.from("messages").select("id").eq("conversation_id", conversation.id),
    b.from("project_memories").select("id").eq("project_id", project.id),
    b.from("project_tasks").select("id").eq("project_id", project.id),
    b.from("artifacts").select("id").eq("id", artifactId)
  ]);

  for (const check of checks) {
    if (check.error) throw check.error;
    assert(
      Array.isArray(check.data) && check.data.length === 0,
      "RLS isolation failed: user B could read user A data."
    );
  }

  const { error: crossInsertError } = await b.from("project_tasks").insert({
    owner_id: userB.id,
    project_id: project.id,
    title: "must-not-insert",
    status: "todo",
    priority: 1
  });

  assert(
    Boolean(crossInsertError),
    "RLS isolation failed: user B inserted into user A Project."
  );

  const { data: ownProject, error: ownReadError } = await a
    .from("projects")
    .select("id")
    .eq("id", project.id)
    .single();

  if (ownReadError) throw ownReadError;
  assert(ownProject.id === project.id, "User A could not read its own Project.");

  console.log("OlyHub E2E isolation: PASS");
} finally {
  if (projectId) {
    const { error } = await a.from("projects").delete().eq("id", projectId);
    if (error) {
      console.warn("E2E cleanup failed:", error.message);
    }
  }

  await Promise.allSettled([
    a.auth.signOut({ scope: "local" }),
    b.auth.signOut({ scope: "local" })
  ]);
}
