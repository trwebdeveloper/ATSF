/**
 * Pipeline factory — T14
 *
 * createPipeline(config, provider) wires together all subsystems into a Pipeline
 * object that the OrchestratorEngine consumes. This enables testing individual
 * subsystems in isolation and swapping implementations (e.g., mock providers for CI).
 *
 * Source: Section 2.3.3 Pipeline Factory; Appendix C Module Dependency Graph.
 */

import type { OrchestratorConfig, Pipeline } from './engine.js';
import type { ProviderAdapter } from '../providers/types.js';
import { createEventBus } from '../events/event-bus.js';
import { ResilienceLayer } from '../resilience/resilience-layer.js';
import { createProviderRegistry } from '../providers/registry.js';
import { GraphBuilder } from '../dag/static/graph-builder.js';
import { DebateEngine } from '../debate/engine.js';
import { GateOrchestrator } from '../gates/orchestrator.js';
import { GateRegistry } from '../gates/registry.js';
import { EmitterPipeline } from '../emitter/pipeline.js';
import { Semaphore } from '../resilience/semaphore.js';
import { validateCrossReferences } from '../emitter/cross-ref-validator.js';

/**
 * Create a fully-wired Pipeline from an OrchestratorConfig and a ProviderAdapter.
 *
 * The factory:
 * 1. Creates a shared EventBus
 * 2. Creates a ResilienceLayer (with EventBus for circuit events)
 * 3. Creates a ProviderRegistry and registers the provider
 * 4. Creates a GraphBuilder (stateless, no dependencies)
 * 5. Creates a DebateEngine via its static factory (provider + resilience + eventBus)
 * 6. Creates a GateOrchestrator (registry + config + resilience + provider)
 * 7. Creates an EmitterPipeline (empty emitter list; emitters are added per-run)
 */
export function createPipeline(
  config: OrchestratorConfig,
  provider: ProviderAdapter,
): Pipeline {
  // 1. Shared EventBus
  const eventBus = createEventBus();

  // 2. ResilienceLayer with EventBus
  const resilience = new ResilienceLayer({}, eventBus);

  // 3. ProviderRegistry
  const providerRegistry = createProviderRegistry(provider.id);
  providerRegistry.register(provider);

  // 4. GraphBuilder (stateless)
  const graphBuilder = new GraphBuilder();

  // 5. DebateEngine via static factory
  const debateEngine = DebateEngine.create(provider, resilience, eventBus);

  // 6. GateOrchestrator
  const gateRegistry = new GateRegistry();
  const llmSemaphore = new Semaphore(config.maxConcurrency ?? 5);

  const gateOrchestrator = new GateOrchestrator({
    registry: gateRegistry,
    config: {
      threshold: 0.8,
      autoFix: true,
      maxFixRounds: 3,
      reporter: 'console',
      gates: {},
      custom: [],
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    },
    resilience,
    provider,
    model: 'mock-model',
    llmSemaphore,
    validateCrossReferences,
    signal: config.signal,
  });

  // 7. EmitterPipeline (empty — emitters are configured per-run by the engine)
  const emitterPipeline = new EmitterPipeline([]);

  return {
    eventBus,
    resilience,
    providerRegistry,
    graphBuilder,
    debateEngine,
    gateOrchestrator,
    emitterPipeline,
  };
}
