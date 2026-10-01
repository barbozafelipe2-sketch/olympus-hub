export type Role = "user" | "assistant";

export type ModeId = "zeus" | "olympus" | "openai" | "claude" | "google";

export type ChatMessage = {
  id: string;
  role: Role;
  content: string;
  createdAt: string;
};

export type AttachmentDraft = {
  id: string;
  name: string;
  type: string;
  size: number;
};

export type ApiChatResponse = {
  reply: string;
  requestId: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
};

export const MODES: Array<{
  id: ModeId;
  label: string;
  description: string;
}> = [
  {
    id: "zeus",
    label: "Zeus",
    description: "Best single route with OpenAI fallback"
  },
  {
    id: "olympus",
    label: "Olympus",
    description: "Council workflow; degrades transparently when adapters are unavailable"
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Direct OpenAI route"
  },
  {
    id: "claude",
    label: "Claude",
    description: "Direct Claude route with OpenAI fallback"
  },
  {
    id: "google",
    label: "Google AI",
    description: "Direct Google AI route with OpenAI fallback"
  }
];
