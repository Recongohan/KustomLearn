import { inngest } from "./client";
import { finalize, markFailed, runModule, runOutline } from "@/lib/generation";

/** Builds a whole course once: outline, then each module, then finalize. Each step retries on its own. */
export const generateCourse = inngest.createFunction(
  {
    id: "generate-course",
    triggers: [{ event: "course/generate" }],
    retries: 2,
    concurrency: { key: "event.data.courseId", limit: 1 }, // one run per course, ever
    onFailure: async ({ event }) => {
      await markFailed(event.data.event.data.courseId, "Something went wrong while building. Resume to pick up where it stopped.");
    },
  },
  async ({ event, step }) => {
    const courseId: string = event.data.courseId;
    const outline = await step.run("outline", () => runOutline(courseId));
    if (outline.paused) return outline;
    for (let i = 0; i < outline.modules; i++) {
      const r = await step.run(`module-${i + 1}`, () => runModule(courseId, i));
      if (r.paused) return r;
    }
    await step.run("finalize", () => finalize(courseId));
    return { done: true };
  },
);

export const functions = [generateCourse];
