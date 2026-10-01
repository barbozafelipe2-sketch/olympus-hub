import {
  ArrowLeft,
  Brain,
  Download,
  FileText,
  FolderKanban,
  Paperclip,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  getOrCreateProjectConversation,
  loadConversationMessages,
  persistMessage,
  setConversationMode,
  touchConversationAndProject
} from "../lib/conversations";
import {
  addProjectMemory,
  buildMemoryContext,
  deleteProjectMemory,
  listProjectMemories,
  type MemoryKind,
  type MemoryRow
} from "../lib/memory";
import {
  deleteProjectFile,
  downloadProjectFile,
  listProjectFiles,
  uploadProjectFiles,
  type ProjectFileRow
} from "../lib/projectFiles";
import { sendChat } from "../lib/api";
import type { ProjectRow } from "../lib/projects";
import { MODES, type ChatMessage, type ModeId } from "../types";

type RunMeta = {
  provider: string;
  model: string;
  fallbackUsed: boolean;
  requestId: string;
  calls: number;
  multiProvider: boolean;
  degraded: boolean;
  route: string;
} | null;

type Props = {
  project: ProjectRow;
  ownerId: string;
  onBack: () => void;
  onProjectTouched: (projectId: string, updatedAt: string) => void;
};

const MEMORY_KINDS: Array<{ value: MemoryKind; label: string }> = [
  { value: "fact", label: "Fact" },
  { value: "preference", label: "Preference" },
  { value: "decision", label: "Decision" },
  { value: "outcome", label: "Outcome" },
  { value: "instruction", label: "Instruction" }
];

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

