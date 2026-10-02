export const PROJECT_RECENT_MESSAGES = 24;
export const CHECKPOINT_REFRESH_STEP = 8;
export const CHECKPOINT_BATCH_SIZE = 160;
export const CHECKPOINT_BATCHES_PER_REFRESH = 4;
export const CHECKPOINT_MESSAGE_CHARS = 1200;
export const CHECKPOINT_CONTENT_LIMIT = 40000;

export function checkpointRange(checkpoint, messageCount) {
  const targetCoverage = Math.max(0, messageCount - PROJECT_RECENT_MESSAGES);
  const covered = Math.max(0, checkpoint?.covered_message_count ?? 0);

  if (targetCoverage === 0) return null;
  if (checkpoint && targetCoverage - covered < CHECKPOINT_REFRESH_STEP) return null;

  const start = Math.min(covered, targetCoverage);
  const endExclusive = Math.min(
    targetCoverage,
    start + CHECKPOINT_BATCH_SIZE * CHECKPOINT_BATCHES_PER_REFRESH
  );

  return endExclusive > start ? { start, endExclusive } : null;
}

export function mergeCheckpointContent(previousContent, messages) {
  const compacted = messages
    .map((message) => {
      const role = message.role === "assistant" ? "ASSISTANT" : "USER";
      const content = String(message.content ?? "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, CHECKPOINT_MESSAGE_CHARS);
      return role + ": " + content;
    })
    .join("\n");

  const combined = [previousContent, compacted]
    .filter(Boolean)
    .join("\n");

  if (combined.length <= CHECKPOINT_CONTENT_LIMIT) return combined;

  const omissionNote =
    "[Oldest transcript excerpts were trimmed to keep this rolling checkpoint within its size limit.]\n";
  return omissionNote + combined.slice(-(CHECKPOINT_CONTENT_LIMIT - omissionNote.length));
}
