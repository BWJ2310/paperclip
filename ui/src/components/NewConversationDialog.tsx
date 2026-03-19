import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { MessageSquare, UserPlus, X } from "lucide-react";
import type { Agent } from "@paperclipai/shared";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { conversationsApi } from "../api/conversations";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { AgentIcon } from "./AgentIconPicker";
import { InlineEntitySelector, type InlineEntityOption } from "./InlineEntitySelector";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function NewConversationDialog() {
  const { newConversationOpen, closeNewConversation } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [participantAgentIds, setParticipantAgentIds] = useState<string[]>([]);

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && newConversationOpen,
  });

  const selectableAgents = useMemo(
    () => agents.filter((agent) => agent.status !== "terminated"),
    [agents],
  );

  const selectedAgentMap = useMemo(
    () => new Map(selectableAgents.map((agent) => [agent.id, agent])),
    [selectableAgents],
  );

  const selectedParticipants = useMemo(
    () =>
      participantAgentIds
        .map((agentId) => selectedAgentMap.get(agentId))
        .filter((agent): agent is Agent => Boolean(agent)),
    [participantAgentIds, selectedAgentMap],
  );

  const availableParticipantAgents = useMemo(
    () => selectableAgents.filter((agent) => !participantAgentIds.includes(agent.id)),
    [participantAgentIds, selectableAgents],
  );

  const availableParticipantAgentById = useMemo(
    () => new Map(availableParticipantAgents.map((agent) => [agent.id, agent])),
    [availableParticipantAgents],
  );

  const participantOptions = useMemo<InlineEntityOption[]>(
    () =>
      availableParticipantAgents.map((agent) => ({
        id: agent.id,
        label: agent.name,
        searchText: [agent.title ?? "", agent.role ?? "", agent.status ?? ""].join(" "),
      })),
    [availableParticipantAgents],
  );

  const createConversation = useMutation({
    mutationFn: async () => {
      if (!selectedCompanyId) {
        throw new Error("Select a company before creating a conversation.");
      }
      return conversationsApi.create(selectedCompanyId, {
        title: title.trim(),
        participantAgentIds,
      });
    },
    onSuccess: async (created) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversations.list(created.companyId),
      });
      reset();
      closeNewConversation();
      navigate(`/conversations/${created.id}`);
    },
  });

  function reset() {
    setTitle("");
    setParticipantAgentIds([]);
    createConversation.reset();
  }

  function handleClose() {
    reset();
    closeNewConversation();
  }

  function handleSubmit() {
    if (title.trim().length === 0 || createConversation.isPending) return;
    createConversation.mutate();
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSubmit();
    }
  }

  return (
    <Dialog
      open={newConversationOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg p-0 gap-0"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>New conversation</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {selectedCompany && (
              <span className="bg-muted px-1.5 py-0.5 rounded text-xs font-medium">
                {selectedCompany.name.slice(0, 3).toUpperCase()}
              </span>
            )}
            <span className="text-muted-foreground/60">&rsaquo;</span>
            <span>New conversation</span>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground"
            onClick={handleClose}
          >
            <span className="text-lg leading-none">&times;</span>
          </Button>
        </div>

        <div className="px-4 pt-4 pb-2">
          <input
            className="w-full text-lg font-semibold bg-transparent outline-none placeholder:text-muted-foreground/50"
            placeholder="Conversation title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus
          />
        </div>

        <div className="px-4 pb-4 space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">Participants</p>
            <p className="text-xs text-muted-foreground">
              Add the agents who should be able to see and respond in this conversation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedParticipants.map((agent) => (
              <span
                key={agent.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs"
              >
                <AgentIcon icon={agent.icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{agent.name}</span>
                <button
                  type="button"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() =>
                    setParticipantAgentIds((current) =>
                      current.filter((agentId) => agentId !== agent.id),
                    )
                  }
                  aria-label={`Remove ${agent.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}

            <InlineEntitySelector
              value=""
              options={participantOptions}
              placeholder="Add participant"
              noneLabel="Cancel"
              searchPlaceholder="Search agents..."
              emptyMessage={
                availableParticipantAgents.length === 0
                  ? "All active agents are already added."
                  : "No matching agents."
              }
              onChange={(agentId) => {
                if (!agentId) return;
                setParticipantAgentIds((current) =>
                  current.includes(agentId) ? current : [...current, agentId],
                );
              }}
              disablePortal
              className="h-9 rounded-full border bg-background px-3 py-2 shadow-xs"
              renderTriggerValue={() => (
                <>
                  <UserPlus className="h-4 w-4" />
                  <span>Add participant</span>
                </>
              )}
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
          {createConversation.isError && (
            <p className="text-sm text-destructive">
              {createConversation.error instanceof Error
                ? createConversation.error.message
                : "Failed to create conversation"}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={createConversation.isPending || title.trim().length === 0}
          >
            <MessageSquare className="mr-1.5 h-4 w-4" />
            {createConversation.isPending ? "Creating..." : "Create conversation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
