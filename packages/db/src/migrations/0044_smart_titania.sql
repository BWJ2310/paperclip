ALTER TABLE "agent_wakeup_requests" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_wakeup_requests" ADD COLUMN "conversation_message_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_wakeup_requests" ADD COLUMN "conversation_message_sequence" bigint;--> statement-breakpoint
ALTER TABLE "agent_wakeup_requests" ADD COLUMN "response_mode" text;--> statement-breakpoint
ALTER TABLE "cost_events" ADD COLUMN "conversation_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_wakeup_requests" ADD CONSTRAINT "agent_wakeup_requests_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_wakeup_requests" ADD CONSTRAINT "agent_wakeup_requests_conversation_message_id_conversation_messages_id_fk" FOREIGN KEY ("conversation_message_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_events" ADD CONSTRAINT "cost_events_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_wakeup_requests_company_agent_conversation_status_idx" ON "agent_wakeup_requests" USING btree ("company_id","agent_id","conversation_id","status");--> statement-breakpoint
CREATE INDEX "cost_events_company_conversation_occurred_idx" ON "cost_events" USING btree ("company_id","conversation_id","occurred_at");--> statement-breakpoint
ALTER TABLE "agent_wakeup_requests" ADD CONSTRAINT "agent_wakeup_requests_response_mode_check" CHECK ("agent_wakeup_requests"."response_mode" is null or "agent_wakeup_requests"."response_mode" in ('optional', 'required'));--> statement-breakpoint
ALTER TABLE "agent_wakeup_requests" ADD CONSTRAINT "agent_wakeup_requests_conversation_reply_fields_check" CHECK ((
        "agent_wakeup_requests"."conversation_id" is null
        and "agent_wakeup_requests"."conversation_message_id" is null
        and "agent_wakeup_requests"."conversation_message_sequence" is null
        and "agent_wakeup_requests"."response_mode" is null
      ) or (
        "agent_wakeup_requests"."conversation_id" is not null
        and "agent_wakeup_requests"."conversation_message_id" is not null
        and "agent_wakeup_requests"."conversation_message_sequence" is not null
        and "agent_wakeup_requests"."response_mode" is not null
      ));
