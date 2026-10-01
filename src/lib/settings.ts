import type { Database } from "../database.types";
import { requireSupabase } from "./supabase";

export type ProfileRow =
  Database["public"]["Tables"]["profiles"]["Row"];

export type AccountLimitRow =
  Database["public"]["Tables"]["account_limits"]["Row"];

export type UsageSummary = {
  dailyRequests: number;
  dailyTokens: number;
  monthlyTokens: number;
};

export type AccountSettings = {
  profile: ProfileRow;
  limits: AccountLimitRow;
  usage: UsageSummary;
};

function numberOrZero(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function loadAccountSettings(): Promise<AccountSettings> {
  const client = requireSupabase();
  const {
    data: { user },
    error: userError
  } = await client.auth.getUser();

  if (userError || !user) {
    throw new Error("Your OlyHub session is no longer valid.");
  }

  const [profileResult, limitsResult, usageResult] = await Promise.all([
    client.from("profiles").select("*").eq("id", user.id).single(),
    client.from("account_limits").select("*").eq("user_id", user.id).single(),
    client.rpc("get_my_usage_summary")
  ]);

  if (profileResult.error) throw profileResult.error;
  if (limitsResult.error) throw limitsResult.error;
  if (usageResult.error) throw usageResult.error;

  const summary = usageResult.data?.[0];

  return {
    profile: profileResult.data,
    limits: limitsResult.data,
    usage: {
      dailyRequests: numberOrZero(summary?.daily_requests),
      dailyTokens: numberOrZero(summary?.daily_tokens),
      monthlyTokens: numberOrZero(summary?.monthly_tokens)
    }
  };
}

export async function completeOnboarding(): Promise<void> {
  const { error } = await requireSupabase().rpc("complete_my_onboarding");
  if (error) throw error;
}
