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

export type ApiUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  reasoningTokens: number;
  toolTokens: number;
  totalTokens: number;
};

export type ApiTraceEntry = {
  role: string;
  provider: string;
  providerId: string;
  model: string;
  requestId: string;
  fallbackFrom: string | null;
  usage: ApiUsage;
};

export type ApiCapabilityTrace = {
  name: string;
  status: string;
  target?: string;
  reason?: string;
  artifactId?: string;
  version?: number;
  action?: string;
  bytes?: number;
};

export type ApiArtifact = {
  id: string;
  title: string;
  kind: string;
  mimeType: string;
  version: number;
  action: string;
};

export type ApiOrchestration = {
  mode: ModeId;
  calls: number;
  multiProvider: boolean;
  degraded: boolean;
};

export type ApiQuota = {
  allowed: boolean;
  reason: string | null;
  planCode: string;
  status: string;
  limits: {
    dailyRequests: number | null;
    dailyTokens: number | null;
    monthlyTokens: number | null;
  };
  usage: {
    dailyRequests: number;
    dailyTokens: number;
    monthlyTokens: number;
  };
  remaining: {
    dailyRequests: number | null;
    dailyTokens: number | null;
    monthlyTokens: number | null;
  };
};

export type ApiChatResponse = {
  reply: string;
  requestId: string;
  provider: string;
  model: string;
  fallbackUsed: boolean;
  executionId: string | null;
  trace: ApiTraceEntry[];
  orchestration: ApiOrchestration;
  artifact: ApiArtifact | null;
  capabilities: ApiCapabilityTrace[];
  usage: ApiUsage;
  quota: ApiQuota;
  usageRecorded: boolean;
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
