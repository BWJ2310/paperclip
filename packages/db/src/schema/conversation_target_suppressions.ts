import { sql } from "drizzle-orm";
import { bigint, check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companies } from "./companies.js";
import { conversations } from "./conversations.js";

const UUID_TEXT_PATTERN = sql.raw(
  "'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'",
);
const CONVERSATION_SYSTEM_ACTOR_PATTERN = sql.raw(
  "'^conversation_[a-z0-9_]+$'",
);

export const conversationTargetSuppressions = pgTable(
  "conversation_target_suppressions",
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
    suppressedThroughMessageSequence: bigint("suppressed_through_message_sequence", { mode: "number" }).notNull(),
    suppressedByActorType: text("suppressed_by_actor_type").notNull(),
    suppressedByActorId: text("suppressed_by_actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTargetAgentIdx: index("conversation_target_suppressions_company_target_agent_idx").on(
      table.companyId,
      table.targetKind,
      table.targetId,
      table.agentId,
    ),
    agentConversationTargetUq: uniqueIndex("conversation_target_suppressions_agent_conversation_target_uq").on(
      table.agentId,
      table.conversationId,
      table.targetKind,
      table.targetId,
    ),
    targetKindCheck: check(
      "conversation_target_suppressions_target_kind_check",
      sql`${table.targetKind} in ('issue', 'goal', 'project')`,
    ),
    suppressedByActorTypeCheck: check(
      "conversation_target_suppressions_suppressed_by_actor_type_check",
      sql`${table.suppressedByActorType} in ('user', 'agent', 'system')`,
    ),
    suppressedByActorTruthTableCheck: check(
      "conversation_target_suppressions_suppressed_by_actor_truth_table_check",
      sql`(
        (${table.suppressedByActorType} = 'user'
          and length(trim(${table.suppressedByActorId})) > 0
          and ${table.suppressedByActorId} !~* ${UUID_TEXT_PATTERN}
          and ${table.suppressedByActorId} !~ ${CONVERSATION_SYSTEM_ACTOR_PATTERN})
        or (${table.suppressedByActorType} = 'agent'
          and ${table.suppressedByActorId} ~* ${UUID_TEXT_PATTERN})
        or (${table.suppressedByActorType} = 'system'
          and ${table.suppressedByActorId} ~ ${CONVERSATION_SYSTEM_ACTOR_PATTERN})
      )`,
    ),
    suppressedThroughMessageSequenceCheck: check(
      "conversation_target_suppressions_sequence_check",
      sql`${table.suppressedThroughMessageSequence} >= 0`,
    ),
  }),
);
