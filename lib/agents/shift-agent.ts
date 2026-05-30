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

// Real model call. The system prompt + few-shot are a stable prefix, so they
// carry a cache_control breakpoint; the per-week user turn stays uncached.
const defaultResponder: ShiftResponder = async ({ system, userPrompt, model }) => {
  const client = getAnthropicClient();
  const message = await client.messages.create({
    model,
    max_tokens: 16000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: { type: "json_schema", schema: SHIFT_OUTPUT_SCHEMA } },
  });
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error(`shift agent: no text block in response (stop_reason=${message.stop_reason})`);
  }
  return textBlock.text;
};
