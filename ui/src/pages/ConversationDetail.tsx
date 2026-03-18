import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  Clock3,
  Link2,
  MessageSquare,
  RefreshCcw,
  Send,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { useParams } from "@/lib/router";
import { conversationsApi } from "../api/conversations";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { goalsApi } from "../api/goals";
import { projectsApi } from "../api/projects";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { ConversationTargetPicker } from "../components/ConversationTargetPicker";
import { MarkdownBody } from "../components/MarkdownBody";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { StatusBadge } from "../components/StatusBadge";
import { queryKeys } from "../lib/queryKeys";
import {
  extractStructuredMentionTokens,
  type ConversationActiveContextTarget,
  type ConversationTargetLink,
  type ConversationTargetKind,
} from "@paperclipai/shared";
import type { MentionOption } from "../components/MarkdownEditor";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

const TARGET_KIND_LABELS: Record<ConversationTargetKind, string> = {
  issue: "Issue",
  goal: "Goal",
  project: "Project",
};

function formatTimestamp(value: Date | string) {
  return new Date(value).toLocaleString();
}

function formatSpend(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function resolveAuthorName(input: {
  authorType: string;
  authorUserId: string | null;
  authorAgentId: string | null;
  participantNames: Map<string, string>;
}) {
  if (input.authorType === "agent" && input.authorAgentId) {
    return input.participantNames.get(input.authorAgentId) ?? "Agent";
  }
  if (input.authorType === "user") return "Board";
  return "System";
}

function targetRefKey(input: {
  targetKind: ConversationTargetKind;
  targetId: string;
}) {
  return `${input.targetKind}:${input.targetId}`;
}

function targetKey(target: ConversationActiveContextTarget) {
  return targetRefKey(target);
}

function mergeContextTargets(
  current: ConversationActiveContextTarget[],
  incoming: ConversationActiveContextTarget[],
) {
  if (incoming.length === 0) return current;
  const merged = new Map(
    current.map((target) => [targetKey(target), target] as const),
  );
  let changed = false;
  for (const target of incoming) {
    const key = targetKey(target);
    if (!merged.has(key)) {
      merged.set(key, target);
      changed = true;
    }
  }
  return changed ? [...merged.values()] : current;
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

function fallbackTargetLabel(
  targetKind: ConversationTargetKind,
  targetId: string,
) {
  return `${TARGET_KIND_LABELS[targetKind]} ${targetId.slice(0, 8)}`;
}

type ConversationTargetLinkGroup = {
  key: string;
  targetKind: ConversationTargetKind;
  targetId: string;
  displayText: string | null;
  latestLinkedMessageSequence: number;
  latestLinkedAt: string | Date;
  links: ConversationTargetLink[];
};

function groupConversationTargetLinks(
  links: ConversationTargetLink[],
): ConversationTargetLinkGroup[] {
  const grouped = new Map<string, ConversationTargetLinkGroup>();

  for (const link of links) {
    const key = targetRefKey(link);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        key,
        targetKind: link.targetKind,
        targetId: link.targetId,
        displayText: link.displayText,
        latestLinkedMessageSequence: link.latestLinkedMessageSequence,
        latestLinkedAt: link.updatedAt,
        links: [link],
      });
      continue;
    }

    existing.links.push(link);
    if (!existing.displayText && link.displayText) {
      existing.displayText = link.displayText;
    }
    if (link.latestLinkedMessageSequence > existing.latestLinkedMessageSequence) {
      existing.latestLinkedMessageSequence = link.latestLinkedMessageSequence;
      existing.latestLinkedAt = link.updatedAt;
    }
  }

  return [...grouped.values()].sort((left, right) => {
    const delta =
      new Date(right.latestLinkedAt).getTime() -
      new Date(left.latestLinkedAt).getTime();
    if (delta !== 0) return delta;
    return left.key.localeCompare(right.key);
  });
}

