function configured(name) {
  return Boolean(process.env[name]);
}

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const checks = {
    supabase: configured("SUPABASE_URL") && configured("SUPABASE_PUBLISHABLE_KEY"),
    openaiFallback: configured("OPENAI_API_KEY"),
    accountDeletion: configured("SUPABASE_SECRET_KEY"),
    anthropicAdapter: configured("ANTHROPIC_API_KEY"),
    googleAdapter:
      configured("GOOGLE_AI_API_KEY") || configured("GEMINI_API_KEY"),
    globalQuota:
      configured("OLYHUB_DAILY_REQUEST_LIMIT") ||
      configured("OLYHUB_DAILY_TOKEN_LIMIT") ||
      configured("OLYHUB_MONTHLY_TOKEN_LIMIT")
  };

  const requiredConfigured =
    checks.supabase && checks.openaiFallback && checks.accountDeletion;

  return res.status(requiredConfigured ? 200 : 503).json({
    deploymentStatus: requiredConfigured ? "configured" : "incomplete",
    checks,
    liveProviderHealth: "not_probed",
    note:
      "This endpoint reports deployment configuration only. Provider runtime health is recorded per execution and is not inferred from configured keys.",
    checkedAt: new Date().toISOString()
  });
}
