import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { bigint, check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { conversations } from "./conversations.js";
import { conversationMessages } from "./conversation_messages.js";

export const agentWakeupRequests = pgTable(
  "agent_wakeup_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id").notNull().references(() => agents.id),
    source: text("source").notNull(),
    triggerDetail: text("trigger_detail"),
    reason: text("reason"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
    status: text("status").notNull().default("queued"),
    coalescedCount: integer("coalesced_count").notNull().default(0),
    requestedByActorType: text("requested_by_actor_type"),
    requestedByActorId: text("requested_by_actor_id"),
    idempotencyKey: text("idempotency_key"),
    conversationId: uuid("conversation_id").references(() => conversations.id, { onDelete: "set null" }),
    conversationMessageId: uuid("conversation_message_id").references(
      (): AnyPgColumn => conversationMessages.id,
      { onDelete: "set null" },
    ),
    conversationMessageSequence: bigint("conversation_message_sequence", { mode: "number" }),
    responseMode: text("response_mode"),
    runId: uuid("run_id"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentStatusIdx: index("agent_wakeup_requests_company_agent_status_idx").on(
      table.companyId,
      table.agentId,
      table.status,
    ),
    companyRequestedIdx: index("agent_wakeup_requests_company_requested_idx").on(
      table.companyId,
      table.requestedAt,
    ),
    agentRequestedIdx: index("agent_wakeup_requests_agent_requested_idx").on(table.agentId, table.requestedAt),
    companyAgentConversationStatusIdx: index("agent_wakeup_requests_company_agent_conversation_status_idx").on(
      table.companyId,
      table.agentId,
      table.conversationId,
      table.status,
    ),
    responseModeCheck: check(
      "agent_wakeup_requests_response_mode_check",
      sql`${table.responseMode} is null or ${table.responseMode} in ('optional', 'required')`,
    ),
    conversationReplyFieldsCheck: check(
      "agent_wakeup_requests_conversation_reply_fields_check",
      sql`(
        ${table.conversationId} is null
        and ${table.conversationMessageId} is null
        and ${table.conversationMessageSequence} is null
        and ${table.responseMode} is null
      ) or (
        ${table.conversationId} is not null
        and ${table.conversationMessageId} is not null
        and ${table.conversationMessageSequence} is not null
        and ${table.responseMode} is not null
      )`,
    ),
  }),
);