function sortMemories(rows: MemoryRow[]) {
  return [...rows].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return b.updated_at.localeCompare(a.updated_at);
  });
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
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [projectFiles, setProjectFiles] = useState<ProjectFileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryKind, setMemoryKind] = useState<MemoryKind>("fact");
  const [memoryImportance, setMemoryImportance] = useState(3);
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [filesBusy, setFilesBusy] = useState(false);
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
    setMemories([]);
    setProjectFiles([]);

    void Promise.all([
      getOrCreateProjectConversation({
        ownerId,
        projectId: project.id,
        projectName: project.name,
        mode: "zeus"
      }),
      listProjectMemories(project.id),
      listProjectFiles(project.id)
    ])
      .then(async ([conversation, savedMemories, savedFiles]) => {
        const savedMessages = await loadConversationMessages(conversation.id);
        if (!active) return;

        setMode(isModeId(conversation.mode) ? conversation.mode : "zeus");
        setConversationId(conversation.id);
        setMessages(
          savedMessages.length > 0 ? savedMessages : [projectWelcome(project)]
        );
        setMemories(sortMemories(savedMemories));
        setProjectFiles(savedFiles);
      })
      .catch((caught) => {
        if (!active) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "OlyHub could not restore this project."
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
      setError(caught instanceof Error ? caught.message : "Unable to save mode.");
    }
  }

  async function onFilesPicked(files: FileList | null) {
    if (!files?.length || filesBusy) return;

    setFilesBusy(true);
    setError(null);

    try {
      const uploaded = await uploadProjectFiles({
        ownerId,
        projectId: project.id,
        files: Array.from(files)
      });
      setProjectFiles((current) => [...uploaded, ...current]);

      const touchedAt = new Date().toISOString();
      if (conversationId) {
        await touchConversationAndProject({
          conversationId,
          projectId: project.id
        }).catch(() => undefined);
      }
      onProjectTouched(project.id, touchedAt);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? "File upload failed: " + caught.message
          : "File upload failed."
      );
    } finally {
      setFilesBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function saveMemory() {
    const content = memoryDraft.trim();
    if (!content || memoryBusy) return;

    setMemoryBusy(true);
    setError(null);

    try {
      const memory = await addProjectMemory({
        ownerId,
        projectId: project.id,
        kind: memoryKind,
        content,
        importance: memoryImportance
      });

      setMemories((current) => sortMemories([memory, ...current]));
      setMemoryDraft("");
      setMemoryKind("fact");
      setMemoryImportance(3);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save memory."
      );
    } finally {
      setMemoryBusy(false);
    }
  }

  async function removeMemory(memoryId: string) {
    setError(null);
    try {
      await deleteProjectMemory(memoryId);
      setMemories((current) => current.filter((item) => item.id !== memoryId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to remove memory."
      );
    }
  }

  async function removeFile(file: ProjectFileRow) {
    setError(null);
    try {
      await deleteProjectFile(file);
      setProjectFiles((current) => current.filter((item) => item.id !== file.id));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to delete file."
      );
    }
  }

  async function downloadFile(file: ProjectFileRow) {
    setError(null);
    try {
      await downloadProjectFile(file);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to download file."
      );
    }
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
            goal: project.goal,
            memories: buildMemoryContext(memories),
            files: projectFiles.slice(0, 20).map((file) => ({
              name: file.name,
              mimeType: file.mime_type,
              sizeBytes: file.size_bytes
            }))
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
          fallback_used: result.fallbackUsed,
          orchestration: result.orchestration,
          trace: result.trace
        }
      });

      setMessages((current) => [...current, assistant]);
      setRunMeta({
        provider: result.provider,
        model: result.model,
        fallbackUsed: result.fallbackUsed,
        requestId: result.requestId,
        calls: result.orchestration.calls,
        multiProvider: result.orchestration.multiProvider,
        degraded: result.orchestration.degraded,
        route: [...new Set(result.trace.map((entry) => entry.provider))].join(" → ")
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

    setPrompt("");
    setError(null);
    setRetryAvailable(false);

    try {
      const persistedUser = await persistMessage({
        conversationId,
        ownerId,
        role: "user",
        content: text
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
                <article key={message.id} className={"message-row " + message.role}>
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
            <div className="composer">
              <input
                ref={fileInputRef}
                hidden
                type="file"
                multiple
                accept=".pdf,.txt,.md,.csv,.json,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp3,.m4a,.wav,.mp4"
                onChange={(event) => void onFilesPicked(event.target.files)}
              />
              <button
                className="icon-button"
                disabled={filesBusy}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Upload files to project"
                title="Upload files to this project"
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
                disabled={loading || !conversationId || !prompt.trim() || isSending}
                onClick={() => void submit()}
                aria-label="Send message"
              >
                <Send size={18} />
              </button>
            </div>
            <p className="composer-caption">
              {filesBusy
                ? "Uploading project files..."
                : "Conversation, approved memory and project files persist across sessions."}
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
            <div className="rail-heading rail-heading-split">
              <span>
                <Brain size={17} />
                <strong>Memory</strong>
              </span>
              <small>{memories.length}/40</small>
            </div>

            <div className="memory-compose">
              <textarea
                maxLength={1500}
                rows={2}
                value={memoryDraft}
                onChange={(event) => setMemoryDraft(event.target.value)}
                placeholder="Something OlyHub should remember for this project..."
              />
              <div className="memory-controls">
                <select
                  value={memoryKind}
                  onChange={(event) => setMemoryKind(event.target.value as MemoryKind)}
                >
                  {MEMORY_KINDS.map((kind) => (
                    <option key={kind.value} value={kind.value}>
                      {kind.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Memory importance"
                  value={memoryImportance}
                  onChange={(event) => setMemoryImportance(Number(event.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>
                      Priority {value}
                    </option>
                  ))}
                </select>
              </div>
              <button
                className="rail-action"
                disabled={!memoryDraft.trim() || memoryBusy}
                onClick={() => void saveMemory()}
              >
                {memoryBusy ? "Saving..." : "Remember"}
              </button>
            </div>

            <div className="rail-list">
              {memories.length === 0 ? (
                <div className="empty-rail">
                  No approved project memory yet. Limits: 40 items / 15k characters.
                </div>
              ) : (
                memories.slice(0, 8).map((memory) => (
                  <div className="rail-list-item" key={memory.id}>
                    <div>
                      <small>
                        {memory.kind} · priority {memory.importance}
                      </small>
                      <p>{memory.content}</p>
                    </div>
                    <button
                      aria-label="Delete memory"
                      onClick={() => void removeMemory(memory.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rail-card">
            <div className="rail-heading rail-heading-split">
              <span>
                <FileText size={17} />
                <strong>Files</strong>
              </span>
              <small>{projectFiles.length}</small>
            </div>
            <div className="rail-list">
              {projectFiles.length === 0 ? (
                <div className="empty-rail">
                  Use the paperclip to upload private project files, up to 20 MB each.
                </div>
              ) : (
                projectFiles.slice(0, 12).map((file) => (
                  <div className="rail-list-item file-row" key={file.id}>
                    <div>
                      <p>{file.name}</p>
                      <small>{formatBytes(file.size_bytes)}</small>
                    </div>
                    <span className="row-actions">
                      <button
                        aria-label={"Download " + file.name}
                        onClick={() => void downloadFile(file)}
                      >
                        <Download size={13} />
                      </button>
                      <button
                        aria-label={"Delete " + file.name}
                        onClick={() => void removeFile(file)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>
            <p className="rail-footnote">
              Files are stored privately. Current AI context receives metadata only;
              content reading will be enabled through the capability layer.
            </p>
          </section>

          <section className="rail-card">
            <div className="rail-heading">
              <ShieldCheck size={17} />
              <strong>Last run</strong>
            </div>
            {runMeta ? (
              <dl className="run-grid">
                <div><dt>Provider</dt><dd>{runMeta.provider}</dd></div>
                <div><dt>Model</dt><dd>{runMeta.model}</dd></div>
                <div><dt>Calls</dt><dd>{runMeta.calls}</dd></div>
                <div><dt>Route</dt><dd title={runMeta.route}>{runMeta.route || runMeta.provider}</dd></div>
                <div><dt>Multi-provider</dt><dd>{runMeta.multiProvider ? "Yes" : "No"}</dd></div>
                <div><dt>Fallback</dt><dd>{runMeta.fallbackUsed ? "Used" : "No"}</dd></div>
                <div><dt>Degraded</dt><dd>{runMeta.degraded ? "Yes" : "No"}</dd></div>
                <div><dt>Request</dt><dd>{runMeta.requestId.slice(0, 8)}</dd></div>
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
