import { sql } from "drizzle-orm";
import { pgTable, text, integer, jsonb, timestamp, date, primaryKey, index } from "drizzle-orm/pg-core";

// Every table carries userId so cloud mode (Clerk) needs no migration. Local mode uses LOCAL_USER_ID.
const id = () => text("id").primaryKey().default(sql`gen_random_uuid()::text`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const settings = pgTable("settings", {
  userId: text("user_id").primaryKey(),
  apiKeyEnc: text("api_key_enc"),
  model: text("model").notNull().default("claude-opus-5-5"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const courses = pgTable(
  "courses",
  {
    id: id(),
    userId: text("user_id").notNull(),
    title: text("title").notNull(),
    request: text("request").notNull(), // what the learner typed
    intent: text("intent").notNull(), // one-line summary
    category: text("category").notNull(),
    variation: jsonb("variation").notNull(), // the chosen variation and tweaks
    status: text("status", { enum: ["draft", "generating", "partial", "ready", "failed"] }).notNull().default("draft"),
    plan: jsonb("plan"), // outline, frozen once ready
    budgetCapMicros: integer("budget_cap_micros"),
    spentMicros: integer("spent_micros").notNull().default(0),
    parentCourseId: text("parent_course_id"),
    forkedAtModule: integer("forked_at_module"),
    createdAt: createdAt(),
  },
  (t) => [index("courses_user_idx").on(t.userId)],
);

export const modules = pgTable(
  "modules",
  {
    id: id(),
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    title: text("title").notNull(),
    content: jsonb("content"), // lessons, quizzes, labs
    scheduledOn: date("scheduled_on"),
  },
  (t) => [index("modules_course_idx").on(t.courseId, t.position)],
);

export const progress = pgTable(
  "progress",
  {
    userId: text("user_id").notNull(),
    itemId: text("item_id").notNull(), // module/lesson/quiz/lab id inside the plan
    courseId: text("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    status: text("status", { enum: ["started", "done"] }).notNull(),
    score: integer("score"),
    attempts: integer("attempts").notNull().default(0),
    stars: integer("stars").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.itemId] })],
);

export const gameState = pgTable("game_state", {
  userId: text("user_id").primaryKey(),
  xp: integer("xp").notNull().default(0),
  streak: integer("streak").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  freezes: integer("freezes").notNull().default(1),
  lastStudyOn: date("last_study_on"),
});

export const aiCalls = pgTable(
  "ai_calls",
  {
    id: id(),
    userId: text("user_id").notNull(),
    courseId: text("course_id"),
    reason: text("reason").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    costMicros: integer("cost_micros").notNull(),
    consented: integer("consented").notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [index("ai_calls_user_idx").on(t.userId)],
);
