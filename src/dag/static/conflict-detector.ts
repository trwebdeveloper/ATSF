import micromatch from 'micromatch';
import type { TaskId } from '../../shared/types.js';
import type { TaskNode, FileConflict } from '../types.js';
import { normalizePath } from '../../shared/normalize-path.js';

/**
 * Detect file conflicts between tasks using micromatch glob overlap analysis.
 *
 * Readers-writer lock semantics:
 * - Multiple concurrent reads are allowed (no conflict).
 * - Writes conflict with both reads and other writes.
 *
 * Candidate file discovery uses the union of all filesWrite and filesRead
 * patterns across all tasks as candidate paths. This is a pure string-level
 * overlap check -- no filesystem scanning occurs.
 *
 * @param nodes - Map of task nodes to analyze
 * @param _workspaceRoot - Workspace root (unused in pure string matching)
 * @returns Array of file conflicts between tasks
 */
export function detectConflicts(
  nodes: ReadonlyMap<TaskId, TaskNode>,
  _workspaceRoot: string,
): readonly FileConflict[] {
  const conflicts: FileConflict[] = [];

  // Collect all unique glob patterns as candidate paths
  const allPatterns = new Set<string>();
  for (const node of nodes.values()) {
    for (const p of node.filesWrite) {
      allPatterns.add(normalizePath(p));
    }
    for (const p of node.filesRead) {
      allPatterns.add(normalizePath(p));
    }
  }

  const candidateFiles = [...allPatterns];

  if (candidateFiles.length === 0) {
    return conflicts;
  }

  // Build per-task match sets
  const nodeEntries = [...nodes.entries()];

  // Pre-compute matches for each task
  const writeMatches = new Map<TaskId, Set<string>>();
  const readMatches = new Map<TaskId, Set<string>>();

  for (const [id, node] of nodeEntries) {
    const normalizedWrites = node.filesWrite.map(normalizePath);
    const normalizedReads = node.filesRead.map(normalizePath);

    const wm = normalizedWrites.length > 0
      ? new Set(micromatch(candidateFiles, normalizedWrites))
      : new Set<string>();
    const rm = normalizedReads.length > 0
      ? new Set(micromatch(candidateFiles, normalizedReads))
      : new Set<string>();

    writeMatches.set(id, wm);
    readMatches.set(id, rm);
  }

  // Compare all task pairs (i < j to avoid duplicates)
  for (let i = 0; i < nodeEntries.length; i++) {
    const [idA] = nodeEntries[i];
    const writesA = writeMatches.get(idA)!;
    const readsA = readMatches.get(idA)!;

    for (let j = i + 1; j < nodeEntries.length; j++) {
      const [idB] = nodeEntries[j];
      const writesB = writeMatches.get(idB)!;
      const readsB = readMatches.get(idB)!;

      // Check write-write conflicts
      for (const file of writesA) {
        if (writesB.has(file)) {
          conflicts.push({
            taskA: idA,
            taskB: idB,
            pattern: file,
            reason: 'write-write',
          });
        }
      }

      // Check read-write conflicts (A writes, B reads)
      for (const file of writesA) {
        if (readsB.has(file)) {
          conflicts.push({
            taskA: idA,
            taskB: idB,
            pattern: file,
            reason: 'read-write',
          });
        }
      }

      // Check read-write conflicts (B writes, A reads)
      for (const file of writesB) {
        if (readsA.has(file)) {
          conflicts.push({
            taskA: idB,
            taskB: idA,
            pattern: file,
            reason: 'read-write',
          });
        }
      }
    }
  }

  return conflicts;
}
