import { requireSupabase } from "./supabase";

export async function deleteCurrentAccount(): Promise<void> {
  const {
    data: { session },
    error: sessionError
  } = await requireSupabase().auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Your OlyHub session is no longer valid. Sign in again.");
  }

  const response = await fetch("/api/account", {
    method: "DELETE",
    headers: {
      Authorization: "Bearer " + session.access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      confirmation: "DELETE MY ACCOUNT"
    })
  });

  const data = (await response.json().catch(() => null)) as
    | { deleted?: boolean; error?: string }
    | null;

  if (!response.ok || !data?.deleted) {
    throw new Error(data?.error || "OlyHub could not delete this account.");
  }

  await requireSupabase().auth.signOut({ scope: "local" });
}
