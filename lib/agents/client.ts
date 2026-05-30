// Server-side only. Lazy Anthropic client factory for the BrewBoat agents
// (shift generation — Phase 2.1; staff assignment — Phase 3). Lazy so tests
// and the Vercel build can import agent modules without ANTHROPIC_API_KEY set.

import Anthropic from "@anthropic-ai/sdk";

// DEC-103: Claude Sonnet for the shift-generation and assignment agents.
// This is a deliberate project decision, not a cost downgrade — do not bump
// to Opus without revisiting DEC-103. Bare ID per the SDK (no date suffix).
export const AGENT_MODEL = "claude-sonnet-4-6";

let cached: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set. Required for the BrewBoat agents (DEC-103).");
  }
  if (!cached) {
    cached = new Anthropic({ apiKey });
  }
  return cached;
}
