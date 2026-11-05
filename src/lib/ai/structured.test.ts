import { describe, it, expect } from "vitest";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { parseOutput } from "./structured";

const format = betaZodOutputFormat(z.object({ title: z.string() }));
const msg = (text: string) => ({ content: [{ type: "text", text }] }) as never;

describe("parseOutput", () => {
  it("parses valid output and returns null instead of throwing on bad output", () => {
    expect(parseOutput(msg('{"title":"x"}'), format)).toEqual({ title: "x" });
    expect(parseOutput(msg('{"title":"cut off'), format)).toBeNull(); // truncated at max_tokens
    expect(parseOutput(msg("I can't help with that."), format)).toBeNull(); // a refusal in plain text
    expect(parseOutput(msg('{"nope":1}'), format)).toBeNull(); // valid JSON, wrong shape
    expect(parseOutput({ content: [] } as never, format)).toBeNull();
  });
});
