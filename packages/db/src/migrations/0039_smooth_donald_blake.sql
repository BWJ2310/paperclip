ALTER TABLE "conversation_messages" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_parent_id_conversation_messages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."conversation_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_messages_parent_idx" ON "conversation_messages" USING btree ("parent_id");