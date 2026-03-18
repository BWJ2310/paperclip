import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { conversations } from "./conversations.js";
import { conversationMessages } from "./conversation_messages.js";

const UUID_TEXT_PATTERN = sql.raw(
  "'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'",
);
const CONVERSATION_SYSTEM_ACTOR_PATTERN = sql.raw(
  "'^conversation_[a-z0-9_]+$'",
);

export const conversationTargetLinks = pgTable(
  "conversation_target_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    targetKind: text("target_kind").notNull(),
    targetId: uuid("target_id").notNull(),
    linkOrigin: text("link_origin").notNull(),
    latestLinkedMessageId: uuid("latest_linked_message_id")
      .notNull()
      .references(() => conversationMessages.id),
    latestLinkedMessageSequence: bigint("latest_linked_message_sequence", { mode: "number" }).notNull(),
    createdByActorType: text("created_by_actor_type").notNull(),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTargetAgentIdx: index("conversation_target_links_company_target_agent_idx").on(
      table.companyId,
      table.targetKind,
      table.targetId,
      table.agentId,
    ),
    companyConversationAgentIdx: index("conversation_target_links_company_conversation_agent_idx").on(
      table.companyId,
      table.conversationId,
      table.agentId,
    ),
    agentConversationTargetUq: uniqueIndex("conversation_target_links_agent_conversation_target_uq").on(
      table.agentId,
      table.conversationId,
      table.targetKind,
      table.targetId,
    ),
    targetKindCheck: check(
      "conversation_target_links_target_kind_check",
      sql`${table.targetKind} in ('issue', 'goal', 'project')`,
    ),
    linkOriginCheck: check(
      "conversation_target_links_link_origin_check",
      sql`${table.linkOrigin} in ('message_ref', 'manual', 'system')`,
    ),
    createdByActorTypeCheck: check(
      "conversation_target_links_created_by_actor_type_check",
      sql`${table.createdByActorType} in ('user', 'agent', 'system')`,
    ),
    createdByActorTruthTableCheck: check(
      "conversation_target_links_created_by_actor_truth_table_check",
      sql`(
        (${table.createdByActorType} = 'user'
          and length(trim(${table.createdByActorId})) > 0
          and ${table.createdByActorId} !~* ${UUID_TEXT_PATTERN}
          and ${table.createdByActorId} !~ ${CONVERSATION_SYSTEM_ACTOR_PATTERN})
        or (${table.createdByActorType} = 'agent'
          and ${table.createdByActorId} ~* ${UUID_TEXT_PATTERN})
        or (${table.createdByActorType} = 'system'
          and ${table.createdByActorId} ~ ${CONVERSATION_SYSTEM_ACTOR_PATTERN})
      )`,
    ),
    latestLinkedMessageSequenceCheck: check(
      "conversation_target_links_latest_linked_message_sequence_check",
      sql`${table.latestLinkedMessageSequence} > 0`,
    ),
  }),
);
