import type { ApiChatResponse, ChatMessage, ModeId } from "../types";
import { requireSupabase } from "./supabase";

type SendChatInput = {
  messages: ChatMessage[];
  mode: ModeId;
  projectContext?: {
    projectId: string;
    conversationId: string;
  };
};

export async function sendChat(
  input: SendChatInput,
  signal?: AbortSignal
): Promise<ApiChatResponse> {
  const {
    data: { session },
    error: sessionError
  } = await requireSupabase().auth.getSession();

  if (sessionError || !session?.access_token) {
    throw new Error("Your OlyHub session is no longer valid. Sign in again.");
  }

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + session.access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      mode: input.mode,
      projectContext: input.projectContext,
      messages: input.messages.map(({ role, content }) => ({ role, content }))
    }),
    signal
  });

  const data = (await response.json().catch(() => null)) as
    | (Partial<ApiChatResponse> & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(data?.error || "OlyHub could not complete this request.");
  }

  if (
    !data?.reply ||
    !data.requestId ||
    !data.provider ||
    !data.model ||
    !Array.isArray(data.trace) ||
    !data.orchestration ||
    !("executionId" in data)
  ) {
    throw new Error("OlyHub received an invalid response from the server.");
  }

  return data as ApiChatResponse;
}
