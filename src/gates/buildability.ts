/**
 * Buildability Gate — T12
 *
 * DAG validation: cycle detection, topological sort, file lock conflicts (Section 7.3.4).
 * Binary gate: score = 1.0 if valid, 0.0 otherwise.
 */

import type { GatePlugin, GateContext, GateResult, GateFinding, GateFix } from './types.js';

/**
 * DFS 3-color cycle detection.
 * Returns the cycle path if found, null otherwise.
 */
function detectCycle(
  tasks: Array<{ id: string; dependsOn: string[] }>,
): string[] | null {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const taskIds = new Set(tasks.map(t => t.id));

  for (const t of tasks) color.set(t.id, WHITE);

  const adj = new Map<string, string[]>();
  for (const t of tasks) {
    adj.set(t.id, t.dependsOn.filter(d => taskIds.has(d)));
  }

  function dfs(node: string, path: string[]): string[] | null {
    color.set(node, GRAY);
    path.push(node);

    for (const neighbor of adj.get(node) ?? []) {
      if (color.get(neighbor) === GRAY) {
        // Found a cycle: extract cycle path from neighbor to node
        const cycleStart = path.indexOf(neighbor);
        return path.slice(cycleStart).concat(neighbor);
      }
      if (color.get(neighbor) === WHITE) {
        parent.set(neighbor, node);
        const result = dfs(neighbor, path);
        if (result) return result;
      }
    }

    path.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const t of tasks) {
    if (color.get(t.id) === WHITE) {
      const cycle = dfs(t.id, []);
      if (cycle) return cycle;
    }
  }

  return null;
}

/**
 * Kahn's algorithm for topological sort validation.
 * Returns true if all tasks can be topologically sorted (no cycles).
 */
function kahnTopologicalSort(
  tasks: Array<{ id: string; dependsOn: string[] }>,
): { valid: boolean; sorted: string[] } {
  const taskIds = new Set(tasks.map(t => t.id));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const t of tasks) {
    inDegree.set(t.id, 0);
    adj.set(t.id, []);
  }

  for (const t of tasks) {
    for (const dep of t.dependsOn) {
      if (taskIds.has(dep)) {
        adj.get(dep)!.push(t.id);
        inDegree.set(t.id, (inDegree.get(t.id) ?? 0) + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [id, degree] of inDegree) {
    if (degree === 0) queue.push(id);
  }

  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) queue.push(neighbor);
    }
  }

  return { valid: sorted.length === tasks.length, sorted };
}

/**
 * File lock conflict analysis via BFS reachability.
 * Detects tasks that write to the same file without a dependency ordering.
 */
function detectFileLockConflicts(
  tasks: Array<{ id: string; dependsOn: string[]; filesWrite: string[] }>,
): Array<{ file: string; tasks: string[] }> {
  const conflicts: Array<{ file: string; tasks: string[] }> = [];

  // Build adjacency for reachability (transitive closure check)
  const taskIds = new Set(tasks.map(t => t.id));
  const adj = new Map<string, Set<string>>();
  for (const t of tasks) {
    adj.set(t.id, new Set(t.dependsOn.filter(d => taskIds.has(d))));
  }

  // BFS reachability: can `from` reach `to` via dependencies?
  function isReachable(from: string, to: string): boolean {
    const visited = new Set<string>();
    const queue = [from];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current === to) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const dep of adj.get(current) ?? []) {
        queue.push(dep);
      }
    }
    return false;
  }

  // Group tasks by file they write to
  const fileWriters = new Map<string, string[]>();
  for (const task of tasks) {
    for (const file of task.filesWrite) {
      if (!fileWriters.has(file)) fileWriters.set(file, []);
      fileWriters.get(file)!.push(task.id);
    }
  }

  // For each file with multiple writers, check if they are ordered
  for (const [file, writers] of fileWriters) {
    if (writers.length < 2) continue;

    const unordered: string[] = [];
    for (let i = 0; i < writers.length; i++) {
      for (let j = i + 1; j < writers.length; j++) {
        const a = writers[i];
        const b = writers[j];
        if (!isReachable(a, b) && !isReachable(b, a)) {
          if (!unordered.includes(a)) unordered.push(a);
          if (!unordered.includes(b)) unordered.push(b);
        }
      }
    }

    if (unordered.length > 0) {
      conflicts.push({ file, tasks: unordered });
    }
  }

  return conflicts;
}

export const buildabilityGate: GatePlugin = {
  id: 'buildability',
  name: 'Buildability Gate',
  version: '1.0.0',
  priority: 1,
  fixable: true,

  async run(context: GateContext): Promise<GateResult> {
    const start = performance.now();

    if (context.signal.aborted) {
      return {
        gateId: 'buildability',
        score: 0,
        passed: false,
        findings: [],
        fixes: [],
        durationMs: performance.now() - start,
      };
    }

    const findings: GateFinding[] = [];
    const fixes: GateFix[] = [];
    const tasks = context.artifacts.taskGraph.tasks;

    // 1. DFS cycle detection
    const cycle = detectCycle(tasks);
    if (cycle) {
      findings.push({
        ruleId: 'buildability-cycle',
        severity: 'error',
        message: `Cycle detected in task graph: ${cycle.join(' -> ')}`,
        location: {
          artifact: 'task_graph',
          file: 'task_graph.yaml',
          path: ['tasks'],
        },
        fixable: true,
      });

      fixes.push({
        gateId: 'buildability',
        ruleId: 'buildability-cycle',
        severity: 'error',
        description: `Break cycle by removing dependency edge`,
        location: {
          file: 'task_graph.yaml',
          path: ['tasks'],
        },
        fix: {
          type: 'delete',
          target: 'dependsOn',
          value: { cycle },
        },
      });
    }

    // 2. Kahn's topological sort validation
    const topoResult = kahnTopologicalSort(tasks);
    if (!topoResult.valid) {
      findings.push({
        ruleId: 'buildability-topo',
        severity: 'error',
        message: 'Topological sort failed: not all tasks could be ordered',
        location: {
          artifact: 'task_graph',
          file: 'task_graph.yaml',
          path: ['tasks'],
        },
        fixable: true,
      });
    }

    // 3. File lock conflict analysis
    const conflicts = detectFileLockConflicts(tasks);
    for (const conflict of conflicts) {
      findings.push({
        ruleId: 'buildability-file-conflict',
        severity: 'warning',
        message: `File "${conflict.file}" written by unordered tasks: ${conflict.tasks.join(', ')}`,
        location: {
          artifact: 'task_graph',
          file: 'task_graph.yaml',
          path: ['tasks'],
        },
        fixable: true,
      });

      fixes.push({
        gateId: 'buildability',
        ruleId: 'buildability-file-conflict',
        severity: 'warning',
        description: `Add dependency ordering for tasks writing to "${conflict.file}"`,
        location: {
          file: 'task_graph.yaml',
          path: ['tasks'],
        },
        fix: {
          type: 'insert',
          target: 'dependsOn',
          value: { file: conflict.file, tasks: conflict.tasks },
        },
      });
    }

    // Binary gate: 1.0 if no cycles, topo sort succeeds, and no unresolvable conflicts
    const hasErrors = findings.some(f => f.severity === 'error');
    const score = hasErrors ? 0.0 : 1.0;
    const threshold = context.config.gates['buildability']?.threshold ?? context.config.threshold;
    const passed = score >= threshold;

    return {
      gateId: 'buildability',
      score,
      passed,
      findings,
      fixes,
      durationMs: performance.now() - start,
    };
  },
};
