// Phase 2.1: shift-generation agent — the SDK call + orchestration.
//
// generateShifts() builds the prompts (shift-agent-prompt.ts), calls the model
// with structured output (output_config.format), and parses the reply into
// GeneratedShift[]. The model call is injected as a `responder` so unit tests
// can run the full build → parse path with a canned reply — no network, no key.
//
// Structured outputs (output_config.format with a json_schema) is the chosen
// mechanism over forced tool-use: less boilerplate, and the schema guarantees
// parseable JSON. Supported on Sonnet 4.6 (DEC-103 model).

import { AGENT_MODEL, getAnthropicClient } from "./client.ts";
import {
  buildUserPrompt,
  parseShiftAgentOutput,
  SHIFT_AGENT_SYSTEM_PROMPT,
  SHIFT_OUTPUT_SCHEMA,
  type GeneratedShift,
} from "./shift-agent-prompt.ts";
import type { TimeSlot } from "../xola/mapping.ts";

export interface ShiftResponderRequest {
  system: string;
  userPrompt: string;
  model: string;
}

// Returns the raw JSON string the model produced (the structured-output text).
export type ShiftResponder = (req: ShiftResponderRequest) => Promise<string>;

export interface GenerateShiftsOptions {
  slots: readonly TimeSlot[];
  weekStart: string;
  timezone?: string;
  responder?: ShiftResponder;
}

// Generous headroom — a brewboat operator's full week is well under 4k output
// tokens; 16k absorbs any reasonable spike without risking a mid-JSON truncation.
const MAX_OUTPUT_TOKENS = 16000;

// Real model call. The system prompt + few-shot are a stable prefix, so they
// carry a cache_control breakpoint; the per-week user turn stays uncached.
async function defaultResponder({ system, userPrompt, model }: ShiftResponderRequest): Promise<string> {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: { type: "json_schema", schema: SHIFT_OUTPUT_SCHEMA } },
  });

  // Surface model-side failure modes with enough context to debug. The grader
  // and pipeline retry policy (2.2) need stop_reason + output-token count to
  // distinguish "truncated mid-JSON" from "refused" from "produced empty output".
  if (message.stop_reason !== "end_turn") {
    const snippet = message.content
      .map((b) => (b.type === "text" ? b.text : `<${b.type}>`))
      .join(" | ")
      .slice(0, 240);
    throw new Error(
      `shift agent: stop_reason=${message.stop_reason} (output_tokens=${message.usage.output_tokens}); content: ${snippet}`,
    );
  }
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`shift agent: no text block in response (content blocks: ${message.content.map((b) => b.type).join(", ") || "none"})`);
  }
  return textBlock.text;
}

export async function generateShifts(options: GenerateShiftsOptions): Promise<GeneratedShift[]> {
  const { slots, weekStart, timezone = "America/New_York" } = options;
  const responder = options.responder ?? defaultResponder;

  const userPrompt = buildUserPrompt(slots, weekStart, timezone);
  const raw = await responder({
    system: SHIFT_AGENT_SYSTEM_PROMPT,
    userPrompt,
    model: AGENT_MODEL,
  });
  return parseShiftAgentOutput(raw);
}
