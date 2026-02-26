import type { ZodType } from 'zod';

/**
 * Defines an AI agent's role, prompt templates, and output schema.
 */
export interface AgentDefinition {
  readonly type: string;
  readonly description: string;
  readonly provider: string;
  readonly model: string;
  readonly systemPromptTemplate: string;
  readonly outputSchema: ZodType;
  readonly maxRetries: number;
  readonly temperature: number;
}