function invalidateTargetLinkedConversationsQuery(
  queryClient: ReturnType<typeof useQueryClient>,
  targetKind: ConversationTargetKind,
  targetId: string,
) {
  if (targetKind === "issue") {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.issues.linkedConversations(targetId),
    });
  }
  if (targetKind === "goal") {
    return queryClient.invalidateQueries({
      queryKey: queryKeys.goals.linkedConversations(targetId),
    });
  }
  return queryClient.invalidateQueries({
    queryKey: queryKeys.projects.linkedConversations(targetId),
  });
}

export function ConversationDetail() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const queryClient = useQueryClient();
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [draftBody, setDraftBody] = useState("");
  const [activeContextTargets, setActiveContextTargets] = useState<ConversationActiveContextTarget[]>([]);
  const [linkTarget, setLinkTarget] = useState<ConversationActiveContextTarget | null>(null);
  const [selectedLinkAgentIds, setSelectedLinkAgentIds] = useState<string[]>([]);
  const [participantDialogOpen, setParticipantDialogOpen] = useState(false);
  const [selectedParticipantAgentIds, setSelectedParticipantAgentIds] = useState<string[]>([]);
  const [selectedUnlinkAgentIdsByTarget, setSelectedUnlinkAgentIdsByTarget] = useState<Record<string, string[]>>({});
  const lastMarkedSequenceRef = useRef(0);

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

  const { data: companyAgents = [] } = useQuery({
    queryKey: queryKeys.agents.list(resolvedCompanyId!),
    queryFn: () => agentsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId,
  });

  const { data: messagePage } = useQuery({
    queryKey: queryKeys.conversations.messages(conversationId!, { limit: 50 }),
    queryFn: () => conversationsApi.listMessages(conversationId!, { limit: 50 }),
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (!conversation?.companyId || conversation.companyId === selectedCompanyId) {
      return;
    }
    setSelectedCompanyId(conversation.companyId, { source: "route_sync" });
  }, [conversation?.companyId, selectedCompanyId, setSelectedCompanyId]);

  useEffect(() => {
    setBreadcrumbs([
      { label: "Conversations", href: "conversations" },
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

  const availableParticipantAgents = useMemo(() => {
    const currentParticipantIds = new Set(
      (conversation?.participants ?? []).map((participant) => participant.agentId),
    );
    return companyAgents
      .filter(
        (agent) =>
          agent.status !== "terminated" &&
          !currentParticipantIds.has(agent.id),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [companyAgents, conversation?.participants]);

  const targetLinkGroups = useMemo(
    () => groupConversationTargetLinks(conversation?.targetLinks ?? []),
    [conversation?.targetLinks],
  );

  const latestVisibleMessage =
    messagePage?.messages[messagePage.messages.length - 1] ?? null;

  const archiveConversation = useMutation({
    mutationFn: () =>
      conversationsApi.update(conversationId!, {
        status: conversation?.status === "archived" ? "active" : "archived",
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.conversations.detail(updated.id), updated);
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.list(updated.companyId),
      });
    },
  });

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
    }) =>
      conversationsApi.createMessage(conversationId!, {
        bodyMarkdown: payload.bodyMarkdown,
        activeContextTargets: payload.activeContextTargets,
      }),
    onSuccess: async (_message, payload) => {
      setDraftBody("");
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

  const createTargetLink = useMutation({
    mutationFn: async () => {
      if (!linkTarget) {
        throw new Error("Select a target to link.");
      }
      if (!latestVisibleMessage) {
        throw new Error("Linking requires at least one visible message.");
      }
      if (selectedLinkAgentIds.length === 0) {
        throw new Error("Select at least one participant.");
      }
      return conversationsApi.createTargetLinks(conversationId!, {
        targetKind: linkTarget.targetKind,
        targetId: linkTarget.targetId,
        anchorMessageId: latestVisibleMessage.id,
        agentIds: selectedLinkAgentIds,
      });
    },
    onSuccess: async () => {
      const target = linkTarget;
      setLinkTarget(null);
      setSelectedLinkAgentIds([]);

      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId!),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.messages(conversationId!, { limit: 50 }),
        }),
      ];

      if (resolvedCompanyId) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.list(resolvedCompanyId),
          }),
        );
      }

      if (target?.targetKind === "issue") {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: queryKeys.issues.linkedConversations(target.targetId),
          }),
        );
      } else if (target?.targetKind === "goal") {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: queryKeys.goals.linkedConversations(target.targetId),
          }),
        );
      } else if (target?.targetKind === "project") {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: queryKeys.projects.linkedConversations(target.targetId),
          }),
        );
      }

      await Promise.all(invalidations);
    },
  });

  const addParticipants = useMutation({
    mutationFn: async (agentIds: string[]) => {
      for (const agentId of agentIds) {
        await conversationsApi.addParticipant(conversationId!, { agentId });
      }
    },
    onSuccess: async () => {
      setParticipantDialogOpen(false);
      setSelectedParticipantAgentIds([]);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId!),
        }),
        resolvedCompanyId
          ? queryClient.invalidateQueries({
              queryKey: queryKeys.conversations.list(resolvedCompanyId),
            })
          : Promise.resolve(),
      ]);
    },
  });

  const removeParticipant = useMutation({
    mutationFn: async (agentId: string) => {
      await conversationsApi.removeParticipant(conversationId!, agentId);
      return agentId;
    },
    onSuccess: async (agentId) => {
      const affectedTargets = new Map<
        string,
        { targetKind: ConversationTargetKind; targetId: string }
      >();
      for (const link of conversation?.targetLinks ?? []) {
        if (link.agentId !== agentId) continue;
        affectedTargets.set(targetRefKey(link), {
          targetKind: link.targetKind,
          targetId: link.targetId,
        });
      }

      const invalidations: Promise<unknown>[] = [
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId!),
        }),
        resolvedCompanyId
          ? queryClient.invalidateQueries({
              queryKey: queryKeys.conversations.list(resolvedCompanyId),
            })
          : Promise.resolve(),
      ];

      for (const target of affectedTargets.values()) {
        invalidations.push(
          invalidateTargetLinkedConversationsQuery(
            queryClient,
            target.targetKind,
            target.targetId,
          ),
        );
      }

      await Promise.all(invalidations);
    },
  });

  const deleteTargetLinks = useMutation({
    mutationFn: async (input: {
      targetKind: ConversationTargetKind;
      targetId: string;
      agentIds: string[];
    }) => {
      await conversationsApi.deleteTargetLinks(conversationId!, input);
      return input;
    },
    onSuccess: async (input) => {
      setSelectedUnlinkAgentIdsByTarget((current) => {
        const next = { ...current };
        delete next[targetRefKey(input)];
        return next;
      });

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId!),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.messages(conversationId!, { limit: 50 }),
        }),
        invalidateTargetLinkedConversationsQuery(
          queryClient,
          input.targetKind,
          input.targetId,
        ),
      ]);
    },
  });

  const loadMentions = useCallback(
    async (query: string, kindFilter: "all" | "agent" | "issue" | "goal" | "project" | "user") => {
      if (!resolvedCompanyId) return [];
      if (kindFilter === "all" || kindFilter === "user") return [];

      const results: MentionOption[] = [];
      const trimmedQuery = query.trim().toLowerCase();
      if (kindFilter === "agent") {
        for (const participant of conversation?.participants ?? []) {
          const participantName = participant.agentName ?? participant.agentId;
          if (
            trimmedQuery.length > 0 &&
            !participantName.toLowerCase().includes(trimmedQuery)
          ) {
            continue;
          }
          results.push({
            id: participant.agentId,
            name: participantName,
            kind: "agent",
          });
        }
        return results.slice(0, 6);
      }

      if (kindFilter === "issue") {
        const issues = await issuesApi.list(
          resolvedCompanyId,
          trimmedQuery.length > 0 ? { q: trimmedQuery } : undefined,
        );
        for (const issue of issues.slice(0, 6)) {
          results.push({
            id: issue.id,
            name: issue.identifier ?? issue.title,
            kind: "issue",
          });
        }
        return results;
      }
      if (kindFilter === "goal") {
        const goals = await goalsApi.list(resolvedCompanyId, {
          ...(trimmedQuery.length > 0 ? { q: trimmedQuery } : {}),
          limit: 6,
        });
        for (const goal of goals) {
          results.push({
            id: goal.id,
            name: goal.title,
            kind: "goal",
          });
        }
        return results;
      }
      if (kindFilter === "project") {
        const projects = await projectsApi.list(resolvedCompanyId, {
          ...(trimmedQuery.length > 0 ? { q: trimmedQuery } : {}),
          limit: 6,
        });
        for (const project of projects) {
          results.push({
            id: project.id,
            name: project.name,
            kind: "project",
            projectColor: project.color ?? null,
          });
        }
        return results;
      }

      return [];
    },
    [conversation?.participants, resolvedCompanyId],
  );

  useEffect(() => {
    lastMarkedSequenceRef.current = 0;
    setActiveContextTargets([]);
    setLinkTarget(null);
    setSelectedLinkAgentIds([]);
    setParticipantDialogOpen(false);
    setSelectedParticipantAgentIds([]);
    setSelectedUnlinkAgentIdsByTarget({});
  }, [conversationId]);

  useEffect(() => {
    const mentionedTargets = extractDraftTargets(draftBody);
    if (mentionedTargets.length === 0) return;
    setActiveContextTargets((current) =>
      mergeContextTargets(current, mentionedTargets),
    );
  }, [draftBody]);

  useEffect(() => {
    setSelectedLinkAgentIds((current) =>
      current.filter((agentId) =>
        (conversation?.participants ?? []).some((participant) => participant.agentId === agentId),
      ),
    );
  }, [conversation?.participants]);

  useEffect(() => {
    setSelectedParticipantAgentIds((current) =>
      current.filter((agentId) =>
        availableParticipantAgents.some((agent) => agent.id === agentId),
      ),
    );
  }, [availableParticipantAgents]);

  useEffect(() => {
    const linkedAgentIdsByTarget = new Map<string, Set<string>>();
    for (const group of targetLinkGroups) {
      linkedAgentIdsByTarget.set(
        group.key,
        new Set(group.links.map((link) => link.agentId)),
      );
    }
    setSelectedUnlinkAgentIdsByTarget((current) => {
      let changed = false;
      const next: Record<string, string[]> = {};
      for (const [key, selectedAgentIds] of Object.entries(current)) {
        const allowedAgentIds = linkedAgentIdsByTarget.get(key);
        if (!allowedAgentIds) {
          changed = true;
          continue;
        }
        const filtered = selectedAgentIds.filter((agentId) =>
          allowedAgentIds.has(agentId),
        );
        if (filtered.length !== selectedAgentIds.length) {
          changed = true;
        }
        if (filtered.length > 0) {
          next[key] = filtered;
        }
      }
      return changed ? next : current;
    });
  }, [targetLinkGroups]);

  useEffect(() => {
    if (!conversation) return;
    const latestSequence =
      messagePage?.messages[messagePage.messages.length - 1]?.sequence ??
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
    messagePage?.messages,
  ]);

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
    const bodyMarkdown = draftBody.trim();
    if (bodyMarkdown.length === 0) return;
    const touchedTargets = mergeContextTargets(
      activeContextTargets,
      extractDraftTargets(bodyMarkdown),
    );
    createMessage.mutate({
      bodyMarkdown,
      activeContextTargets,
      touchedTargets,
    });
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-xl">{conversation.title}</CardTitle>
              <StatusBadge status={conversation.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {conversation.participants.length === 0
                ? "No participants yet"
                : conversation.participants
                    .map((participant) => participant.agentName ?? participant.agentId)
                    .join(", ")}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => archiveConversation.mutate()}
            disabled={archiveConversation.isPending}
          >
            {conversation.status === "archived" ? (
              <RefreshCcw className="mr-1.5 h-4 w-4" />
            ) : (
              <Archive className="mr-1.5 h-4 w-4" />
            )}
            {conversation.status === "archived" ? "Reopen" : "Archive"}
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-5">
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Spend
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {formatSpend(conversation.costSummary.spendCents)}
            </p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Input Tokens
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {conversation.costSummary.inputTokens}
            </p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Output Tokens
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {conversation.costSummary.outputTokens}
            </p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Runs
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {conversation.costSummary.runCount}
            </p>
          </div>
          <div className="rounded-lg border border-border px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Last Cost
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {conversation.costSummary.lastOccurredAt
                ? formatTimestamp(conversation.costSummary.lastOccurredAt)
                : "No usage yet"}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Participants</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage which agents can see and respond in this conversation.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setParticipantDialogOpen(true)}
            disabled={availableParticipantAgents.length === 0}
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            Add Participant
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {conversation.participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No participants yet.
            </p>
          ) : (
            conversation.participants.map((participant) => (
              <div
                key={participant.agentId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {participant.agentName ?? participant.agentId}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {participant.agentTitle ?? participant.agentRole ?? "Agent"}
                    {participant.agentStatus ? ` · ${participant.agentStatus}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeParticipant.mutate(participant.agentId)}
                  disabled={removeParticipant.isPending}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  {removeParticipant.isPending &&
                  removeParticipant.variables === participant.agentId
                    ? "Removing…"
                    : "Remove"}
                </Button>
              </div>
            ))
          )}

          {availableParticipantAgents.length === 0 && (
            <p className="text-xs text-muted-foreground">
              All non-terminated agents in this company are already participating.
            </p>
          )}

          {addParticipants.isError && (
            <p className="text-sm text-destructive">
              {addParticipants.error instanceof Error
                ? addParticipants.error.message
                : "Failed to add participant"}
            </p>
          )}

          {removeParticipant.isError && (
            <p className="text-sm text-destructive">
              {removeParticipant.error instanceof Error
                ? removeParticipant.error.message
                : "Failed to remove participant"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reply</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {resolvedCompanyId && (
            <div className="space-y-3 rounded-lg border border-border/70 bg-accent/20 px-4 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Active context</p>
                  <p className="text-xs text-muted-foreground">
                    Pinned targets are stamped on future messages until you clear them.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ConversationTargetPicker
                    companyId={resolvedCompanyId}
                    triggerLabel="Add context"
                    onSelect={(target) => {
                      setActiveContextTargets((current) =>
                        mergeContextTargets(current, [target]),
                      );
                    }}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setActiveContextTargets([])}
                    disabled={activeContextTargets.length === 0}
                  >
                    Clear all
                  </Button>
                </div>
              </div>

              {activeContextTargets.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Mention or pin an issue, goal, or project to keep it in scope across replies.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {activeContextTargets.map((target) => (
                    <span
                      key={targetKey(target)}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs"
                    >
                      <span className="font-medium uppercase tracking-wide text-muted-foreground">
                        {TARGET_KIND_LABELS[target.targetKind]}
                      </span>
                      <span className="text-foreground">{target.displayText}</span>
                      <button
                        type="button"
                        className="text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() =>
                          setActiveContextTargets((current) =>
                            current.filter((entry) => targetKey(entry) !== targetKey(target)),
                          )
                        }
                        aria-label={`Remove ${target.displayText}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <MarkdownEditor
            value={draftBody}
            onChange={setDraftBody}
            mentionMode="structured"
            loadMentions={loadMentions}
            placeholder="Reply with context, updates, or a structured mention..."
            onSubmit={sendMessage}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Type <code>@</code> to insert structured agent, issue, goal, or project mentions.
            </p>
            <Button
              onClick={sendMessage}
              disabled={createMessage.isPending || draftBody.trim().length === 0}
            >
              <Send className="mr-1.5 h-4 w-4" />
              Send
            </Button>
          </div>
          {createMessage.isError && (
            <p className="text-sm text-destructive">
              {createMessage.error instanceof Error
                ? createMessage.error.message
                : "Failed to send message"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active Target Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {targetLinkGroups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active target links yet.
            </p>
          ) : (
            targetLinkGroups.map((group) => {
              const selectedAgentIds =
                selectedUnlinkAgentIdsByTarget[group.key] ?? [];
              return (
                <div
                  key={group.key}
                  className="space-y-3 rounded-lg border border-border px-4 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-accent/20 px-3 py-1.5 text-xs">
                        <span className="font-medium uppercase tracking-wide text-muted-foreground">
                          {TARGET_KIND_LABELS[group.targetKind]}
                        </span>
                        <span className="text-foreground">
                          {group.displayText ??
                            fallbackTargetLabel(group.targetKind, group.targetId)}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Linked for{" "}
                        {group.links
                          .map(
                            (link) =>
                              participantNames.get(link.agentId) ??
                              link.agentId,
                          )
                          .join(", ")}
                      </p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <p>Latest message #{group.latestLinkedMessageSequence}</p>
                      <p>{formatTimestamp(group.latestLinkedAt)}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      Unlink for participants
                    </p>
                    <div className="space-y-2 rounded-lg border border-border px-3 py-3">
                      {group.links.map((link) => {
                        const checked = selectedAgentIds.includes(link.agentId);
                        return (
                          <label
                            key={`${group.key}:${link.agentId}`}
                            className="flex items-center gap-3 text-sm"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(next) => {
                                setSelectedUnlinkAgentIdsByTarget((current) => {
                                  const currentIds = current[group.key] ?? [];
                                  const nextIds = next
                                    ? [...currentIds, link.agentId]
                                    : currentIds.filter(
                                        (agentId) => agentId !== link.agentId,
                                      );
                                  return {
                                    ...current,
                                    [group.key]: nextIds,
                                  };
                                });
                              }}
                            />
                            <span>
                              {participantNames.get(link.agentId) ?? link.agentId}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Manual unlink is explicit and participant-scoped. The server records a suppression cutoff so
                      old stamped messages do not recreate the removed history.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        deleteTargetLinks.mutate({
                          targetKind: group.targetKind,
                          targetId: group.targetId,
                          agentIds: selectedAgentIds,
                        })
                      }
                      disabled={
                        deleteTargetLinks.isPending || selectedAgentIds.length === 0
                      }
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      {deleteTargetLinks.isPending &&
                      deleteTargetLinks.variables &&
                      targetRefKey(deleteTargetLinks.variables) === group.key
                        ? "Unlinking…"
                        : "Unlink Selected"}
                    </Button>
                  </div>
                </div>
              );
            })
          )}

          {deleteTargetLinks.isError && (
            <p className="text-sm text-destructive">
              {deleteTargetLinks.error instanceof Error
                ? deleteTargetLinks.error.message
                : "Failed to unlink target"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Link Target</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Manually link this conversation to an issue, goal, or project using the latest visible message as the anchor.
          </p>

          {resolvedCompanyId && (
            <div className="flex flex-wrap items-center gap-2">
              <ConversationTargetPicker
                companyId={resolvedCompanyId}
                triggerLabel={linkTarget ? "Change target" : "Select target"}
                onSelect={(target) => {
                  setLinkTarget(target);
                  setSelectedLinkAgentIds([]);
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setLinkTarget(null);
                  setSelectedLinkAgentIds([]);
                }}
                disabled={!linkTarget}
              >
                Clear target
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-border px-3 py-3">
            {linkTarget ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-accent/20 px-3 py-1.5 text-xs">
                <span className="font-medium uppercase tracking-wide text-muted-foreground">
                  {TARGET_KIND_LABELS[linkTarget.targetKind]}
                </span>
                <span className="text-foreground">{linkTarget.displayText}</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Choose a target before selecting participants.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Participants</p>
            <div className="rounded-lg border border-border px-3 py-3">
              {conversation.participants.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This conversation has no participants yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {conversation.participants.map((participant) => {
                    const checked = selectedLinkAgentIds.includes(participant.agentId);
                    return (
                      <label
                        key={participant.agentId}
                        className="flex items-center gap-3 text-sm"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(next) => {
                            setSelectedLinkAgentIds((current) =>
                              next
                                ? [...current, participant.agentId]
                                : current.filter((id) => id !== participant.agentId),
                            );
                          }}
                        />
                        <span>{participant.agentName ?? participant.agentId}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Participant selection is always explicit. Nothing is linked for unspecified participants.
            </p>
          </div>

          <div className="rounded-lg border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
            {!latestVisibleMessage ? (
              "Post at least one message before creating a manual target link."
            ) : (
              <>
                Latest anchor message: #{latestVisibleMessage.sequence} from{" "}
                {formatTimestamp(latestVisibleMessage.createdAt)}.
              </>
            )}
          </div>

          {createTargetLink.isError && (
            <p className="text-sm text-destructive">
              {createTargetLink.error instanceof Error
                ? createTargetLink.error.message
                : "Failed to create target link"}
            </p>
          )}

          <div className="flex justify-end">
            <Button
              onClick={() => createTargetLink.mutate()}
              disabled={
                createTargetLink.isPending ||
                !linkTarget ||
                !latestVisibleMessage ||
                selectedLinkAgentIds.length === 0
              }
            >
              <Link2 className="mr-1.5 h-4 w-4" />
              {createTargetLink.isPending ? "Linking…" : "Create Link"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {!messagePage || messagePage.messages.length === 0 ? (
          <EmptyState
            icon={MessageSquare}
            message="No messages yet."
          />
        ) : (
          messagePage.messages.map((message) => (
            <Card key={message.id}>
              <CardHeader className="space-y-1">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-sm">
                      {resolveAuthorName({
                        authorType: message.authorType,
                        authorUserId: message.authorUserId,
                        authorAgentId: message.authorAgentId,
                        participantNames,
                      })}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      #{message.sequence} · {formatTimestamp(message.createdAt)}
                    </p>
                  </div>
                  {message.refs.some(
                    (ref) =>
                      ref.refKind === "issue" ||
                      ref.refKind === "goal" ||
                      ref.refKind === "project",
                  ) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      Context stamped
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <MarkdownBody mentionMode="structured">
                  {message.bodyMarkdown}
                </MarkdownBody>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog
        open={participantDialogOpen}
        onOpenChange={(open) => {
          setParticipantDialogOpen(open);
          if (!open) {
            setSelectedParticipantAgentIds([]);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add Participants</DialogTitle>
            <DialogDescription>
              Add company agents to this conversation. Participation grants
              conversation visibility going forward, but does not backfill older
              manual links or reply requirements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Available agents</Label>
              <ScrollArea className="max-h-72 rounded-md border border-border">
                <div className="space-y-1 p-2">
                  {availableParticipantAgents.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                      All non-terminated agents in this company are already
                      participating.
                    </p>
                  ) : (
                    availableParticipantAgents.map((agent) => {
                      const checked = selectedParticipantAgentIds.includes(
                        agent.id,
                      );
                      return (
                        <label
                          key={agent.id}
                          className="flex items-start gap-3 rounded-md border border-transparent px-3 py-2 text-sm transition-colors hover:border-primary/20 hover:bg-accent/30"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => {
                              setSelectedParticipantAgentIds((current) =>
                                next
                                  ? [...current, agent.id]
                                  : current.filter((id) => id !== agent.id),
                              );
                            }}
                          />
                          <span className="min-w-0">
                            <span className="block font-medium text-foreground">
                              {agent.name}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {agent.title ?? agent.role ?? "Agent"}
                              {agent.status ? ` · ${agent.status}` : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            {addParticipants.isError && (
              <p className="text-sm text-destructive">
                {addParticipants.error instanceof Error
                  ? addParticipants.error.message
                  : "Failed to add participants"}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setParticipantDialogOpen(false);
                setSelectedParticipantAgentIds([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => addParticipants.mutate(selectedParticipantAgentIds)}
              disabled={
                addParticipants.isPending ||
                selectedParticipantAgentIds.length === 0
              }
            >
              {addParticipants.isPending ? "Adding…" : "Add Selected"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
