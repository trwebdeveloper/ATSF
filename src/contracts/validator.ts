/**
 * Three-Level Validation Pipeline — T09
 *
 * Implements L1 (Shape), L2 (Deep), L3 (Cross-Agent) per Section 8.4.
 *
 * L1: Structural validation via z.parse() / z.safeParse()
 * L2: Cross-field referential integrity via .superRefine()
 * L3: Cross-agent reference validation (stub — completed in T13)
 */
import { AgentOutputSchema, ValidatedAgentOutputSchema } from './schemas.js';

/* ------------------------------------------------------------------ */
/*  ValidationResult type                                              */
/* ------------------------------------------------------------------ */

export interface ValidationIssue {
  readonly code: string;
  readonly path: ReadonlyArray<PropertyKey>;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly level: 1 | 2 | 3;
  readonly errors: ReadonlyArray<ValidationIssue>;
}

/* ------------------------------------------------------------------ */
/*  Cross-agent validation stub                                        */
/* ------------------------------------------------------------------ */

/**
 * Validate cross-agent references. Stub for MVP — returns empty errors.
 * Will be completed in T13 (Cross-Reference Validator).
 */
function validateCrossAgentReferences(
  _data: unknown,
  _crossAgentContext: Map<string, unknown>,
): ReadonlyArray<ValidationIssue> {
  // MVP stub: no cross-agent validation implemented yet
  return [];
}

/* ------------------------------------------------------------------ */
/*  Three-level validation pipeline                                    */
/* ------------------------------------------------------------------ */

/**
 * Validates agent output at the requested level.
 *
 * - Level 1 (Shape): Structural schema conformance via z.safeParse()
 * - Level 2 (Deep): Cross-field rules via .superRefine() (after L1 passes)
 * - Level 3 (Cross-Agent): References between agents' outputs (after L2 passes)
 *
 * The pipeline is sequential: L1 must pass before L2, L2 before L3.
 */
export async function validateAgentOutput(
  output: unknown,
  level: 1 | 2 | 3,
  crossAgentContext?: Map<string, unknown>,
): Promise<ValidationResult> {
  // L1: Shape validation
  const l1Result = AgentOutputSchema.safeParse(output);
  if (!l1Result.success) {
    return {
      valid: false,
      level: 1,
      errors: l1Result.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: issue.message,
      })),
    };
  }
  if (level === 1) {
    return { valid: true, level: 1, errors: [] };
  }

  // L2: Deep validation (cross-field within single output)
  const l2Result = ValidatedAgentOutputSchema.safeParse(output);
  if (!l2Result.success) {
    return {
      valid: false,
      level: 2,
      errors: l2Result.error.issues.map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: issue.message,
      })),
    };
  }
  if (level === 2) {
    return { valid: true, level: 2, errors: [] };
  }

  // L3: Cross-agent validation (requires other agents' outputs)
  if (!crossAgentContext) {
    throw new Error('L3 validation requires crossAgentContext');
  }
  const l3Errors = validateCrossAgentReferences(l2Result.data, crossAgentContext);
  return {
    valid: l3Errors.length === 0,
    level: 3,
    errors: l3Errors,
  };
}
