import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  DollarSign,
  MessageSquare,
  RefreshCcw,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import type { ConversationTargetKind, ConversationWakePolicy } from "@paperclipai/shared";
import { agentsApi } from "../api/agents";
import { conversationsApi } from "../api/conversations";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatCents, formatDateTime, formatTokens } from "../lib/utils";
import { AgentIcon } from "./AgentIconPicker";
import {
  InlineEntitySelector,
  type InlineEntityOption,
} from "./InlineEntitySelector";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";

function targetRefKey(input: {
  targetKind: ConversationTargetKind;
  targetId: string;
}) {
  return `${input.targetKind}:${input.targetId}`;
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

function humanizeLabel(value: string | null) {
  if (!value) return null;
  return value.replace(/_/g, " ");
}

function formatParticipantLabel(input: {
  agentTitle: string | null;
  agentName: string | null;
  agentId: string;
}) {
  return input.agentTitle ?? input.agentName ?? input.agentId;
}

function formatParticipantMeta(input: {
  agentModel: string | null;
  agentThinkingEffort: string | null;
}) {
  return [
    input.agentModel,
    humanizeLabel(input.agentThinkingEffort),
  ]
    .filter(Boolean)
    .join(" - ");
}

function formatParticipantSummary(input: {
  agentTitle: string | null;
  agentName: string | null;
  agentId: string;
  agentModel: string | null;
  agentThinkingEffort: string | null;
}) {
  return [
    formatParticipantLabel(input),
    formatParticipantMeta(input),
  ]
    .filter(Boolean)
    .join(" ");
}

function SidebarMetricRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

function cloneWakePolicy(policy: ConversationWakePolicy): ConversationWakePolicy {
  return {
    agentHumanStep: policy.agentHumanStep,
    hierarchyStep: policy.hierarchyStep,
    wakeChancePercents: [...policy.wakeChancePercents],
  };
}

function nextWakeChancePercent(levels: number[]) {
  const last = levels[levels.length - 1] ?? 100;
  return Math.max(0, last - 20);
}

interface ConversationParticipantsSidebarProps {
  conversationId: string;
}

export function ConversationParticipantsSidebar({
  conversationId,
}: ConversationParticipantsSidebarProps) {
  const queryClient = useQueryClient();
  const {
    data: conversation,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.conversations.detail(conversationId),
    queryFn: () => conversationsApi.get(conversationId),
    enabled: Boolean(conversationId),
  });
  const { data: companyAgents = [] } = useQuery({
    queryKey: queryKeys.agents.list(conversation?.companyId ?? ""),
    queryFn: () => agentsApi.list(conversation!.companyId),
    enabled: Boolean(conversation?.companyId),
  });
  const [wakePolicyDraft, setWakePolicyDraft] = useState<ConversationWakePolicy | null>(null);

  useEffect(() => {
    setWakePolicyDraft(conversation ? cloneWakePolicy(conversation.wakePolicy) : null);
  }, [conversation?.id]);

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

  const availableParticipantAgentById = useMemo(
    () => new Map(availableParticipantAgents.map((agent) => [agent.id, agent])),
    [availableParticipantAgents],
  );

  const participantSelectorOptions = useMemo<InlineEntityOption[]>(
    () =>
      availableParticipantAgents.map((agent) => ({
        id: agent.id,
        label: agent.name,
        searchText: [
          agent.title ?? "",
          agent.role ?? "",
          agent.status ?? "",
        ].join(" "),
      })),
    [availableParticipantAgents],
  );

  const addParticipant = useMutation({
    mutationFn: async (agentId: string) => {
      await conversationsApi.addParticipant(conversationId, { agentId });
      return agentId;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId),
        }),
        conversation?.companyId
          ? queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.list(conversation.companyId),
          })
          : Promise.resolve(),
      ]);
    },
  });

  const archiveConversation = useMutation({
    mutationFn: () =>
      conversationsApi.update(conversationId, {
        status: conversation?.status === "archived" ? "active" : "archived",
      }),
    onSuccess: async (updated) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(updated.id),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.list(updated.companyId),
        }),
      ]);
    },
  });

  const saveWakePolicy = useMutation({
    mutationFn: async (wakePolicy: ConversationWakePolicy) => {
      await conversationsApi.update(conversationId, { wakePolicy });
      return wakePolicy;
    },
    onSuccess: async (savedPolicy) => {
      setWakePolicyDraft(cloneWakePolicy(savedPolicy));
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.conversations.detail(conversationId),
        }),
        conversation?.companyId
          ? queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.list(conversation.companyId),
          })
          : Promise.resolve(),
      ]);
    },
  });

  const removeParticipant = useMutation({
    mutationFn: async (agentId: string) => {
      await conversationsApi.removeParticipant(conversationId, agentId);
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
          queryKey: queryKeys.conversations.detail(conversationId),
        }),
      ];

      if (conversation?.companyId) {
        invalidations.push(
          queryClient.invalidateQueries({
            queryKey: queryKeys.conversations.list(conversation.companyId),
          }),
        );
      }

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

  if (isLoading) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Properties</p>
        <p className="text-sm text-muted-foreground">Loading properties...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Properties</p>
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">Properties</p>
        <p className="text-sm text-muted-foreground">
          Conversation not found.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Wake policy</p>
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Broad wakeups:</span>{" "}
              level 1 wakes most often, and each higher level wakes less often.
            </p>
            <p>
              <span className="font-medium text-foreground">Agent wakes:</span>{" "}
              the agent-human step lowers agent-authored wakes, and each report-to hop adds the hierarchy step.
            </p>
            <p>
              <span className="font-medium text-foreground">Direct messages:</span>{" "}
              mentions and reply-to messages still only target the intended agent.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Agent-human step</span>
            <Input
              type="number"
              min={0}
              max={10}
              step={1}
              value={wakePolicyDraft?.agentHumanStep ?? conversation.wakePolicy.agentHumanStep}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                setWakePolicyDraft((current) => {
                  const base = current ?? cloneWakePolicy(conversation.wakePolicy);
                  return {
                    ...base,
                    agentHumanStep: Number.isFinite(next) ? Math.max(0, next) : 0,
                  };
                });
              }}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-muted-foreground">Hierarchy step</span>
            <Input
              type="number"
              min={0}
              max={10}
              step={1}
              value={wakePolicyDraft?.hierarchyStep ?? conversation.wakePolicy.hierarchyStep}
              onChange={(event) => {
                const next = Number.parseInt(event.target.value, 10);
                setWakePolicyDraft((current) => {
                  const base = current ?? cloneWakePolicy(conversation.wakePolicy);
                  return {
                    ...base,
                    hierarchyStep: Number.isFinite(next) ? Math.max(0, next) : 0,
                  };
                });
              }}
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Wake chances
            </p>
          </div>

          <div className="space-y-2">
            {(wakePolicyDraft?.wakeChancePercents ?? conversation.wakePolicy.wakeChancePercents).map((chance, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-xs text-muted-foreground">
                  {index + 1}
                </span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={chance}
                  onChange={(event) => {
                    const next = Number.parseInt(event.target.value, 10);
                    setWakePolicyDraft((current) => {
                      const base = current ?? cloneWakePolicy(conversation.wakePolicy);
                      return {
                        ...base,
                        wakeChancePercents: base.wakeChancePercents.map((value, currentIndex) =>
                          currentIndex === index
                            ? Math.max(0, Math.min(100, Number.isFinite(next) ? next : 0))
                            : value,
                        ),
                      };
                    });
                  }}
                />
                <span className="w-12 shrink-0 text-xs text-muted-foreground">%</span>
                {(wakePolicyDraft?.wakeChancePercents ?? conversation.wakePolicy.wakeChancePercents).length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    onClick={() =>
                      setWakePolicyDraft((current) => {
                        const base = current ?? cloneWakePolicy(conversation.wakePolicy);
                        return {
                          ...base,
                          wakeChancePercents: base.wakeChancePercents.filter(
                            (_, currentIndex) => currentIndex !== index,
                          ),
                        };
                      })
                    }
                    aria-label={`Remove level ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            Level 1 is the highest priority. You can add up to 10 levels.
          </p>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() =>
              setWakePolicyDraft((current) => {
                const base = current ?? cloneWakePolicy(conversation.wakePolicy);
                if (base.wakeChancePercents.length >= 10) return base;
                return {
                  ...base,
                  wakeChancePercents: [
                    ...base.wakeChancePercents,
                    nextWakeChancePercent(base.wakeChancePercents),
                  ],
                };
              },
              )
            }
            disabled={!wakePolicyDraft || wakePolicyDraft.wakeChancePercents.length >= 10}
          >
            Add level
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {
            if (!wakePolicyDraft) return;
            saveWakePolicy.mutate(cloneWakePolicy(wakePolicyDraft));
          }}
          disabled={
            !wakePolicyDraft ||
            JSON.stringify(wakePolicyDraft) === JSON.stringify(conversation.wakePolicy) ||
            saveWakePolicy.isPending
          }
        >
          {saveWakePolicy.isPending ? "Saving..." : "Save wake policy"}
        </Button>
      </div>

      <Separator />

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Participants</p>
          </div>
          <InlineEntitySelector
            value=""
            options={participantSelectorOptions}
            placeholder="Add participants"
            noneLabel="Cancel"
            searchPlaceholder="Search agents..."
            triggerAriaLabel={
              addParticipant.isPending ? "Adding participant" : "Add participants"
            }
            triggerTitle={
              addParticipant.isPending ? "Adding participant" : "Add participants"
            }
            emptyMessage={
              availableParticipantAgents.length === 0
                ? "All active agents are already in this conversation."
                : "No matching agents."
            }
            onChange={(agentId) => {
              if (!agentId) return;
              addParticipant.mutate(agentId);
            }}
            className={cn(
              "size-8 justify-center rounded-md border bg-background p-0 shadow-xs",
              (addParticipant.isPending || availableParticipantAgents.length === 0) &&
              "pointer-events-none opacity-60",
            )}
            renderTriggerValue={() => <UserPlus className="h-4 w-4" />}
            renderOption={(option) => {
              if (!option.id) {
                return <span className="truncate">{option.label}</span>;
              }
              const agent = availableParticipantAgentById.get(option.id);
              return (
                <>
                  <AgentIcon
                    icon={agent?.icon}
                    className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">{option.label}</span>
                </>
              );
            }}
          />
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Only listed agents can see this conversation and receive wakeups when
          new messages arrive. Board users keep their normal board access.
        </p>
      </div>

      {conversation.participants.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          No participants yet. Add an agent with the button above to bring them into
          the conversation.
        </div>
      ) : (
        <ScrollArea className="max-h-[50dvh] rounded-lg border border-border/60">
          <div className="space-y-1 p-1">
            {conversation.participants.map((participant) => (
              <div
                key={participant.agentId}
                className="rounded-lg px-2 py-2 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-start gap-2">
                  <AgentIcon
                    icon={participant.agentIcon}
                    className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                  />
                  <div
                    className="min-w-0 flex-1"
                    title={formatParticipantSummary(participant)}
                  >
                    <div className="truncate text-sm text-foreground">
                      {formatParticipantLabel(participant)}
                    </div>
                    {formatParticipantMeta(participant) ? (
                      <div className="truncate text-xs text-muted-foreground">
                        {formatParticipantMeta(participant)}
                      </div>
                    ) : null}
                  </div>
                  {conversation.participants.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => removeParticipant.mutate(participant.agentId)}
                      disabled={removeParticipant.isPending}
                      aria-label={`Remove ${participant.agentName ?? participant.agentId}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      <Separator />

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Spend</p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Conversation usage totals and recent billing activity.
        </p>
      </div>

      <div className="space-y-1">
        <SidebarMetricRow
          label="Total spend"
          value={formatCents(conversation.costSummary.spendCents)}
        />
        <SidebarMetricRow
          label="Runs"
          value={String(conversation.costSummary.runCount)}
        />
        <SidebarMetricRow
          label="Input tokens"
          value={formatTokens(conversation.costSummary.inputTokens)}
        />
        <SidebarMetricRow
          label="Output tokens"
          value={formatTokens(conversation.costSummary.outputTokens)}
        />
        <SidebarMetricRow
          label="Last usage"
          value={
            conversation.costSummary.lastOccurredAt
              ? formatDateTime(conversation.costSummary.lastOccurredAt)
              : "No usage yet"
          }
        />
      </div>

      <Separator />

      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Status</p>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          Conversation state and recent activity.
        </p>
      </div>

      <div className="space-y-1">
        <SidebarMetricRow
          label="Status"
          value={humanizeLabel(conversation.status) ?? conversation.status}
        />
        <SidebarMetricRow
          label="Messages"
          value={String(conversation.latestMessageSequence)}
        />
        <SidebarMetricRow
          label="Updated"
          value={formatDateTime(conversation.updatedAt)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2 justify-start gap-2"
          onClick={() => archiveConversation.mutate()}
          disabled={archiveConversation.isPending}
        >
          {conversation.status === "archived" ? (
            <RefreshCcw className="h-4 w-4" />
          ) : (
            <Archive className="h-4 w-4" />
          )}
          {conversation.status === "archived"
            ? "Reopen conversation"
            : "Archive conversation"}
        </Button>
      </div>

      {addParticipant.isError && (
        <p className="text-sm text-destructive">
          {addParticipant.error instanceof Error
            ? addParticipant.error.message
            : "Failed to add participant"}
        </p>
      )}

      {archiveConversation.isError && (
        <p className="text-sm text-destructive">
          {archiveConversation.error instanceof Error
            ? archiveConversation.error.message
            : "Failed to update conversation"}
        </p>
      )}

      {removeParticipant.isError && (
        <p className="text-sm text-destructive">
          {removeParticipant.error instanceof Error
            ? removeParticipant.error.message
            : "Failed to remove participant"}
        </p>
      )}
    </div>
  );
}
