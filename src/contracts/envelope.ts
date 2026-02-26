/**
 * Versioned Envelope with Discriminated Union — T09
 *
 * Implements the versioned envelope per Section 8.5.
 * Uses z.discriminatedUnion() with the 'contractVersion' discriminator.
 *
 * Zod v4 limitation: Cannot apply .superRefine() to individual
 * discriminated union members — apply refinements to the union itself.
 */
import { z } from 'zod';
import { AgentOutputSchema } from './schemas.js';

/* ------------------------------------------------------------------ */
/*  Versioned payload schemas                                          */
/* ------------------------------------------------------------------ */

export const V1PayloadSchema = z.object({
  contractVersion: z.literal('1.0'),
  agentOutput: AgentOutputSchema,
  checksum: z.string(),
});

export const V2PayloadSchema = z.object({
  contractVersion: z.literal('2.0'),
  agentOutput: AgentOutputSchema,
  checksum: z.string(),
  migrationLog: z.array(z.string()), // Added in v2
});

/* ------------------------------------------------------------------ */
/*  Discriminated union                                                */
/* ------------------------------------------------------------------ */

/**
 * Zod v4 syntax: two-arg form with discriminator key.
 * Auto-detects the discriminator from literal fields.
 */
export const VersionedEnvelope = z.discriminatedUnion('contractVersion', [
  V1PayloadSchema,
  V2PayloadSchema,
]);

/* ------------------------------------------------------------------ */
/*  Validated envelope (cross-version validation on the union)         */
/* ------------------------------------------------------------------ */

/**
 * Apply cross-version validation to the UNION, not individual members.
 * (superRefine on members breaks discriminator detection in Zod v4.)
 */
export const ValidatedEnvelope = VersionedEnvelope.superRefine((_data, _ctx) => {
  // Cross-version validation logic placeholder.
  // Currently no cross-version constraints — will be extended as needed.
});

/* ------------------------------------------------------------------ */
/*  Type exports                                                       */
/* ------------------------------------------------------------------ */

export type V1Payload = z.infer<typeof V1PayloadSchema>;
export type V2Payload = z.infer<typeof V2PayloadSchema>;
export type VersionedEnvelopeType = z.infer<typeof VersionedEnvelope>;
