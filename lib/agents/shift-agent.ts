// Phase 2.1: shift-generation agent — the SDK call + orchestration.
// Phase 2.2: extended to surface token usage + prompt version so the
// pipeline can record a scheduling_runs audit row.
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
  SHIFT_AGENT_PROMPT_VERSION,
  SHIFT_AGENT_SYSTEM_PROMPT,
  SHIFT_OUTPUT_SCHEMA,
  type GeneratedShift,
} from "./shift-agent-prompt.ts";
import type { TimeSlot } from "../xola/mapping.ts";

export interface ShiftAgentUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
}

export interface ShiftResponderRequest {
  system: string;
  userPrompt: string;
  model: string;
}

export interface ShiftResponderResult {
  raw: string;
  usage?: ShiftAgentUsage;
}

export type ShiftResponder = (req: ShiftResponderRequest) => Promise<ShiftResponderResult>;

export interface GenerateShiftsOptions {
  slots: readonly TimeSlot[];
  weekStart: string;
  timezone?: string;
  responder?: ShiftResponder;
}

export interface GenerateShiftsResult {
  shifts: GeneratedShift[];
  raw: string;
  usage?: ShiftAgentUsage;
  model: string;
  promptVersion: string;
}

// Generous headroom — a brewboat operator's full week is well under 4k output
// tokens; 16k absorbs any reasonable spike without risking a mid-JSON truncation.
const MAX_OUTPUT_TOKENS = 16000;

// Real model call. The system prompt + few-shot are a stable prefix, so they
// carry a cache_control breakpoint; the per-week user turn stays uncached.
async function defaultResponder({ system, userPrompt, model }: ShiftResponderRequest): Promise<ShiftResponderResult> {
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

  // SDK Usage fields are present on every successful response. cache_*
  // fields can be null on cache-disabled calls; the persist layer treats
  // null as "not reported" rather than zero.
  return {
    raw: textBlock.text,
    usage: {
      input_tokens: message.usage.input_tokens,
      output_tokens: message.usage.output_tokens,
      cache_read_input_tokens: message.usage.cache_read_input_tokens ?? null,
      cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? null,
    },
  };
}

export async function generateShifts(options: GenerateShiftsOptions): Promise<GenerateShiftsResult> {
  const { slots, weekStart, timezone = "America/New_York" } = options;
  const responder = options.responder ?? defaultResponder;

  const userPrompt = buildUserPrompt(slots, weekStart, timezone);
  const result = await responder({
    system: SHIFT_AGENT_SYSTEM_PROMPT,
    userPrompt,
    model: AGENT_MODEL,
  });
  return {
    shifts: parseShiftAgentOutput(result.raw),
    raw: result.raw,
    usage: result.usage,
    model: AGENT_MODEL,
    promptVersion: SHIFT_AGENT_PROMPT_VERSION,
  };
}
