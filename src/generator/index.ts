/**
 * Generator module — public API for artifact generation from project descriptions.
 */

export { generate } from './generator.js';
export type { GeneratorConfig, GeneratorResult } from './types.js';
export { deriveTickets, derivePromptPacks } from './derive.js';
