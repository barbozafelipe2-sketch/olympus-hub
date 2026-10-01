import type { ApiChatResponse, ChatMessage, ModeId } from "../types";

type SendChatInput = {
  messages: ChatMessage[];
  mode: ModeId;
};

export async function sendChat(
  input: SendChatInput,
  signal?: AbortSignal
): Promise<ApiChatResponse> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      mode: input.mode,
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

  if (!data?.reply || !data.requestId || !data.provider || !data.model) {
    throw new Error("OlyHub received an invalid response from the server.");
  }

  return data as ApiChatResponse;
}
