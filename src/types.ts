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
  file: File;
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
    description: "Single OpenAI route in this stage"
  },
  {
    id: "olympus",
    label: "Olympus",
    description: "Single OpenAI route in this stage; multi-model council is not enabled yet"
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "Direct OpenAI route"
  },
  {
    id: "claude",
    label: "Claude",
    description: "OpenAI fallback until a Claude server adapter is configured"
  },
  {
    id: "google",
    label: "Google AI",
    description: "OpenAI fallback until a Google server adapter is configured"
  }
];
