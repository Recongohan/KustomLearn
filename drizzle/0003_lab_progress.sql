ALTER TABLE "progress" ADD COLUMN "hints_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "progress" ADD COLUMN "solution_seen" integer DEFAULT 0 NOT NULL;