CREATE TABLE IF NOT EXISTS "agent_target_conversation_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"memory_markdown" text NOT NULL,
	"build_status" text DEFAULT 'ready' NOT NULL,
	"linked_conversation_count" integer DEFAULT 0 NOT NULL,
	"linked_message_count" integer DEFAULT 0 NOT NULL,
	"source_message_count" integer DEFAULT 0 NOT NULL,
	"last_source_message_sequence" bigint DEFAULT 0 NOT NULL,
	"latest_source_message_at" timestamp with time zone,
	"last_build_error" text,
	"last_rebuilt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_target_conversation_memory_target_kind_check" CHECK ("agent_target_conversation_memory"."target_kind" in ('issue', 'goal', 'project')),
	CONSTRAINT "agent_target_conversation_memory_build_status_check" CHECK ("agent_target_conversation_memory"."build_status" in ('ready', 'rebuilding', 'failed')),
	CONSTRAINT "agent_target_conversation_memory_linked_conversation_count_check" CHECK ("agent_target_conversation_memory"."linked_conversation_count" >= 0),
	CONSTRAINT "agent_target_conversation_memory_linked_message_count_check" CHECK ("agent_target_conversation_memory"."linked_message_count" >= 0),
	CONSTRAINT "agent_target_conversation_memory_source_message_count_check" CHECK ("agent_target_conversation_memory"."source_message_count" >= 0),
	CONSTRAINT "agent_target_conversation_memory_last_source_message_sequence_check" CHECK ("agent_target_conversation_memory"."last_source_message_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_message_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"ref_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"display_text" text NOT NULL,
	"ref_origin" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_message_refs_ref_kind_check" CHECK ("conversation_message_refs"."ref_kind" in ('agent', 'issue', 'goal', 'project')),
	CONSTRAINT "conversation_message_refs_ref_origin_check" CHECK ("conversation_message_refs"."ref_origin" in ('inline_mention', 'active_context'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sequence" bigint NOT NULL,
	"parent_id" uuid,
	"author_type" text NOT NULL,
	"author_user_id" text,
	"author_agent_id" uuid,
	"run_id" uuid,
	"body_markdown" text NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_messages_author_type_check" CHECK ("conversation_messages"."author_type" in ('user', 'agent', 'system')),
	CONSTRAINT "conversation_messages_author_truth_table_check" CHECK ((
        ("conversation_messages"."author_type" = 'user' and "conversation_messages"."author_user_id" is not null and "conversation_messages"."author_agent_id" is null)
        or ("conversation_messages"."author_type" = 'agent' and "conversation_messages"."author_user_id" is null and "conversation_messages"."author_agent_id" is not null)
        or ("conversation_messages"."author_type" = 'system' and "conversation_messages"."author_user_id" is null and "conversation_messages"."author_agent_id" is null)
      )),
	CONSTRAINT "conversation_messages_run_author_check" CHECK ("conversation_messages"."run_id" is null or ("conversation_messages"."author_type" = 'agent' and "conversation_messages"."author_agent_id" is not null and "conversation_messages"."author_user_id" is null)),
	CONSTRAINT "conversation_messages_sequence_check" CHECK ("conversation_messages"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_participants_joined_at_check" CHECK ("conversation_participants"."joined_at" is not null)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_read_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"user_id" text,
	"agent_id" uuid,
	"last_read_sequence" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_read_states_actor_check" CHECK ((
        ("conversation_read_states"."user_id" is not null and "conversation_read_states"."agent_id" is null)
        or ("conversation_read_states"."user_id" is null and "conversation_read_states"."agent_id" is not null)
      )),
	CONSTRAINT "conversation_read_states_last_read_sequence_check" CHECK ("conversation_read_states"."last_read_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_target_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"link_origin" text NOT NULL,
	"latest_linked_message_id" uuid NOT NULL,
	"latest_linked_message_sequence" bigint NOT NULL,
	"created_by_actor_type" text NOT NULL,
	"created_by_actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_target_links_target_kind_check" CHECK ("conversation_target_links"."target_kind" in ('issue', 'goal', 'project')),
	CONSTRAINT "conversation_target_links_link_origin_check" CHECK ("conversation_target_links"."link_origin" in ('message_ref', 'manual', 'system')),
	CONSTRAINT "conversation_target_links_created_by_actor_type_check" CHECK ("conversation_target_links"."created_by_actor_type" in ('user', 'agent', 'system')),
	CONSTRAINT "conversation_target_links_created_by_actor_truth_table_check" CHECK ((
        ("conversation_target_links"."created_by_actor_type" = 'user'
          and length(trim("conversation_target_links"."created_by_actor_id")) > 0
          and "conversation_target_links"."created_by_actor_id" !~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          and "conversation_target_links"."created_by_actor_id" !~ '^conversation_[a-z0-9_]+$')
        or ("conversation_target_links"."created_by_actor_type" = 'agent'
          and "conversation_target_links"."created_by_actor_id" ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
        or ("conversation_target_links"."created_by_actor_type" = 'system'
          and "conversation_target_links"."created_by_actor_id" ~ '^conversation_[a-z0-9_]+$')
      )),
	CONSTRAINT "conversation_target_links_latest_linked_message_sequence_check" CHECK ("conversation_target_links"."latest_linked_message_sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversation_target_suppressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" uuid NOT NULL,
	"suppressed_through_message_sequence" bigint NOT NULL,
	"suppressed_by_actor_type" text NOT NULL,
	"suppressed_by_actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_target_suppressions_target_kind_check" CHECK ("conversation_target_suppressions"."target_kind" in ('issue', 'goal', 'project')),
	CONSTRAINT "conversation_target_suppressions_suppressed_by_actor_type_check" CHECK ("conversation_target_suppressions"."suppressed_by_actor_type" in ('user', 'agent', 'system')),
	CONSTRAINT "conversation_target_suppressions_suppressed_by_actor_truth_table_check" CHECK ((
        ("conversation_target_suppressions"."suppressed_by_actor_type" = 'user'
          and length(trim("conversation_target_suppressions"."suppressed_by_actor_id")) > 0
          and "conversation_target_suppressions"."suppressed_by_actor_id" !~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
          and "conversation_target_suppressions"."suppressed_by_actor_id" !~ '^conversation_[a-z0-9_]+$')
        or ("conversation_target_suppressions"."suppressed_by_actor_type" = 'agent'
          and "conversation_target_suppressions"."suppressed_by_actor_id" ~* '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
        or ("conversation_target_suppressions"."suppressed_by_actor_type" = 'system'
          and "conversation_target_suppressions"."suppressed_by_actor_id" ~ '^conversation_[a-z0-9_]+$')
      )),
	CONSTRAINT "conversation_target_suppressions_sequence_check" CHECK ("conversation_target_suppressions"."suppressed_through_message_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_message_sequence" bigint DEFAULT 0 NOT NULL,
	"created_by_user_id" text,
	"created_by_agent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_status_check" CHECK ("conversations"."status" in ('active', 'archived')),
	CONSTRAINT "conversations_last_message_sequence_check" CHECK ("conversations"."last_message_sequence" >= 0)
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "image" text;--> statement-breakpoint
ALTER TABLE "agent_target_conversation_memory" ADD CONSTRAINT "agent_target_conversation_memory_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_target_conversation_memory" ADD CONSTRAINT "agent_target_conversation_memory_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_refs" ADD CONSTRAINT "conversation_message_refs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_message_refs" ADD CONSTRAINT "conversation_message_refs_message_id_conversation_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_parent_id_conversation_messages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_author_agent_id_agents_id_fk" FOREIGN KEY ("author_agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_participants" ADD CONSTRAINT "conversation_participants_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_read_states" ADD CONSTRAINT "conversation_read_states_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_target_links" ADD CONSTRAINT "conversation_target_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_target_links" ADD CONSTRAINT "conversation_target_links_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_target_links" ADD CONSTRAINT "conversation_target_links_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_target_links" ADD CONSTRAINT "conversation_target_links_latest_linked_message_id_conversation_messages_id_fk" FOREIGN KEY ("latest_linked_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_target_suppressions" ADD CONSTRAINT "conversation_target_suppressions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_target_suppressions" ADD CONSTRAINT "conversation_target_suppressions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_target_suppressions" ADD CONSTRAINT "conversation_target_suppressions_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_created_by_agent_id_agents_id_fk" FOREIGN KEY ("created_by_agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_target_conversation_memory_company_target_agent_idx" ON "agent_target_conversation_memory" USING btree ("company_id","target_kind","target_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_target_conversation_memory_agent_target_uq" ON "agent_target_conversation_memory" USING btree ("agent_id","target_kind","target_id");--> statement-breakpoint
CREATE INDEX "conversation_message_refs_company_ref_target_idx" ON "conversation_message_refs" USING btree ("company_id","ref_kind","target_id");--> statement-breakpoint
CREATE INDEX "conversation_message_refs_message_idx" ON "conversation_message_refs" USING btree ("message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_message_refs_message_ref_target_uq" ON "conversation_message_refs" USING btree ("message_id","ref_kind","target_id");--> statement-breakpoint
CREATE INDEX "conversation_messages_company_conversation_sequence_idx" ON "conversation_messages" USING btree ("company_id","conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "conversation_messages_parent_idx" ON "conversation_messages" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_messages_conversation_sequence_uq" ON "conversation_messages" USING btree ("conversation_id","sequence");--> statement-breakpoint
CREATE INDEX "conversation_participants_company_conversation_idx" ON "conversation_participants" USING btree ("company_id","conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_participants_company_agent_idx" ON "conversation_participants" USING btree ("company_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_participants_company_conversation_agent_uq" ON "conversation_participants" USING btree ("company_id","conversation_id","agent_id");--> statement-breakpoint
CREATE INDEX "conversation_read_states_company_conversation_idx" ON "conversation_read_states" USING btree ("company_id","conversation_id");--> statement-breakpoint
CREATE INDEX "conversation_read_states_company_user_idx" ON "conversation_read_states" USING btree ("company_id","user_id") WHERE "conversation_read_states"."user_id" is not null;--> statement-breakpoint
CREATE INDEX "conversation_read_states_company_agent_idx" ON "conversation_read_states" USING btree ("company_id","agent_id") WHERE "conversation_read_states"."agent_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_read_states_company_conversation_user_uq" ON "conversation_read_states" USING btree ("company_id","conversation_id","user_id") WHERE "conversation_read_states"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_read_states_company_conversation_agent_uq" ON "conversation_read_states" USING btree ("company_id","conversation_id","agent_id") WHERE "conversation_read_states"."agent_id" is not null;--> statement-breakpoint
CREATE INDEX "conversation_target_links_company_target_agent_idx" ON "conversation_target_links" USING btree ("company_id","target_kind","target_id","agent_id");--> statement-breakpoint
CREATE INDEX "conversation_target_links_company_conversation_agent_idx" ON "conversation_target_links" USING btree ("company_id","conversation_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_target_links_agent_conversation_target_uq" ON "conversation_target_links" USING btree ("agent_id","conversation_id","target_kind","target_id");--> statement-breakpoint
CREATE INDEX "conversation_target_suppressions_company_target_agent_idx" ON "conversation_target_suppressions" USING btree ("company_id","target_kind","target_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_target_suppressions_agent_conversation_target_uq" ON "conversation_target_suppressions" USING btree ("agent_id","conversation_id","target_kind","target_id");--> statement-breakpoint
CREATE INDEX "conversations_company_status_updated_at_idx" ON "conversations" USING btree ("company_id","status","updated_at");--> statement-breakpoint
CREATE INDEX "conversations_company_updated_at_idx" ON "conversations" USING btree ("company_id","updated_at");