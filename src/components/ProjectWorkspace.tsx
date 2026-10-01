import {
  ArrowLeft,
  FileText,
  FolderKanban,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getOrCreateProjectConversation,
  loadConversationMessages,
  persistMessage,
  setConversationMode,
  touchConversationAndProject
} from "../lib/conversations";
import { sendChat } from "../lib/api";
import type { ProjectRow } from "../lib/projects";
import {
  MODES,
  type AttachmentDraft,
  type ChatMessage,
  type ModeId
} from "../types";

type RunMeta = {
  provider: string;
  model: string;
  fallbackUsed: boolean;
  requestId: string;
} | null;

type Props = {
  project: ProjectRow;
  ownerId: string;
  onBack: () => void;
  onProjectTouched: (projectId: string, updatedAt: string) => void;
};

function makeId() {
  return crypto.randomUUID();
}

function isModeId(value: string): value is ModeId {
  return MODES.some((mode) => mode.id === value);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function projectWelcome(project: ProjectRow): ChatMessage {
  return {
    id: "project-welcome-" + project.id,
    role: "assistant",
    content: project.goal
      ? "Project context loaded. Goal: " + project.goal
      : "Project context loaded. This conversation will stay attached to this project.",
    createdAt: project.created_at
  };
}

export function ProjectWorkspace({
  project,
  ownerId,
  onBack,
  onProjectTouched
}: Props) {
  const [mode, setMode] = useState<ModeId>("zeus");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [retryAvailable, setRetryAvailable] = useState(false);
  const [runMeta, setRunMeta] = useState<RunMeta>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedMode = useMemo(
    () => MODES.find((item) => item.id === mode) ?? MODES[0],
    [mode]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setConversationId(null);
    setMessages([]);

    void getOrCreateProjectConversation({
      ownerId,
      projectId: project.id,
      projectName: project.name,
      mode: "zeus"
    })
      .then(async (conversation) => {
        const savedMode = isModeId(conversation.mode)
          ? conversation.mode
          : "zeus";

        const savedMessages = await loadConversationMessages(conversation.id);

        if (!active) return;

        setMode(savedMode);
        setConversationId(conversation.id);
        setMessages(
          savedMessages.length > 0 ? savedMessages : [projectWelcome(project)]
        );
      })
      .catch((caught) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "OlyHub could not restore this project conversation."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [ownerId, project.id, project.name]);

  async function changeMode(nextMode: ModeId) {
    const previous = mode;
    setMode(nextMode);
    setError(null);

    if (!conversationId) return;

    try {
      await setConversationMode(conversationId, nextMode);
    } catch (caught) {
      setMode(previous);
      setError(
        caught instanceof Error ? caught.message : "Unable to save mode."
      );
    }
  }

  function onFilesPicked(files: FileList | null) {
    if (!files) return;

    const next = Array.from(files)
      .slice(0, 8)
      .map((file) => ({
        id: makeId(),
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size
      }));

    setAttachments((current) => [...current, ...next].slice(0, 8));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function generateAssistant(nextMessages: ChatMessage[]) {
    if (!conversationId || isSending) return;

    setIsSending(true);
    setError(null);
    setRetryAvailable(false);
    setRunMeta(null);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);

    try {
      const result = await sendChat(
        {
          mode,
          projectContext: {
            name: project.name,
            goal: project.goal
          },
          messages: nextMessages.filter(
            (message) => !message.id.startsWith("project-welcome-")
          )
        },
        controller.signal
      );

      const assistant = await persistMessage({
        conversationId,
        ownerId,
        role: "assistant",
        content: result.reply,
        metadata: {
          request_id: result.requestId,
          provider: result.provider,
          model: result.model,
          fallback_used: result.fallbackUsed
        }
      });

      setMessages((current) => [...current, assistant]);
      setRunMeta({
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        requestId: result.requestId
      });

      const touchedAt = new Date().toISOString();
      try {
        await touchConversationAndProject({
          conversationId,
          projectId: project.id
        });
        onProjectTouched(project.id, touchedAt);
      } catch (touchError) {
        console.warn("Project timestamp refresh failed", touchError);
        setError("Response saved. Project activity timestamp could not refresh.");
      }
    } catch (caught) {
      setRetryAvailable(true);
      setError(
        caught instanceof DOMException && caught.name === "AbortError"
          ? "The request timed out. Your message is saved; retry will not duplicate it."
          : caught instanceof Error
            ? caught.message
            : "OlyHub could not complete this request."
      );
    } finally {
      window.clearTimeout(timeout);
      setIsSending(false);
    }
  }

  async function submit() {
    const text = prompt.trim();
    if (!text || !conversationId || isSending) return;

    const attachmentNote =
      attachments.length > 0
        ? "\n\nAttached locally: " +
          attachments.map((file) => file.name).join(", ") +
          ". File upload is not enabled yet."
        : "";

    setPrompt("");
    setAttachments([]);
    setError(null);
    setRetryAvailable(false);

    try {
      const persistedUser = await persistMessage({
        conversationId,
        ownerId,
        role: "user",
        content: text + attachmentNote
      });

      const nextMessages = [...messages, persistedUser];
      setMessages(nextMessages);
      await generateAssistant(nextMessages);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "OlyHub could not save your message."
      );
    }
  }

  async function retry() {
    if (isSending || !conversationId) return;

    const latest = await loadConversationMessages(conversationId).catch(() => null);

    if (!latest) {
      setError("OlyHub could not reload the saved conversation for retry.");
      return;
    }

    setMessages(latest.length > 0 ? latest : [projectWelcome(project)]);
    await generateAssistant(latest);
  }

  return (
    <section className="project-workspace">
      <header className="project-workspace-header">
        <button className="icon-button" onClick={onBack} aria-label="Back to projects">
          <ArrowLeft size={18} />
        </button>

        <div className="project-workspace-title">
          <span className="eyebrow">Project</span>
          <h1>{project.name}</h1>
          <p>{project.goal || "No project goal defined yet."}</p>
        </div>

        <label className="mode-select">
          <Sparkles size={16} />
          <select
            value={mode}
            onChange={(event) => void changeMode(event.target.value as ModeId)}
          >
            {MODES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="project-workspace-body">
        <div className="conversation-column">
          <div className="mode-summary">
            <div>
              <strong>{selectedMode.label}</strong>
              <span>{selectedMode.description}</span>
            </div>
            <span className="status-dot">
              {loading ? "Restoring" : "Persistent"}
            </span>
          </div>

          <div className="chat-stream" aria-live="polite">
            {loading ? (
              <article className="message-row assistant">
                <div className="message-avatar">Z</div>
                <div className="message-bubble thinking">
                  Restoring project context...
                </div>
              </article>
            ) : (
              messages.map((message) => (
                <article
                  key={message.id}
                  className={"message-row " + message.role}
                >
                  {message.role === "assistant" && (
                    <div className="message-avatar">Z</div>
                  )}
                  <div className="message-bubble">{message.content}</div>
                </article>
              ))
            )}

            {isSending && (
              <article className="message-row assistant">
                <div className="message-avatar">Z</div>
                <div className="message-bubble thinking">Working on it...</div>
              </article>
            )}

            {error && (
              <div className="error-banner retry-banner">
                <span>{error}</span>
                {retryAvailable && (
                  <button onClick={() => void retry()} disabled={isSending}>
                    <RotateCcw size={14} />
                    Retry saved message
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="composer-wrap">
            {attachments.length > 0 && (
              <div className="attachment-strip">
                {attachments.map((file) => (
                  <div className="attachment-chip" key={file.id}>
                    <FileText size={15} />
                    <span>
                      {file.name}
                      <small>{formatBytes(file.size)}</small>
                    </span>
                    <button
                      aria-label={"Remove " + file.name}
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter((item) => item.id !== file.id)
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="composer">
              <input
                ref={fileInputRef}
                hidden
                type="file"
                multiple
                onChange={(event) => onFilesPicked(event.target.files)}
              />
              <button
                className="icon-button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach files"
              >
                <Paperclip size={19} />
              </button>
              <textarea
                value={prompt}
                disabled={loading || !conversationId}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder={"Continue " + project.name + "..."}
                rows={1}
              />
              <button
                className="send-button"
                disabled={
                  loading || !conversationId || !prompt.trim() || isSending
                }
                onClick={() => void submit()}
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="composer-caption">
              This conversation is stored with the project and restored next time.
            </p>
          </div>
        </div>

        <aside className="context-rail">
          <section className="rail-card">
            <div className="rail-heading">
              <FolderKanban size={17} />
              <strong>Project context</strong>
            </div>
            <div className="project-context-copy">
              <span>Goal</span>
              <p>{project.goal || "No goal defined yet."}</p>
            </div>
          </section>

          <section className="rail-card">
            <div className="rail-heading">
              <ShieldCheck size={17} />
              <strong>Last run</strong>
            </div>
            {runMeta ? (
              <dl className="run-grid">
                <div>
                  <dt>Provider</dt>
                  <dd>{runMeta.provider}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{runMeta.model}</dd>
                </div>
                <div>
                  <dt>Fallback</dt>
                  <dd>{runMeta.fallbackUsed ? "Used" : "No"}</dd>
                </div>
                <div>
                  <dt>Request</dt>
                  <dd>{runMeta.requestId.slice(0, 8)}</dd>
                </div>
              </dl>
            ) : (
              <div className="empty-rail">
                Provider trace appears after the next completed response.
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
