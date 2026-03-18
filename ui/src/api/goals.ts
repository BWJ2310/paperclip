import {
  companyGoalsPath,
  type Goal,
  type LinkedConversationSummary,
  type ListGoalsQuery,
} from "@paperclipai/shared";
import { api } from "./client";

export const goalsApi = {
  list: (companyId: string, query?: ListGoalsQuery) => {
    const params = new URLSearchParams();
    const trimmedQuery = query?.q?.trim();
    if (trimmedQuery) params.set("q", trimmedQuery);
    if (query?.limit !== undefined) params.set("limit", String(query.limit));
    const qs = params.toString();
    return api.get<Goal[]>(`${companyGoalsPath(companyId)}${qs ? `?${qs}` : ""}`);
  },
  get: (id: string) => api.get<Goal>(`/goals/${id}`),
  listLinkedConversations: (id: string) =>
    api.get<LinkedConversationSummary[]>(`/goals/${id}/linked-conversations`),
  create: (companyId: string, data: Record<string, unknown>) =>
    api.post<Goal>(`/companies/${companyId}/goals`, data),
  update: (id: string, data: Record<string, unknown>) => api.patch<Goal>(`/goals/${id}`, data),
  remove: (id: string) => api.delete<Goal>(`/goals/${id}`),
};
