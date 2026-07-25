/**
 * AgriPak prompt library — barrel export.
 *
 * The prompts are the hand-written instructions that turn a general-purpose
 * model into a Pakistani agricultural extension officer. Each file is
 * self-contained and heavily commented; see `shared.ts` for the design
 * principles they all follow.
 *
 *   shared.ts     persona, Pakistan grounding, language / honesty / safety / style
 *   chat.ts       POST /api/ai/chat      — conversational assistant
 *   diagnosis.ts  POST /api/ai/diagnose  — disease detection from a photo
 *   advisor.ts    POST /api/ai/advisor   — crop selection and planning
 */

export * from "./shared"
export * from "./chat"
export * from "./diagnosis"
export * from "./advisor"
