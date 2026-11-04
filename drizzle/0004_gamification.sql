CREATE TABLE "study_days" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"minutes" integer DEFAULT 0 NOT NULL,
	"last_beat_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "study_days_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "xp_events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"reason" text NOT NULL,
	"amount" integer NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "xp_events_user_key_idx" ON "xp_events" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "xp_events_user_day_idx" ON "xp_events" USING btree ("user_id","day");