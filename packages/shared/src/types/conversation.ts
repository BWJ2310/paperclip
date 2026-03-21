import type {
  ConversationActorType,
  ConversationAuthorType,
  ConversationLinkOrigin,
  ConversationMemoryBuildStatus,
  ConversationMessageRefKind,
  ConversationMessageRefOrigin,
  ConversationResponseMode,
  ConversationStatus,
  ConversationTargetKind,
} from "../constants.js";

export interface CreateConversation {
  title: string;
  participantAgentIds: string[];
}

export interface UpdateConversation {
  title?: string;
  status?: ConversationStatus;
  wakePolicy?: ConversationWakePolicy;
}

export interface AddConversationParticipant {
  agentId: string;
}

export interface RemoveConversationParticipantParams {
  conversationId: string;
  agentId: string;
}

export interface ConversationActiveContextTarget {
  targetKind: ConversationTargetKind;
  targetId: string;
  displayText: string;
}

export interface CreateConversationMessage {
  bodyMarkdown: string;
  activeContextTargets: ConversationActiveContextTarget[];
  parentId?: string | null;
}

export interface MarkConversationRead {
  lastReadSequence: number;
}

export interface DeleteConversationMessageParams {
  conversationId: string;
  messageId: string;
}

export interface DeleteConversationMessageResult {
  messageId: string;
}

export interface CreateConversationTargetLink {
  targetKind: ConversationTargetKind;
  targetId: string;
  anchorMessageId: string;
  agentIds: string[];
}

export interface DeleteConversationTargetLinkQuery {
  targetKind: ConversationTargetKind;
  targetId: string;
  agentIds: string[];
}

export interface DeleteConversationParticipantResult {
  removedParticipantId: string;
}

export interface DeleteConversationTargetLinkResult {
  removedCount: number;
}

export interface ConversationParticipant {
  id: string;
  companyId: string;
  conversationId: string;
  agentId: string;
  agentIcon: string | null;
  agentName: string | null;
  agentRole: string | null;
  agentTitle: string | null;
  agentStatus: string | null;
  agentModel: string | null;
  agentThinkingEffort: string | null;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationReadState {
  id: string;
  companyId: string;
  conversationId: string;
  userId: string | null;
  agentId: string | null;
  lastReadSequence: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationWakePolicy {
  agentHumanStep: number;
  hierarchyStep: number;
  wakeChancePercents: number[];
}

export interface ConversationMessageRef {
  id: string;
  companyId: string;
  messageId: string;
  refKind: ConversationMessageRefKind;
  targetId: string;
  displayText: string;
  refOrigin: ConversationMessageRefOrigin;
  createdAt: Date;
}

export interface ConversationMessageParentSummary {
  id: string;
  sequence: number;
  authorType: ConversationAuthorType;
  authorUserId: string | null;
  authorAgentId: string | null;
  bodyMarkdown: string;
  deletedAt: Date | null;
  createdAt: Date;
}

export interface ConversationMessage {
  id: string;
  companyId: string;
  conversationId: string;
  sequence: number;
  parentId: string | null;
  parentMessage: ConversationMessageParentSummary | null;
  authorType: ConversationAuthorType;
  authorUserId: string | null;
  authorAgentId: string | null;
  runId: string | null;
  bodyMarkdown: string;
  refs: ConversationMessageRef[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationTargetLink {
  id: string;
  companyId: string;
  agentId: string;
  conversationId: string;
  targetKind: ConversationTargetKind;
  targetId: string;
  displayText: string | null;
  linkOrigin: ConversationLinkOrigin;
  latestLinkedMessageId: string;
  latestLinkedMessageSequence: number;
  createdByActorType: ConversationActorType;
  createdByActorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationTargetSuppression {
  id: string;
  companyId: string;
  agentId: string;
  conversationId: string;
  targetKind: ConversationTargetKind;
  targetId: string;
  suppressedThroughMessageSequence: number;
  suppressedByActorType: ConversationActorType;
  suppressedByActorId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentTargetConversationMemory {
  id: string;
  companyId: string;
  agentId: string;
  targetKind: ConversationTargetKind;
  targetId: string;
  memoryMarkdown: string;
  buildStatus: ConversationMemoryBuildStatus;
  linkedConversationCount: number;
  linkedMessageCount: number;
  sourceMessageCount: number;
  lastSourceMessageSequence: number;
  latestSourceMessageAt: Date | null;
  lastBuildError: string | null;
  lastRebuiltAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkedConversationSummary {
  id: string;
  title: string;
  participants: ConversationParticipant[];
  latestLinkedMessageId: string;
  latestLinkedMessageSequence: number;
  latestLinkedAt: Date | null;
}

export interface ConversationCostSummary {
  spendCents: number;
  inputTokens: number;
  outputTokens: number;
  runCount: number;
  lastOccurredAt: Date | null;
}

export interface ConversationSummary {
  id: string;
  companyId: string;
  title: string;
  status: ConversationStatus;
  participants: ConversationParticipant[];
  wakePolicy: ConversationWakePolicy;
  latestMessageSequence: number;
  latestMessageAt: Date | null;
  unreadCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationDetail extends ConversationSummary {
  costSummary: ConversationCostSummary;
  viewerReadState: ConversationReadState | null;
  targetLinks: ConversationTargetLink[];
}

export interface ConversationMessagePage {
  conversationId: string;
  messages: ConversationMessage[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
}

export interface ListConversationsQuery {
  status?: ConversationStatus | "all";
  limit?: number;
}

export interface ListConversationMessagesQuery {
  beforeSequence?: number;
  limit?: number;
  q?: string;
  targetKind?: ConversationTargetKind;
  targetId?: string;
  aroundMessageId?: string;
  before?: number;
  after?: number;
}

export interface ConversationReplyContext {
  conversationId: string;
  conversationMessageId: string;
  conversationMessageSequence: number;
  responseMode: ConversationResponseMode;
  targetKind?: ConversationTargetKind | null;
  targetId?: string | null;
}
