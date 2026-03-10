import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import type { IssueComment, Agent } from "@paperclipai/shared";
import type { PluginUiContribution } from "@/api/plugins";
import { Button } from "@/components/ui/button";
import { Check, Copy, MoreHorizontal, Paperclip } from "lucide-react";
import { Identity } from "./Identity";
import { InlineEntitySelector, type InlineEntityOption } from "./InlineEntitySelector";
import { MarkdownBody } from "./MarkdownBody";
import { MarkdownEditor, type MarkdownEditorRef, type MentionOption } from "./MarkdownEditor";
import { StatusBadge } from "./StatusBadge";
import { AgentIcon } from "./AgentIconPicker";
import { formatDateTime } from "../lib/utils";
import { PluginSlotMount, type ResolvedPluginSlot } from "@/plugins/slots";
import { PluginLauncherButton, type ResolvedPluginLauncher } from "@/plugins/launchers";

interface CommentWithRunMeta extends IssueComment {
  runId?: string | null;
  runAgentId?: string | null;
}

interface LinkedRunItem {
  runId: string;
  status: string;
  agentId: string;
  createdAt: Date | string;
  startedAt: Date | string | null;
}

interface CommentReassignment {
  assigneeAgentId: string | null;
  assigneeUserId: string | null;
}

interface CommentThreadProps {
  comments: CommentWithRunMeta[];
  linkedRuns?: LinkedRunItem[];
  onAdd: (body: string, reopen?: boolean, reassignment?: CommentReassignment) => Promise<void>;
  issueStatus?: string;
  agentMap?: Map<string, Agent>;
  imageUploadHandler?: (file: File) => Promise<string>;
  /** Callback to attach an image file to the parent issue (not inline in a comment). */
  onAttachImage?: (file: File) => Promise<void>;
  draftKey?: string;
  liveRunSlot?: React.ReactNode;
  enableReassign?: boolean;
  reassignOptions?: InlineEntityOption[];
  currentAssigneeValue?: string;
  mentions?: MentionOption[];
  /** Plugin annotation slots to render below each comment. */
  commentAnnotationSlots?: ResolvedPluginSlot[];
  /** Plugin context menu item slots to render in the per-comment "more" menu. */
  commentContextMenuSlots?: ResolvedPluginSlot[];
  /** Plugin context menu launchers to render in the per-comment "more" menu. */
  commentContextMenuLaunchers?: ResolvedPluginLauncher[];
  /** Launcher contribution metadata keyed by pluginId, for rendering launcher buttons. */
  commentLauncherContributions?: Map<string, PluginUiContribution>;
  /** Parent issue ID, required for comment annotation slot context. */
  issueId?: string;
  /** Company ID for annotation slot context. */
  companyId?: string;
  /** Project ID for navigation context in plugin slots. */
  projectId?: string;
  /** Company prefix for plugin slot navigation context. */
  companyPrefix?: string;
}

const CLOSED_STATUSES = new Set(["done", "cancelled"]);
const DRAFT_DEBOUNCE_MS = 800;

function loadDraft(draftKey: string): string {
  try {
    return localStorage.getItem(draftKey) ?? "";
  } catch {
    return "";
  }
}

function saveDraft(draftKey: string, value: string) {
  try {
    if (value.trim()) {
      localStorage.setItem(draftKey, value);
    } else {
      localStorage.removeItem(draftKey);
    }
  } catch {
    // Ignore localStorage failures.
  }
}

function clearDraft(draftKey: string) {
  try {
    localStorage.removeItem(draftKey);
  } catch {
    // Ignore localStorage failures.
  }
}

function parseReassignment(target: string): CommentReassignment | null {
  if (!target || target === "__none__") {
    return { assigneeAgentId: null, assigneeUserId: null };
  }
  if (target.startsWith("agent:")) {
    const assigneeAgentId = target.slice("agent:".length);
    return assigneeAgentId ? { assigneeAgentId, assigneeUserId: null } : null;
  }
  if (target.startsWith("user:")) {
    const assigneeUserId = target.slice("user:".length);
    return assigneeUserId ? { assigneeAgentId: null, assigneeUserId } : null;
  }
  return null;
}

function CopyMarkdownButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground transition-colors"
      title="Copy as markdown"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function CommentMoreMenu({
  commentId,
  issueId,
  companyId,
  projectId,
  companyPrefix,
  contextMenuSlots,
  contextMenuLaunchers,
  launcherContributions,
}: {
  commentId: string;
  issueId: string;
  companyId?: string;
  projectId?: string;
  companyPrefix?: string;
  contextMenuSlots?: ResolvedPluginSlot[];
  contextMenuLaunchers?: ResolvedPluginLauncher[];
  launcherContributions?: Map<string, PluginUiContribution>;
}) {
  const [open, setOpen] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  const slotContext = useMemo(() => ({
    companyId: companyId ?? null,
    companyPrefix: companyPrefix ?? null,
    entityId: commentId,
    entityType: "comment" as const,
    parentEntityId: issueId,
    projectId: projectId ?? null,
  }), [companyId, companyPrefix, commentId, issueId, projectId]);

  const launcherContext = useMemo(() => ({
    companyId: companyId ?? undefined,
    entityId: commentId,
    entityType: "comment" as const,
  }), [companyId, commentId]);

  const renderItems = useCallback((onActivated?: () => void) => (
    <>
      {contextMenuLaunchers?.map((launcher) => {
        const contribution = launcherContributions?.get(launcher.pluginId);
        if (!contribution) return null;
        return (
          <PluginLauncherButton
            key={`${launcher.pluginKey}:${launcher.id}:${commentId}`}
            launcher={launcher}
            contribution={contribution}
            context={launcherContext}
            onActivated={onActivated}
          />
        );
      })}
      {contextMenuSlots?.map((slot) => (
        <PluginSlotMount
          key={`${slot.pluginKey}:${slot.id}:${commentId}`}
          slot={slot}
          context={slotContext}
        />
      ))}
    </>
  ), [contextMenuLaunchers, contextMenuSlots, launcherContributions, commentId, slotContext, launcherContext]);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const menuWidth = contentRef.current?.offsetWidth ?? 192;
    const menuHeight = contentRef.current?.offsetHeight ?? 0;
    const margin = 8;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const left = Math.max(
      margin,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - margin),
    );
    const top = menuHeight > 0 && spaceBelow < menuHeight
      ? Math.max(margin, rect.top - menuHeight - 4)
      : rect.bottom + 4;

    setMenuPosition({ top, left });
  }, []);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const check = () => {
      const visible = el.childElementCount > 0 || (el.textContent?.trim().length ?? 0) > 0;
      setHasContent(visible);
      if (!visible) setOpen(false);
    };

    const observer = new MutationObserver(check);
    observer.observe(el, { childList: true, subtree: true, characterData: true });
    check();

    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (contentRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    const handleViewportChange = () => updateMenuPosition();

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, updateMenuPosition]);

  return (
    <>
      {hasContent && (
        <button
          ref={triggerRef}
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Comment actions"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            if (open) {
              setOpen(false);
              return;
            }
            setMenuPosition(null);
            setOpen(true);
          }}
        >
          <MoreHorizontal className="h-3 w-3" />
        </button>
      )}
      <div
        ref={contentRef}
        role={open ? "menu" : undefined}
        style={open ? { ...(menuPosition ?? {}), visibility: menuPosition ? "visible" : "hidden" } : undefined}
        className={`w-48 rounded-md border bg-popover p-1 text-popover-foreground shadow-md ${open ? "fixed z-50 space-y-0.5" : "hidden"}`}
      >
        {renderItems(() => setOpen(false))}
      </div>
    </>
  );
}

