CREATE TABLE "ai_calls" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"course_id" text,
	"reason" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cost_micros" integer NOT NULL,
	"consented" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"request" text NOT NULL,
	"intent" text NOT NULL,
	"category" text NOT NULL,
	"variation" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"plan" jsonb,
	"budget_cap_micros" integer,
	"spent_micros" integer DEFAULT 0 NOT NULL,
	"parent_course_id" text,
	"forked_at_module" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"best_streak" integer DEFAULT 0 NOT NULL,
	"freezes" integer DEFAULT 1 NOT NULL,
	"last_study_on" date
);
--> statement-breakpoint
CREATE TABLE "modules" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"course_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"content" jsonb,
	"scheduled_on" date
);
--> statement-breakpoint
CREATE TABLE "progress" (
	"user_id" text NOT NULL,
	"item_id" text NOT NULL,
	"course_id" text NOT NULL,
	"status" text NOT NULL,
	"score" integer,
	"attempts" integer DEFAULT 0 NOT NULL,
	"stars" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"api_key_enc" text,
	"model" text DEFAULT 'claude-opus-5-5' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modules" ADD CONSTRAINT "modules_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_calls_user_idx" ON "ai_calls" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "courses_user_idx" ON "courses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "modules_course_idx" ON "modules" USING btree ("course_id","position");