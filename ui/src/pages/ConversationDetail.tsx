import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MoreHorizontal,
  MessageSquare,
  Play,
  Reply,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { Link, useParams } from "@/lib/router";
import { authApi } from "../api/auth";
import { conversationsApi } from "../api/conversations";
import { issuesApi } from "../api/issues";
import { goalsApi } from "../api/goals";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { usePanel } from "../context/PanelContext";
import { AgentIcon } from "../components/AgentIconPicker";
import { ConversationParticipantsSidebar } from "../components/ConversationParticipantsSidebar";
import { Identity } from "../components/Identity";
import { MarkdownBody } from "../components/MarkdownBody";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatDateTime, relativeTime } from "../lib/utils";
import {
  extractStructuredMentionTokens,
  type ConversationActiveContextTarget,
  type ConversationTargetKind,
  type ConversationMessage,
} from "@paperclipai/shared";
import type { MarkdownEditorRef, MentionOption } from "../components/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const TARGET_KIND_LABELS: Record<ConversationTargetKind, string> = {
  issue: "Issue",
  goal: "Goal",
  project: "Project",
};

function resolveAuthorName(input: {
  authorType: string;
  authorUserId: string | null;
  authorAgentId: string | null;
  participantNames: Map<string, string>;
  currentUserId?: string | null;
}) {
  if (input.authorType === "agent" && input.authorAgentId) {
    return input.participantNames.get(input.authorAgentId) ?? "Agent";
  }
  if (input.authorType === "user") {
    return input.authorUserId && input.currentUserId === input.authorUserId
      ? "You"
      : "Board";
  }
  return "System";
}

function summarizeMessageBody(bodyMarkdown: string) {
  const normalized = bodyMarkdown.replace(/\s+/g, " ").trim();
  if (normalized.length <= 120) return normalized;
  return `${normalized.slice(0, 119)}…`;
}

function extractDraftTargets(markdown: string): ConversationActiveContextTarget[] {
  return extractStructuredMentionTokens(markdown)
    .filter(
      (token): token is typeof token & { kind: ConversationTargetKind } =>
        token.kind === "issue" || token.kind === "goal" || token.kind === "project",
    )
    .map((token) => ({
      targetKind: token.kind,
      targetId: token.targetId,
      displayText: token.displayText,
    }));
}

