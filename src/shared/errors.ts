/**
 * Base error class for all ATSF errors.
 * Never throw raw strings — always extend this class.
 */
export class ATSFError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'ATSFError';
  }
}

export class BudgetExceededError extends ATSFError {
  constructor(
    public readonly currentCostUsd: number,
    public readonly budgetLimitUsd: number,
  ) {
    super(
      `Budget exceeded: $${currentCostUsd.toFixed(4)} > $${budgetLimitUsd.toFixed(4)}`,
      'BUDGET_EXCEEDED',
    );
    this.name = 'BudgetExceededError';
  }
}

export class ProviderError extends ATSFError {
  constructor(
    public readonly providerId: string,
    message: string,
    cause?: Error,
  ) {
    super(message, 'PROVIDER_ERROR', cause);
    this.name = 'ProviderError';
  }
}

export class ValidationError extends ATSFError {
  constructor(message: string, cause?: Error) {
    super(message, 'VALIDATION_ERROR', cause);
    this.name = 'ValidationError';
  }
}

export class ConfigError extends ATSFError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONFIG_ERROR', cause);
    this.name = 'ConfigError';
  }
}

export class CircuitBreakerOpenError extends ATSFError {
  constructor(
    public readonly providerId: string,
    public readonly cooldownMs: number,
  ) {
    super(
      `Circuit breaker open for provider "${providerId}". Cooldown: ${cooldownMs}ms`,
      'CIRCUIT_BREAKER_OPEN',
    );
    this.name = 'CircuitBreakerOpenError';
  }
}
