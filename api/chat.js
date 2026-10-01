import { z } from "zod";

const ModeSchema = z.enum(["zeus", "olympus", "openai", "claude", "google"]);

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(30000)
});

const BodySchema = z.object({
  mode: ModeSchema.default("zeus"),
  messages: z.array(MessageSchema).min(1).max(80)
});

const MODE_INSTRUCTIONS = {
  zeus:
    "You are Zeus, the commercial OlyHub orchestration persona. Be precise, useful, transparent about uncertainty, and never claim tools or providers ran unless the server actually reports them.",
  olympus:
    "You are serving as the temporary single-model foundation for OlyHub Olympus mode. Produce a strong integrated answer, but do not claim that multiple models, critics, or a council reviewed the request because this foundation route has not enabled those adapters yet.",
  openai:
    "You are the direct OpenAI route inside OlyHub. Answer the user directly and accurately.",
  claude:
    "The user selected Claude mode, but this foundation is currently using the OpenAI fallback route. Answer normally and never impersonate Claude or claim Anthropic processed the request.",
  google:
    "The user selected Google AI mode, but this foundation is currently using the OpenAI fallback route. Answer normally and never impersonate Gemini or claim Google processed the request."
};

function extractOutputText(data) {
  const output = Array.isArray(data?.output) ? data.output : [];
  return output
    .flatMap((item) => (Array.isArray(item?.content) ? item.content : []))
    .filter((part) => part?.type === "output_text" && typeof part?.text === "string")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function requestIdFromHeader(response) {
  return (
    response.headers.get("x-request-id") ||
    response.headers.get("request-id") ||
    crypto.randomUUID()
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const parsed = BodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "Invalid request payload.",
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "The AI provider is not configured on the server."
    });
  }

  const { mode, messages } = parsed.data;
  const model =
    process.env.OPENAI_DEFAULT_MODEL ||
    process.env.OPENAI_FALLBACK_MODEL ||
    "gpt-5.6-luna";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75000);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        instructions: MODE_INSTRUCTIONS[mode],
        input: messages.map((message) => ({
          role: message.role,
          content: message.content
        })),
        max_output_tokens: 4096
      }),
      signal: controller.signal
    });

    const requestId = requestIdFromHeader(response);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error("OlyHub provider error", {
        requestId,
        status: response.status,
        type: data?.error?.type
      });
      return res.status(502).json({
        error: "The AI provider could not complete the request.",
        requestId
      });
    }

    const reply = extractOutputText(data);
    if (!reply) {
      console.error("OlyHub empty provider response", { requestId });
      return res.status(502).json({
        error: "The AI provider returned an empty response.",
        requestId
      });
    }

    return res.status(200).json({
      reply,
      requestId,
      provider: "OpenAI",
      model,
      fallbackUsed: mode === "claude" || mode === "google"
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.error("OlyHub chat failure", {
      kind: timedOut ? "timeout" : "request_failure"
    });

    return res.status(timedOut ? 504 : 500).json({
      error: timedOut
        ? "The AI provider timed out."
        : "The server could not complete the request."
    });
  } finally {
    clearTimeout(timeout);
  }
}
