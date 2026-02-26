/**
 * Emitter types — T11
 *
 * Core interfaces for the emitter pipeline: VirtualFS, Emitter, EmitterContext,
 * and input types for each of the six artifact emitters.
 */

import type { VirtualFS } from './virtual-fs.js';
import type {
  TaskGraphArtifact,
  RepoBlueprint,
  Mpd,
  Ticket,
  AiPromptPack,
} from '../contracts/artifact-schemas.js';

/* ------------------------------------------------------------------ */
/*  VirtualFS interface (re-exported for consumers)                    */
/* ------------------------------------------------------------------ */

export type { VirtualFS };

/* ------------------------------------------------------------------ */
/*  Emitter interface                                                   */
/* ------------------------------------------------------------------ */

export interface Emitter {
  /** Human-readable name for logging. */
  readonly name: string;

  /**
   * Emit artifact(s) by writing to ctx.vfs.
   * Should NOT perform any disk I/O — that is VirtualFS.flush()'s job.
   */
  emit(ctx: EmitterContext): Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Input types for each emitter                                       */
/* ------------------------------------------------------------------ */

/** Input data for the TaskGraphEmitter (subset of TaskGraphArtifact without generated fields). */
export interface TaskGraphInput {
  project: TaskGraphArtifact['project'];
  tasks: TaskGraphArtifact['tasks'];
}

/** Input data for the RepoBlueprintEmitter. */
export interface RepoBlueprintInput {
  projectName: string;
  root: RepoBlueprint['root'];
}

/** Input data for the MpdEmitter (all fields except version/generated/checksum). */
export type MpdInput = Omit<Mpd, 'version' | 'generated' | 'checksum'>;

/** Input data for a single ticket. */
export type TicketInput = Ticket;

/** Input data for a single AI prompt pack. */
export type PromptPackInput = AiPromptPack;

/* ------------------------------------------------------------------ */
/*  EmitterContext                                                      */
/* ------------------------------------------------------------------ */

/**
 * Shared context passed to every emitter in the pipeline.
 * The VirtualFS is the only mutable state; everything else is read-only input.
 */
export interface EmitterContext {
  /** Name of the project (used in all artifact headers). */
  readonly projectName: string;

  /** ISO 8601 timestamp fixed at pipeline start (deterministic, not per-file). */
  readonly generatedAt: string;

  /** The shared in-memory filesystem; all emitters write here. */
  readonly vfs: VirtualFS;

  /** Total LLM cost incurred so far (for manifest). */
  readonly totalCostUsd: number;

  /** Pipeline duration in milliseconds (for manifest). */
  readonly durationMs: number;

  /** Total number of tasks (for manifest). */
  readonly totalTasks?: number;

  /* Optional per-emitter input — only provided when that emitter runs */

  /** Input for TaskGraphEmitter. */
  readonly taskGraphInput?: TaskGraphInput;

  /** Input for RepoBlueprintEmitter. */
  readonly repoBlueprintInput?: RepoBlueprintInput;

  /** Input for MpdEmitter. */
  readonly mpdInput?: MpdInput;

  /** Input for TicketsEmitter — one per task. */
  readonly ticketsInput?: TicketInput[];

  /** Input for PromptPackEmitter — one per task. */
  readonly promptPackInput?: PromptPackInput[];
}

/* ------------------------------------------------------------------ */
/*  EmitterPipeline interface                                          */
/* ------------------------------------------------------------------ */

export interface IEmitterPipeline {
  /** Run all emitters in sequence against the given context. */
  run(ctx: EmitterContext): Promise<void>;
}