type TimelineItem =
  | { kind: "comment"; id: string; createdAtMs: number; comment: CommentWithRunMeta }
  | { kind: "run"; id: string; createdAtMs: number; run: LinkedRunItem };

const TimelineList = memo(function TimelineList({
  timeline,
  agentMap,
  highlightCommentId,
  commentAnnotationSlots,
  commentContextMenuSlots,
  commentContextMenuLaunchers,
  commentLauncherContributions,
  issueId,
  companyId,
  projectId,
  companyPrefix,
}: {
  timeline: TimelineItem[];
  agentMap?: Map<string, Agent>;
  highlightCommentId?: string | null;
  commentAnnotationSlots?: ResolvedPluginSlot[];
  commentContextMenuSlots?: ResolvedPluginSlot[];
  commentContextMenuLaunchers?: ResolvedPluginLauncher[];
  commentLauncherContributions?: Map<string, PluginUiContribution>;
  issueId?: string;
  companyId?: string;
  projectId?: string;
  companyPrefix?: string;
}) {
  const hasContextMenu = (commentContextMenuSlots && commentContextMenuSlots.length > 0)
    || (commentContextMenuLaunchers && commentContextMenuLaunchers.length > 0);
  if (timeline.length === 0) {
    return <p className="text-sm text-muted-foreground">No comments or runs yet.</p>;
  }

  return (
    <div className="space-y-3">
      {timeline.map((item) => {
        if (item.kind === "run") {
          const run = item.run;
          return (
            <div key={`run:${run.runId}`} className="border border-border bg-accent/20 p-3 overflow-hidden min-w-0 rounded-sm">
              <div className="flex items-center justify-between mb-2">
                <Link to={`/agents/${run.agentId}`} className="hover:underline">
                  <Identity
                    name={agentMap?.get(run.agentId)?.name ?? run.agentId.slice(0, 8)}
                    size="sm"
                  />
                </Link>
                <span className="text-xs text-muted-foreground">
                  {formatDateTime(run.startedAt ?? run.createdAt)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Run</span>
                <Link
                  to={`/agents/${run.agentId}/runs/${run.runId}`}
                  className="inline-flex items-center rounded-md border border-border bg-accent/40 px-2 py-1 font-mono text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
                >
                  {run.runId.slice(0, 8)}
                </Link>
                <StatusBadge status={run.status} />
              </div>
            </div>
          );
        }

        const comment = item.comment;
        const isHighlighted = highlightCommentId === comment.id;
        return (
          <div
            key={comment.id}
            id={`comment-${comment.id}`}
            className={`border p-3 overflow-hidden min-w-0 rounded-sm transition-colors duration-1000 ${isHighlighted ? "border-primary/50 bg-primary/5" : "border-border"}`}
          >
            <div className="flex items-center justify-between mb-1">
              {comment.authorAgentId ? (
                <Link to={`/agents/${comment.authorAgentId}`} className="hover:underline">
                  <Identity
                    name={agentMap?.get(comment.authorAgentId)?.name ?? comment.authorAgentId.slice(0, 8)}
                    size="sm"
                  />
                </Link>
              ) : (
                <Identity name="You" size="sm" />
              )}
              <span className="flex items-center gap-1.5">
                <a
                  href={`#comment-${comment.id}`}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors"
                >
                  {formatDateTime(comment.createdAt)}
                </a>
                <CopyMarkdownButton text={comment.body} />
                {hasContextMenu && issueId && (
                  <CommentMoreMenu
                    commentId={comment.id}
                    issueId={issueId}
                    companyId={companyId}
                    projectId={projectId}
                    companyPrefix={companyPrefix}
                    contextMenuSlots={commentContextMenuSlots}
                    contextMenuLaunchers={commentContextMenuLaunchers}
                    launcherContributions={commentLauncherContributions}
                  />
                )}
              </span>
            </div>
            <MarkdownBody className="text-sm">{comment.body}</MarkdownBody>
            {comment.runId && (
              <div className="mt-2 pt-2 border-t border-border/60">
                {comment.runAgentId ? (
                  <Link
                    to={`/agents/${comment.runAgentId}/runs/${comment.runId}`}
                    className="inline-flex items-center rounded-md border border-border bg-accent/30 px-2 py-1 text-[10px] font-mono text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
                  >
                    run {comment.runId.slice(0, 8)}
                  </Link>
                ) : (
                  <span className="inline-flex items-center rounded-md border border-border bg-accent/30 px-2 py-1 text-[10px] font-mono text-muted-foreground">
                    run {comment.runId.slice(0, 8)}
                  </span>
                )}
              </div>
            )}
            {commentAnnotationSlots && commentAnnotationSlots.length > 0 && issueId && (
              <div className="mt-2 pt-2 border-t border-border/60 space-y-1">
                {commentAnnotationSlots.map((slot) => (
                  <PluginSlotMount
                    key={`${slot.pluginKey}:${slot.id}:${comment.id}`}
                    slot={slot}
                    context={{
                      companyId: companyId ?? null,
                      companyPrefix: companyPrefix ?? null,
                      entityId: comment.id,
                      entityType: "comment",
                      parentEntityId: issueId,
                      projectId: projectId ?? null,
                    }}
                    missingBehavior="hidden"
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

export function CommentThread({
  comments,
  linkedRuns = [],
  onAdd,
  issueStatus,
  agentMap,
  imageUploadHandler,
  onAttachImage,
  draftKey,
  liveRunSlot,
  enableReassign = false,
  reassignOptions = [],
  currentAssigneeValue = "",
  mentions: providedMentions,
  commentAnnotationSlots,
  commentContextMenuSlots,
  commentContextMenuLaunchers,
  commentLauncherContributions,
  issueId,
  companyId,
  projectId,
  companyPrefix,
}: CommentThreadProps) {
  const [body, setBody] = useState("");
  const [reopen, setReopen] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [reassignTarget, setReassignTarget] = useState(currentAssigneeValue);
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null);
  const editorRef = useRef<MarkdownEditorRef>(null);
  const attachInputRef = useRef<HTMLInputElement | null>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  const hasScrolledRef = useRef(false);

  const isClosed = issueStatus ? CLOSED_STATUSES.has(issueStatus) : false;

  const timeline = useMemo<TimelineItem[]>(() => {
    const commentItems: TimelineItem[] = comments.map((comment) => ({
      kind: "comment",
      id: comment.id,
      createdAtMs: new Date(comment.createdAt).getTime(),
      comment,
    }));
    const runItems: TimelineItem[] = linkedRuns.map((run) => ({
      kind: "run",
      id: run.runId,
      createdAtMs: new Date(run.startedAt ?? run.createdAt).getTime(),
      run,
    }));
    return [...commentItems, ...runItems].sort((a, b) => {
      if (a.createdAtMs !== b.createdAtMs) return a.createdAtMs - b.createdAtMs;
      if (a.kind === b.kind) return a.id.localeCompare(b.id);
      return a.kind === "comment" ? -1 : 1;
    });
  }, [comments, linkedRuns]);

  // Build mention options from agent map (exclude terminated agents)
  const mentions = useMemo<MentionOption[]>(() => {
    if (providedMentions) return providedMentions;
    if (!agentMap) return [];
    return Array.from(agentMap.values())
      .filter((a) => a.status !== "terminated")
      .map((a) => ({
        id: a.id,
        name: a.name,
      }));
  }, [agentMap, providedMentions]);

  useEffect(() => {
    if (!draftKey) return;
    setBody(loadDraft(draftKey));
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      saveDraft(draftKey, body);
    }, DRAFT_DEBOUNCE_MS);
  }, [body, draftKey]);

  useEffect(() => {
    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, []);

  useEffect(() => {
    setReassignTarget(currentAssigneeValue);
  }, [currentAssigneeValue]);

  // Scroll to comment when URL hash matches #comment-{id}
  useEffect(() => {
    const hash = location.hash;
    if (!hash.startsWith("#comment-") || comments.length === 0) return;
    const commentId = hash.slice("#comment-".length);
    // Only scroll once per hash
    if (hasScrolledRef.current) return;
    const el = document.getElementById(`comment-${commentId}`);
    if (el) {
      hasScrolledRef.current = true;
      setHighlightCommentId(commentId);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Clear highlight after animation
      const timer = setTimeout(() => setHighlightCommentId(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [location.hash, comments]);

  async function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    const hasReassignment = enableReassign && reassignTarget !== currentAssigneeValue;
    const reassignment = hasReassignment ? parseReassignment(reassignTarget) : null;

    setSubmitting(true);
    try {
      await onAdd(trimmed, isClosed && reopen ? true : undefined, reassignment ?? undefined);
      setBody("");
      if (draftKey) clearDraft(draftKey);
      setReopen(false);
      setReassignTarget(currentAssigneeValue);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttachFile(evt: ChangeEvent<HTMLInputElement>) {
    const file = evt.target.files?.[0];
    if (!file || !onAttachImage) return;
    setAttaching(true);
    try {
      await onAttachImage(file);
    } finally {
      setAttaching(false);
      if (attachInputRef.current) attachInputRef.current.value = "";
    }
  }

  const canSubmit = !submitting && !!body.trim();

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Comments &amp; Runs ({timeline.length})</h3>

      <TimelineList timeline={timeline} agentMap={agentMap} highlightCommentId={highlightCommentId} commentAnnotationSlots={commentAnnotationSlots} commentContextMenuSlots={commentContextMenuSlots} commentContextMenuLaunchers={commentContextMenuLaunchers} commentLauncherContributions={commentLauncherContributions} issueId={issueId} companyId={companyId} projectId={projectId} companyPrefix={companyPrefix} />

      {liveRunSlot}

      <div className="space-y-2">
        <MarkdownEditor
          ref={editorRef}
          value={body}
          onChange={setBody}
          placeholder="Leave a comment..."
          mentions={mentions}
          onSubmit={handleSubmit}
          imageUploadHandler={imageUploadHandler}
          contentClassName="min-h-[60px] text-sm"
        />
        <div className="flex items-center justify-end gap-3">
          {onAttachImage && (
            <div className="mr-auto flex items-center gap-3">
              <input
                ref={attachInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handleAttachFile}
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => attachInputRef.current?.click()}
                disabled={attaching}
                title="Attach image"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            </div>
          )}
          {isClosed && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={reopen}
                onChange={(e) => setReopen(e.target.checked)}
                className="rounded border-border"
              />
              Re-open
            </label>
          )}
          {enableReassign && reassignOptions.length > 0 && (
            <InlineEntitySelector
              value={reassignTarget}
              options={reassignOptions}
              placeholder="Assignee"
              noneLabel="No assignee"
              searchPlaceholder="Search assignees..."
              emptyMessage="No assignees found."
              onChange={setReassignTarget}
              className="text-xs h-8"
              renderTriggerValue={(option) => {
                if (!option) return <span className="text-muted-foreground">Assignee</span>;
                const agentId = option.id.startsWith("agent:") ? option.id.slice("agent:".length) : null;
                const agent = agentId ? agentMap?.get(agentId) : null;
                return (
                  <>
                    {agent ? (
                      <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </>
                );
              }}
              renderOption={(option) => {
                if (!option.id) return <span className="truncate">{option.label}</span>;
                const agentId = option.id.startsWith("agent:") ? option.id.slice("agent:".length) : null;
                const agent = agentId ? agentMap?.get(agentId) : null;
                return (
                  <>
                    {agent ? (
                      <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                    <span className="truncate">{option.label}</span>
                  </>
                );
              }}
            />
          )}
          <Button size="sm" disabled={!canSubmit} onClick={handleSubmit}>
            {submitting ? "Posting..." : "Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}
