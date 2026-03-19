import type { LiveEventAudienceScope, LiveEventType } from "../constants.js";

export interface LiveEventAudience {
  scope: LiveEventAudienceScope;
  conversationId: string | null;
  participantAgentIds: string[] | null;
}

export interface ConversationSummaryLiveEventPayload {
  [key: string]: unknown;
  conversationId: string;
  title: string | null;
  status: string;
  participantAgentIds: string[];
  latestMessageSequence: number | null;
  latestActivityAt: string;
}

export interface ConversationParticipantLiveEventPayload {
  [key: string]: unknown;
  conversationId: string;
  agentId: string;
  participantAgentIds: string[];
  latestActivityAt: string;
}

export interface ConversationMessageLiveEventPayload {
  [key: string]: unknown;
  conversationId: string;
  message: {
    [key: string]: unknown;
    id: string;
    sequence: number;
    authorType: string;
    authorUserId: string | null;
    authorAgentId: string | null;
    runId: string | null;
    bodyMarkdown: string;
    createdAt: string;
    refs: Record<string, unknown>[];
  };
  latestMessageSequence: number;
  latestActivityAt: string;
}

export interface ConversationContextLinkLiveEventPayload {
  [key: string]: unknown;
  conversationId: string;
  targetKind: string;
  targetId: string;
  agentIds: string[];
  anchorMessageId?: string | null;
  latestLinkedMessageId?: string | null;
  latestLinkedMessageSequence?: number | null;
}

export interface LiveEventBase<
  TType extends LiveEventType = LiveEventType,
  TPayload = Record<string, unknown>
> {
  id: number;
  companyId: string;
  type: TType;
  createdAt: string;
  audience: LiveEventAudience;
  payload: TPayload;
}

export type ConversationCreatedLiveEvent = LiveEventBase<
  "conversation.created",
  ConversationSummaryLiveEventPayload
>;

export type ConversationUpdatedLiveEvent = LiveEventBase<
  "conversation.updated",
  ConversationSummaryLiveEventPayload
>;

export type ConversationParticipantAddedLiveEvent = LiveEventBase<
  "conversation.participant_added",
  ConversationParticipantLiveEventPayload
>;

export type ConversationParticipantRemovedLiveEvent = LiveEventBase<
  "conversation.participant_removed",
  ConversationParticipantLiveEventPayload
>;

export type ConversationMessagePostedLiveEvent = LiveEventBase<
  "conversation.message_posted",
  ConversationMessageLiveEventPayload
>;

export type ConversationMessageDeletedLiveEvent = LiveEventBase<
  "conversation.message_deleted",
  ConversationMessageLiveEventPayload
>;

export type ConversationContextLinkedLiveEvent = LiveEventBase<
  "conversation.context_linked",
  ConversationContextLinkLiveEventPayload
>;

export type ConversationContextUnlinkedLiveEvent = LiveEventBase<
  "conversation.context_unlinked",
  ConversationContextLinkLiveEventPayload
>;

export type ConversationLiveEvent =
  | ConversationCreatedLiveEvent
  | ConversationUpdatedLiveEvent
  | ConversationParticipantAddedLiveEvent
  | ConversationParticipantRemovedLiveEvent
  | ConversationMessagePostedLiveEvent
  | ConversationMessageDeletedLiveEvent
  | ConversationContextLinkedLiveEvent
  | ConversationContextUnlinkedLiveEvent;

export type LiveEvent = ConversationLiveEvent | LiveEventBase;
