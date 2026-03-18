import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus } from "lucide-react";
import { Link, useNavigate } from "@/lib/router";
import { conversationsApi } from "../api/conversations";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { StatusBadge } from "../components/StatusBadge";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

function formatParticipants(names: string[]) {
  if (names.length === 0) return "No participants yet";
  return names.join(", ");
}

function formatLatestActivity(value: Date | string) {
  return new Date(value).toLocaleString();
}

export function Conversations() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [draftTitle, setDraftTitle] = useState("");
  const [participantAgentIds, setParticipantAgentIds] = useState<string[]>([]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Conversations" }]);
  }, [setBreadcrumbs]);

  const { data: conversations, isLoading, error } = useQuery({
    queryKey: queryKeys.conversations.list(selectedCompanyId!),
    queryFn: () => conversationsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const selectableAgents = useMemo(
    () => agents.filter((agent) => agent.status !== "terminated"),
    [agents],
  );

  const createConversation = useMutation({
    mutationFn: () =>
      conversationsApi.create(selectedCompanyId!, {
        title: draftTitle.trim(),
        participantAgentIds,
      }),
    onSuccess: (created) => {
      setDraftTitle("");
      setParticipantAgentIds([]);
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.list(selectedCompanyId!),
      });
      navigate(created.id);
    },
  });

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={MessageSquare}
        message="Select a company to view conversations."
      />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-lg">New Conversation</CardTitle>
            <p className="text-sm text-muted-foreground">
              Start a company conversation and choose the participating agents.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => createConversation.mutate()}
            disabled={createConversation.isPending || draftTitle.trim().length === 0}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Create
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={draftTitle}
              onChange={(event) => setDraftTitle(event.target.value)}
              placeholder="Weekly design review"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Participants</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {selectableAgents.map((agent) => {
                const checked = participantAgentIds.includes(agent.id);
                return (
                  <label
                    key={agent.id}
                    className="flex items-start gap-3 rounded-lg border border-border px-3 py-2 text-sm"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        setParticipantAgentIds((current) =>
                          next
                            ? [...current, agent.id]
                            : current.filter((value) => value !== agent.id),
                        );
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">
                        {agent.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {agent.title ?? agent.role}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
          {createConversation.isError && (
            <p className="text-sm text-destructive">
              {createConversation.error instanceof Error
                ? createConversation.error.message
                : "Failed to create conversation"}
            </p>
          )}
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error.message}</p>}

      {!conversations || conversations.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          message="No conversations yet."
        />
      ) : (
        <div className="grid gap-3">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              to={conversation.id}
              className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent/20"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-foreground">
                      {conversation.title}
                    </h3>
                    <StatusBadge status={conversation.status} />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatParticipants(
                      conversation.participants
                        .map((participant) => participant.agentName ?? "Unknown agent"),
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2 text-right">
                  <div className="text-xs text-muted-foreground">
                    <div className="font-medium text-foreground/80">
                      {formatLatestActivity(conversation.updatedAt)}
                    </div>
                    <div>Latest activity</div>
                  </div>
                  {conversation.unreadCount > 0 && (
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {conversation.unreadCount} unread
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
