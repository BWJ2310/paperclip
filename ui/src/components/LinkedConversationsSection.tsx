import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { MessageSquare, Plus } from "lucide-react";
import type {
  ConversationParticipant,
  ConversationTargetKind,
  LinkedConversationSummary,
} from "@paperclipai/shared";
import { conversationsApi } from "../api/conversations";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "./EmptyState";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface LinkedConversationsSectionProps {
  companyId: string;
  targetKind: ConversationTargetKind;
  targetId: string;
  targetLabel: string;
  conversations: LinkedConversationSummary[] | undefined;
  isLoading: boolean;
  error: Error | null;
  onChanged: () => void;
}

function formatTimestamp(value: Date | string | null) {
  if (!value) return "Unknown";
  return new Date(value).toLocaleString();
}

function participantNames(participants: ConversationParticipant[]) {
  if (participants.length === 0) return "No participants";
  return participants
    .map((participant) => participant.agentName ?? participant.agentId)
    .join(", ");
}

export function LinkedConversationsSection({
  companyId,
  targetKind,
  targetId,
  targetLabel,
  conversations,
  isLoading,
  error,
  onChanged,
}: LinkedConversationsSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);

  const { data: availableConversations = [] } = useQuery({
    queryKey: queryKeys.conversations.list(companyId, "all"),
    queryFn: () =>
      conversationsApi.list(companyId, { status: "all", limit: 100 }),
    enabled: dialogOpen,
  });

  const { data: selectedConversation } = useQuery({
    queryKey: queryKeys.conversations.detail(selectedConversationId),
    queryFn: () => conversationsApi.get(selectedConversationId),
    enabled: dialogOpen && selectedConversationId.length > 0,
  });

  const { data: latestMessagePage } = useQuery({
    queryKey: queryKeys.conversations.messages(selectedConversationId, { limit: 1 }),
    queryFn: () =>
      conversationsApi.listMessages(selectedConversationId, { limit: 1 }),
    enabled: dialogOpen && selectedConversationId.length > 0,
  });

  const latestMessage = latestMessagePage?.messages[latestMessagePage.messages.length - 1] ?? null;

  useEffect(() => {
    if (selectedConversationId) return;
    setSelectedAgentIds([]);
  }, [selectedConversationId]);

  const selectableParticipants = selectedConversation?.participants ?? [];

  const createLink = useMutation({
    mutationFn: async () => {
      if (!selectedConversationId || !latestMessage) {
        throw new Error("Select a conversation with at least one message.");
      }
      if (selectedAgentIds.length === 0) {
        throw new Error("Select at least one participant.");
      }
      return conversationsApi.createTargetLinks(selectedConversationId, {
        targetKind,
        targetId,
        anchorMessageId: latestMessage.id,
        agentIds: selectedAgentIds,
      });
    },
    onSuccess: () => {
      setDialogOpen(false);
      setSelectedConversationId("");
      setSelectedAgentIds([]);
      onChanged();
    },
  });

  const sortedConversationChoices = useMemo(
    () =>
      [...availableConversations].sort((left, right) =>
        left.title.localeCompare(right.title),
      ),
    [availableConversations],
  );

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Linked Conversations</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Conversations already linked to this {targetKind}. Open one to
              manage participants or unlink this target for selected
              participants.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Link Conversation
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading linked conversations…</p>
          ) : error ? (
            <p className="text-sm text-destructive">{error.message}</p>
          ) : !conversations || conversations.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              message={`No conversations are linked to ${targetLabel} yet.`}
            />
          ) : (
            <div className="space-y-3">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className="rounded-lg border border-border px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to={`../conversations/${conversation.id}`}
                        className="text-sm font-semibold text-foreground hover:underline"
                      >
                        {conversation.title}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {participantNames(conversation.participants)}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      <p>Seq #{conversation.latestLinkedMessageSequence}</p>
                      <p>{formatTimestamp(conversation.latestLinkedAt)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" variant="ghost" asChild>
                      <Link to={`../conversations/${conversation.id}`}>
                        Manage in Conversation
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Link Conversation</DialogTitle>
            <DialogDescription>
              Link {targetLabel} to a visible conversation using that conversation’s latest message as the anchor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Conversation</Label>
              <ScrollArea className="max-h-52 rounded-md border border-border">
                <div className="space-y-1 p-2">
                  {sortedConversationChoices.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                      No visible conversations found.
                    </p>
                  ) : (
                    sortedConversationChoices.map((conversation) => (
                      <button
                        key={conversation.id}
                        type="button"
                        className={`flex w-full flex-col rounded-md border px-3 py-2 text-left transition-colors ${
                          selectedConversationId === conversation.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/30 hover:bg-accent/40"
                        }`}
                        onClick={() => {
                          setSelectedConversationId(conversation.id);
                          setSelectedAgentIds([]);
                        }}
                      >
                        <span className="text-sm font-medium text-foreground">
                          {conversation.title}
                        </span>
                        <span className="mt-1 text-xs text-muted-foreground">
                          {participantNames(conversation.participants)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            <div className="space-y-2">
              <Label>Participants</Label>
              <div className="rounded-md border border-border px-3 py-3">
                {selectableParticipants.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Choose a conversation to select participants.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectableParticipants.map((participant) => {
                      const checked = selectedAgentIds.includes(participant.agentId);
                      return (
                        <label
                          key={participant.agentId}
                          className="flex items-center gap-3 text-sm"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(next) => {
                              setSelectedAgentIds((current) =>
                                next
                                  ? [...current, participant.agentId]
                                  : current.filter((id) => id !== participant.agentId),
                              );
                            }}
                          />
                          <span>
                            {participant.agentName ?? participant.agentId}
                          </span>
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

            <div className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">
              {selectedConversationId.length === 0 ? (
                "Choose a conversation to resolve the latest anchor message."
              ) : latestMessage ? (
                <>
                  Latest anchor message: #{latestMessage.sequence} from{" "}
                  {formatTimestamp(latestMessage.createdAt)}.
                </>
              ) : (
                "Selected conversation has no messages yet, so it cannot be manually linked."
              )}
            </div>

            {createLink.isError && (
              <p className="text-sm text-destructive">
                {createLink.error instanceof Error
                  ? createLink.error.message
                  : "Failed to create conversation link"}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createLink.mutate()}
              disabled={
                createLink.isPending ||
                !selectedConversationId ||
                !latestMessage ||
                selectedAgentIds.length === 0
              }
            >
              {createLink.isPending ? "Linking…" : "Create Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