function ContextChip({
  label,
  value,
  onRemove,
}: {
  label: string;
  value: string;
  onRemove?: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs">
      <span className="font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="truncate text-foreground">{value}</span>
      {onRemove ? (
        <button
          type="button"
          className="text-muted-foreground transition-colors hover:text-foreground"
          onClick={onRemove}
          aria-label={`Remove ${value}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </span>
  );
}

function StampedContextRow({
  message,
  align = "left",
}: {
  message: ConversationMessage;
  align?: "left" | "right";
}) {
  const stampedRefs = message.refs.filter(
    (ref) =>
      ref.refOrigin === "active_context" &&
      (ref.refKind === "issue" ||
        ref.refKind === "goal" ||
        ref.refKind === "project"),
  );

  if (stampedRefs.length === 0) return null;

  return (
    <div
      className={cn(
        "mt-3 flex flex-wrap items-center gap-2",
        align === "right" && "justify-end",
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Linked context
      </span>
      {stampedRefs.map((ref) => (
        <ContextChip
          key={ref.id}
          label={TARGET_KIND_LABELS[ref.refKind as ConversationTargetKind]}
          value={ref.displayText}
        />
      ))}
    </div>
  );
}

const ConversationMessageRow = memo(function ConversationMessageRow({
  message,
  participantNames,
  participantIcons,
  companyBrandColor,
  currentUserId,
  onReply,
  onDelete,
  deletingMessageId,
}: {
  message: ConversationMessage;
  participantNames: Map<string, string>;
  participantIcons: Map<string, string | null>;
  companyBrandColor: string | null;
  currentUserId: string | null;
  onReply: (message: ConversationMessage) => void;
  onDelete: (message: ConversationMessage) => void;
  deletingMessageId: string | null;
}) {
  const authorLabel = resolveAuthorName({
    authorType: message.authorType,
    authorUserId: message.authorUserId,
    authorAgentId: message.authorAgentId,
    participantNames,
    currentUserId,
  });

  if (message.authorType === "system") {
    return (
      <div className="w-full py-4">
        <div className="max-w-4xl">
          <div className="inline-flex rounded-full bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
            <span title={formatDateTime(message.createdAt)}>
              {relativeTime(message.createdAt)}
            </span>
            <span className="mx-1.5">·</span>
            <span>System</span>
          </div>
          <div className="mt-3 text-sm text-foreground">
            <MarkdownBody mentionMode="structured">
              {message.bodyMarkdown}
            </MarkdownBody>
          </div>
          <StampedContextRow message={message} />
        </div>
      </div>
    );
  }

  const isCurrentUserMessage =
    message.authorType === "user" &&
    !!currentUserId &&
    message.authorUserId === currentUserId;
  const parentAuthorLabel = message.parentMessage
    ? resolveAuthorName({
      authorType: message.parentMessage.authorType,
      authorUserId: message.parentMessage.authorUserId,
      authorAgentId: message.parentMessage.authorAgentId,
      participantNames,
      currentUserId,
    })
    : null;
  const deletePending = deletingMessageId === message.id;
  const messageRunHref =
    message.authorType === "agent" && message.authorAgentId && message.runId
      ? `/agents/${message.authorAgentId}/runs/${message.runId}`
      : null;

  return (
    <div className="w-full py-4">
      <div className={cn("max-w-4xl", isCurrentUserMessage && "ml-auto text-right")}>
        <div
          className={cn(
            "mb-2 flex items-center gap-2",
            isCurrentUserMessage && "justify-end",
          )}
        >
          {message.authorType === "agent" ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "h-2 w-2 shrink-0 rounded-full"
                )}
              />
              <Avatar size="sm">
                <AvatarFallback>
                  <AgentIcon
                    icon={
                      message.authorAgentId
                        ? participantIcons.get(message.authorAgentId)
                        : null
                    }
                    className="h-3.5 w-3.5"
                  />
                </AvatarFallback>
              </Avatar>
              <span className="truncate text-xs">
                {authorLabel}
              </span>
            </span>
          ) : (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              {!isCurrentUserMessage ? (
                <span
                  className={cn(
                    "h-2 w-2 shrink-0 rounded-full",
                    !companyBrandColor && "bg-muted-foreground/40",
                  )}
                  style={companyBrandColor ? { backgroundColor: companyBrandColor } : undefined}
                />
              ) : null}
              <Identity name={authorLabel} size="sm" />
            </span>
          )}
          <span
            className="text-xs text-muted-foreground"
            title={formatDateTime(message.createdAt)}
          >
            {relativeTime(message.createdAt)}
          </span>
          <span className="text-xs text-muted-foreground">#{message.sequence}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                aria-label="Message actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isCurrentUserMessage ? "end" : "start"}>
              {messageRunHref ? (
                <DropdownMenuItem asChild>
                  <Link to={messageRunHref} className="no-underline text-inherit">
                    <Play className="h-4 w-4" />
                    View run
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                disabled={message.deletedAt !== null}
                onSelect={() => onReply(message)}
              >
                <Reply className="h-4 w-4" />
                Reply to
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={message.deletedAt !== null || deletePending}
                onSelect={() => onDelete(message)}
              >
                <Trash2 className="h-4 w-4" />
                {deletePending ? "Deleting..." : "Delete message"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div
          className={cn(
            isCurrentUserMessage
              ? "ml-auto w-fit max-w-3xl text-left"
              : "max-w-3xl pl-8 sm:pl-9",
          )}
        >
          {message.parentMessage ? (
            <div className="mb-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-left">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Replying to {parentAuthorLabel} · #{message.parentMessage.sequence}
              </p>
              <div className="min-w-0">
                {message.parentMessage.deletedAt ? (
                  <p className="mt-1 truncate text-xs italic text-muted-foreground">
                    This message was deleted.
                  </p>
                ) : (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {summarizeMessageBody(message.parentMessage.bodyMarkdown)}
                  </p>
                )}
              </div>
            </div>
          ) : null}
          <div className="text-sm leading-6 text-foreground">
            {message.deletedAt ? (
              <p className="italic text-muted-foreground">This message was deleted.</p>
            ) : (
              <MarkdownBody mentionMode="structured">
                {message.bodyMarkdown}
              </MarkdownBody>
            )}
          </div>
          <StampedContextRow
            message={message}
            align={isCurrentUserMessage ? "right" : "left"}
          />
        </div>
      </div>
    </div>
  );
});

export function ConversationDetail() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const queryClient = useQueryClient();
  const { companies, selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { openPanel, closePanel, setPanelVisible } = usePanel();
  const [draftBody, setDraftBody] = useState("");
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [mobileParticipantsOpen, setMobileParticipantsOpen] = useState(false);
  const lastMarkedSequenceRef = useRef(0);
  const lastScrolledMessageIdRef = useRef<string | null>(null);
  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MarkdownEditorRef | null>(null);
  const pendingOlderPageScrollRestoreRef = useRef<{
    previousHeight: number;
    previousTop: number;
  } | null>(null);

  const { data: session } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: authApi.getSession,
  });

  const {
    data: conversation,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.conversations.detail(conversationId!),
    queryFn: () => conversationsApi.get(conversationId!),
    enabled: !!conversationId,
  });

  const resolvedCompanyId = conversation?.companyId ?? selectedCompanyId;
  const resolvedCompany = useMemo(
    () => companies.find((company) => company.id === resolvedCompanyId) ?? null,
    [companies, resolvedCompanyId],
  );

  const {
    data: messagePages,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.conversations.messages(conversationId!, { limit: 50 }),
    queryFn: ({ pageParam }) =>
      conversationsApi.listMessages(conversationId!, {
        limit: 50,
        beforeSequence: pageParam,
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.hasMoreBefore
        ? lastPage.messages[0]?.sequence
        : undefined,
    enabled: !!conversationId,
  });
  const messages = useMemo(
    () => [...(messagePages?.pages ?? [])].reverse().flatMap((page) => page.messages),
    [messagePages?.pages],
  );
  const currentUserId = session?.user.id ?? session?.session.userId ?? null;
  const replyTarget = useMemo(
    () =>
      replyTargetId
        ? messages.find((message) => message.id === replyTargetId) ?? null
        : null,
    [messages, replyTargetId],
  );

  useEffect(() => {
    if (!conversationId) return;
    openPanel(<ConversationParticipantsSidebar conversationId={conversationId} />);
    return () => closePanel();
  }, [closePanel, conversationId, openPanel]);

  useEffect(() => {
    if (!conversation?.companyId || conversation.companyId === selectedCompanyId) {
      return;
    }
    setSelectedCompanyId(conversation.companyId, { source: "route_sync" });
  }, [conversation?.companyId, selectedCompanyId, setSelectedCompanyId]);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Conversations" },
      { label: conversation?.title ?? conversationId ?? "Conversation" },
    ]);
  }, [conversation?.title, conversationId, setBreadcrumbs]);

  const participantNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const participant of conversation?.participants ?? []) {
      map.set(
        participant.agentId,
        participant.agentName ?? participant.agentId,
      );
    }
    return map;
  }, [conversation?.participants]);

  const participantIcons = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const participant of conversation?.participants ?? []) {
      map.set(participant.agentId, participant.agentIcon ?? null);
    }
    return map;
  }, [conversation?.participants]);

  const markRead = useMutation({
    mutationFn: (lastReadSequence: number) =>
      conversationsApi.markRead(conversationId!, { lastReadSequence }),
    onSuccess: (readState) => {
      queryClient.setQueryData(
        queryKeys.conversations.detail(conversationId!),
        (current: typeof conversation | undefined) =>
          current
            ? {
              ...current,
              unreadCount: 0,
              viewerReadState: readState,
            }
            : current,
      );
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.list(resolvedCompanyId),
        });
      }
    },
  });

  const createMessage = useMutation({
    mutationFn: (payload: {
      bodyMarkdown: string;
      activeContextTargets: ConversationActiveContextTarget[];
      touchedTargets: ConversationActiveContextTarget[];
      parentId: string | null;
    }) =>
      conversationsApi.createMessage(conversationId!, {
        bodyMarkdown: payload.bodyMarkdown,
        parentId: payload.parentId,
        activeContextTargets: payload.activeContextTargets,
      }),
    onSuccess: async (_message, payload) => {
      setDraftBody("");
      setReplyTargetId(null);
      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.messages(conversationId!, { limit: 50 }),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId!),
        }),
        resolvedCompanyId
          ? queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.list(resolvedCompanyId),
          })
          : Promise.resolve(),
      ];

      for (const target of payload.touchedTargets) {
        if (target.targetKind === "issue") {
          invalidations.push(
            queryClient.invalidateQueries({
              queryKey: queryKeys.issues.linkedConversations(target.targetId),
            }),
          );
          continue;
        }
        if (target.targetKind === "goal") {
          invalidations.push(
            queryClient.invalidateQueries({
              queryKey: queryKeys.goals.linkedConversations(target.targetId),
            }),
          );
          continue;
        }
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: queryKeys.projects.linkedConversations(target.targetId),
          }),
        );
      }

      await Promise.all(invalidations);
    },
  });

  const deleteMessage = useMutation({
    mutationFn: async (message: ConversationMessage) => {
      await conversationsApi.deleteMessage(conversationId!, message.id);
      return message;
    },
    onSuccess: async (message) => {
      if (replyTargetId === message.id) {
        setReplyTargetId(null);
      }
      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.messages(conversationId!, { limit: 50 }),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId!),
        }),
        resolvedCompanyId
          ? queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.list(resolvedCompanyId),
          })
          : Promise.resolve(),
      ];

      for (const ref of message.refs) {
        if (ref.refKind === "issue") {
          invalidations.push(
            queryClient.invalidateQueries({
              queryKey: queryKeys.issues.linkedConversations(ref.targetId),
            }),
          );
          continue;
        }
        if (ref.refKind === "goal") {
          invalidations.push(
            queryClient.invalidateQueries({
              queryKey: queryKeys.goals.linkedConversations(ref.targetId),
            }),
          );
          continue;
        }
        if (ref.refKind === "project") {
          invalidations.push(
            queryClient.invalidateQueries({
              queryKey: queryKeys.projects.linkedConversations(ref.targetId),
            }),
          );
        }
      }

      await Promise.all(invalidations);
    },
  });

  const loadMentions = useCallback(
    async (query: string, kindFilter: "all" | "agent" | "issue" | "goal" | "project" | "user") => {
      if (!resolvedCompanyId) return [];
      const trimmedQuery = query.trim().toLowerCase();

      if (kindFilter === "user") return [];

      const loadIssueMentions = async () => {
        const issues = await issuesApi.list(
          resolvedCompanyId,
          trimmedQuery.length > 0 ? { q: trimmedQuery } : undefined,
        );
        return issues.slice(0, 6).map<MentionOption>((issue) => ({
          id: issue.id,
          name: issue.identifier ?? issue.title,
          kind: "issue",
        }));
      };

      const loadGoalMentions = async () => {
        const goals = await goalsApi.list(resolvedCompanyId, {
          ...(trimmedQuery.length > 0 ? { q: trimmedQuery } : {}),
          limit: 6,
        });
        return goals.map<MentionOption>((goal) => ({
          id: goal.id,
          name: goal.title,
          kind: "goal",
        }));
      };

      const loadProjectMentions = async () => {
        const projects = await projectsApi.list(resolvedCompanyId, {
          ...(trimmedQuery.length > 0 ? { q: trimmedQuery } : {}),
          limit: 6,
        });
        return projects.map<MentionOption>((project) => ({
          id: project.id,
          name: project.name,
          kind: "project",
          projectColor: project.color ?? null,
        }));
      };

      if (kindFilter === "all") {
        const settled = await Promise.allSettled([
          loadIssueMentions(),
          loadGoalMentions(),
          loadProjectMentions(),
        ]);
        return settled
          .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
          .slice(0, 8);
      }
      if (kindFilter === "agent") return [];
      if (kindFilter === "issue") return loadIssueMentions();
      if (kindFilter === "goal") return loadGoalMentions();
      if (kindFilter === "project") return loadProjectMentions();

      return [];
    },
    [resolvedCompanyId],
  );

  const participantMentionOptions = useMemo<MentionOption[]>(() => {
    return [...(conversation?.participants ?? [])]
      .map((participant) => ({
        id: participant.agentId,
        name: participant.agentName ?? participant.agentId,
        kind: "agent" as const,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [conversation?.participants]);

  const openConversationProperties = useCallback(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileParticipantsOpen(true);
      return;
    }
    setPanelVisible(true);
  }, [setPanelVisible]);

  useEffect(() => {
    lastMarkedSequenceRef.current = 0;
    lastScrolledMessageIdRef.current = null;
    pendingOlderPageScrollRestoreRef.current = null;
    setReplyTargetId(null);
    setMobileParticipantsOpen(false);
  }, [conversationId]);

  useEffect(() => {
    if (!messagePages || !replyTargetId) return;
    if (!replyTarget || replyTarget.deletedAt) {
      setReplyTargetId(null);
    }
  }, [messagePages, replyTarget, replyTargetId]);

  useEffect(() => {
    const lastReadSequence = conversation?.viewerReadState?.lastReadSequence ?? 0;
    if (lastMarkedSequenceRef.current > lastReadSequence) {
      lastMarkedSequenceRef.current = lastReadSequence;
    }
  }, [conversation?.viewerReadState?.lastReadSequence]);

  useEffect(() => {
    if (!conversation) return;
    const latestSequence =
      messages[messages.length - 1]?.sequence ??
      conversation.latestMessageSequence;
    const lastReadSequence = conversation.viewerReadState?.lastReadSequence ?? 0;
    if (
      latestSequence > lastReadSequence &&
      latestSequence > 0 &&
      lastMarkedSequenceRef.current < latestSequence
    ) {
      lastMarkedSequenceRef.current = latestSequence;
      markRead.mutate(latestSequence);
    }
  }, [
    conversation,
    markRead,
    messages,
  ]);

  useEffect(() => {
    const latestMessageId = messages[messages.length - 1]?.id ?? null;
    if (!latestMessageId || latestMessageId === lastScrolledMessageIdRef.current) {
      return;
    }
    const behavior = lastScrolledMessageIdRef.current ? "smooth" : "auto";
    lastScrolledMessageIdRef.current = latestMessageId;
    messagesEndRef.current?.scrollIntoView({ behavior });
  }, [conversationId, messages]);

  useLayoutEffect(() => {
    const restore = pendingOlderPageScrollRestoreRef.current;
    const scrollElement = messageScrollRef.current;
    if (!restore || !scrollElement) return;
    scrollElement.scrollTop =
      restore.previousTop + (scrollElement.scrollHeight - restore.previousHeight);
    pendingOlderPageScrollRestoreRef.current = null;
  }, [messages]);

  const maybeLoadOlderMessages = useCallback(() => {
    const scrollElement = messageScrollRef.current;
    if (!scrollElement || !hasNextPage || isFetchingNextPage) return;
    if (scrollElement.scrollTop > 120) return;
    pendingOlderPageScrollRestoreRef.current = {
      previousHeight: scrollElement.scrollHeight,
      previousTop: scrollElement.scrollTop,
    };
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleReplyToMessage = useCallback((message: ConversationMessage) => {
    if (message.deletedAt) return;
    setReplyTargetId(message.id);
    editorRef.current?.focus();
  }, []);

  const handleDeleteMessage = useCallback((message: ConversationMessage) => {
    if (message.deletedAt) return;
    deleteMessage.mutate(message);
  }, [deleteMessage.mutate]);
  const deletingMessageId = deleteMessage.isPending
    ? deleteMessage.variables?.id ?? null
    : null;
  const renderedMessages = useMemo(
    () =>
      messages.map((message) => (
        <ConversationMessageRow
          key={message.id}
          message={message}
          participantNames={participantNames}
          participantIcons={participantIcons}
          companyBrandColor={resolvedCompany?.brandColor ?? null}
          currentUserId={currentUserId}
          onReply={handleReplyToMessage}
          onDelete={handleDeleteMessage}
          deletingMessageId={deletingMessageId}
        />
      )),
    [
      currentUserId,
      deletingMessageId,
      handleDeleteMessage,
      handleReplyToMessage,
      messages,
      participantIcons,
      participantNames,
      resolvedCompany?.brandColor,
    ],
  );

  if (isLoading) {
    return <PageSkeleton variant="detail" />;
  }

  if (error) {
    return <p className="text-sm text-destructive">{error.message}</p>;
  }

  if (!conversation) {
    return (
      <EmptyState icon={MessageSquare} message="Conversation not found." />
    );
  }

  const sendMessage = () => {
    const normalizedDraft = draftBody.replace(/\u00A0/g, " ");
    const bodyMarkdown = normalizedDraft.trim();
    if (bodyMarkdown.length === 0) return;
    const selectedTargets = extractDraftTargets(bodyMarkdown);
    createMessage.mutate({
      bodyMarkdown,
      parentId: replyTarget?.id ?? null,
      activeContextTargets: selectedTargets,
      touchedTargets: selectedTargets,
    });
  };

  const participantHint =
    conversation.participants.length === 0
      ? "No participants yet. Add an agent from the properties panel to give this conversation a responder."
      : null;
  const replyTargetAuthorLabel = replyTarget
    ? resolveAuthorName({
      authorType: replyTarget.authorType,
      authorUserId: replyTarget.authorUserId,
      authorAgentId: replyTarget.authorAgentId,
      participantNames,
      currentUserId,
    })
    : null;

  return (
    <div className="flex h-full min-h-[calc(100dvh-12rem)] flex-col gap-2 md:min-h-0">
      <div className="flex items-center justify-end px-4 sm:px-6">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={openConversationProperties}
          aria-label="Open conversation properties"
          title="Open conversation properties"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>

      {participantHint && (
        <div className="px-4 sm:px-6">
          <div className="rounded-lg border border-border bg-background/70 px-3 py-2 text-sm">
            <p className="text-muted-foreground">{participantHint}</p>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden w-full">
        {!messagePages || messages.length === 0 ? (
          <div className="flex h-full min-h-[20rem] items-center justify-center">
            <EmptyState
              icon={MessageSquare}
              message="No messages yet."
            />
          </div>
        ) : (
          <div
            ref={messageScrollRef}
            className="h-full overflow-y-auto px-6 sm:px-4"
            onScroll={maybeLoadOlderMessages}
          >
            <div className="py-2">
              {hasNextPage || isFetchingNextPage ? (
                <div className="pb-2 text-center text-xs text-muted-foreground">
                  {isFetchingNextPage ? "Loading older messages..." : "Scroll up to load earlier messages"}
                </div>
              ) : null}
              {renderedMessages}
              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 px-4 pt-2 sm:px-6 md:bottom-0">
        <div className="mx-auto w-full">
          <div className="border border-border bg-background/95 shadow-lg backdrop-blur-sm">
            <div className="px-3 py-3">
              {replyTarget ? (
                <div className="mb-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Replying to {replyTargetAuthorLabel} · #{replyTarget.sequence}
                      </p>
                      <p className="mt-1 truncate text-sm text-foreground">
                        {replyTarget.deletedAt
                          ? "This message was deleted."
                          : summarizeMessageBody(replyTarget.bodyMarkdown)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                      onClick={() => setReplyTargetId(null)}
                      aria-label="Cancel reply"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : null}
              <MarkdownEditor
                ref={editorRef}
                value={draftBody}
                onChange={setDraftBody}
                mentionMode="structured"
                mentions={participantMentionOptions}
                loadMentions={loadMentions}
                placeholder="Ask, direct, or reply with linked work context..."
                onSubmit={sendMessage}
                bordered={false}
                contentClassName="min-h-[7rem] text-sm leading-6"
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-border/70 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {conversation.participants.length === 0
                  ? "No participants yet. Messages won’t wake any agents until you add one."
                  : "Use @ to mention agents, issues, goals, or projects."}
              </p>
              <Button
                onClick={sendMessage}
                disabled={
                  createMessage.isPending || draftBody.trim().length === 0
                }
              >
                <Send className="mr-1.5 h-4 w-4" />
                {createMessage.isPending ? "Sending..." : "Send"}
              </Button>
            </div>
          </div>

          {createMessage.isError && (
            <p className="mt-3 text-sm text-destructive">
              {createMessage.error instanceof Error
                ? createMessage.error.message
                : "Failed to send message"}
            </p>
          )}
          {deleteMessage.isError && (
            <p className="mt-3 text-sm text-destructive">
              {deleteMessage.error instanceof Error
                ? deleteMessage.error.message
                : "Failed to delete message"}
            </p>
          )}
        </div>
      </div>

      <Sheet
        open={mobileParticipantsOpen}
        onOpenChange={setMobileParticipantsOpen}
      >
        <SheetContent
          side="bottom"
          className="max-h-[85dvh] pb-[env(safe-area-inset-bottom)]"
        >
          <SheetHeader>
            <SheetTitle className="text-sm">Properties</SheetTitle>
          </SheetHeader>
          <ScrollArea className="flex-1 overflow-y-auto">
            <div className="px-4 pb-4">
              {conversationId ? (
                <ConversationParticipantsSidebar conversationId={conversationId} />
              ) : null}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
