ALTER TABLE "courses" ADD COLUMN "budget_cap_tokens" integer;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "spent_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "status_note" text;