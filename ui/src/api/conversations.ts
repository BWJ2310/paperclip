import type {
  AddConversationParticipant,
  ConversationDetail,
  ConversationMessage,
  ConversationMessagePage,
  ConversationReadState,
  ConversationSummary,
  CreateConversation,
  CreateConversationMessage,
  CreateConversationTargetLink,
  DeleteConversationMessageResult,
  DeleteConversationParticipantResult,
  DeleteConversationTargetLinkQuery,
  DeleteConversationTargetLinkResult,
  ListConversationMessagesQuery,
  MarkConversationRead,
  UpdateConversation,
} from "@paperclipai/shared";
import { api } from "./client";

function withParams(path: string, params?: Record<string, unknown> | null) {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        search.append(key, String(entry));
      }
      continue;
    }
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export const conversationsApi = {
  list: (companyId: string, params?: { status?: "active" | "archived" | "all"; limit?: number }) =>
    api.get<ConversationSummary[]>(
      withParams(`/companies/${companyId}/conversations`, params ?? null),
    ),
  get: (conversationId: string) =>
    api.get<ConversationDetail>(`/conversations/${conversationId}`),
  create: (companyId: string, data: CreateConversation) =>
    api.post<ConversationDetail>(`/companies/${companyId}/conversations`, data),
  update: (conversationId: string, data: UpdateConversation) =>
    api.patch<ConversationDetail>(`/conversations/${conversationId}`, data),
  addParticipant: (conversationId: string, data: AddConversationParticipant) =>
    api.post(`/conversations/${conversationId}/participants`, data),
  removeParticipant: (conversationId: string, agentId: string) =>
    api.delete<DeleteConversationParticipantResult>(
      `/conversations/${conversationId}/participants/${agentId}`,
    ),
  listMessages: (
    conversationId: string,
    params?: ListConversationMessagesQuery,
  ) =>
    api.get<ConversationMessagePage>(
      withParams(
        `/conversations/${conversationId}/messages`,
        (params ?? null) as Record<string, unknown> | null,
      ),
    ),
  createMessage: (conversationId: string, data: CreateConversationMessage) =>
    api.post<ConversationMessage>(`/conversations/${conversationId}/messages`, data),
  deleteMessage: (conversationId: string, messageId: string) =>
    api.delete<DeleteConversationMessageResult>(
      `/conversations/${conversationId}/messages/${messageId}`,
    ),
  markRead: (conversationId: string, data: MarkConversationRead) =>
    api.post<ConversationReadState>(`/conversations/${conversationId}/read`, data),
  createTargetLinks: (conversationId: string, data: CreateConversationTargetLink) =>
    api.post(`/conversations/${conversationId}/targets`, data),
  deleteTargetLinks: (
    conversationId: string,
    query: DeleteConversationTargetLinkQuery,
  ) =>
    api.delete<DeleteConversationTargetLinkResult>(
      withParams(
        `/conversations/${conversationId}/targets`,
        query as unknown as Record<string, unknown>,
      ),
    ),
};
