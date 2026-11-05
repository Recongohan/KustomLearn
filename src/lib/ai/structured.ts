import "server-only";
import type Anthropic from "@anthropic-ai/sdk";

// `messages.parse` throws when the text isn't valid output (a cut-off or refused answer) before the caller sees the
// usage, so failed calls would go unbilled. Callers use `messages.create` with this beta and parse here instead.
export const STRUCTURED_BETA = "structured-outputs-2025-12-15";

/** The first text block parsed with the output format, or null when it is missing or doesn't match. */
export function parseOutput<T>(res: Anthropic.Beta.BetaMessage, format: { parse: (text: string) => T }): T | null {
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") return null;
  try {
    return format.parse(text.text);
  } catch {
    return null;
  }
}
