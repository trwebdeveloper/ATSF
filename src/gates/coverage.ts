/**
 * Coverage Gate — T12
 *
 * Builds a bipartite graph mapping modules to tasks (Section 7.3.1).
 * Score: coveredModules / totalModules
 */

import type { GatePlugin, GateContext, GateResult, GateFinding, GateFix } from './types.js';
import type { ArtifactSet } from '../emitter/cross-ref-validator.js';

/**
 * Extract all module paths from the repo blueprint (files only).
 */
function extractModules(artifacts: ArtifactSet): string[] {
  const modules: string[] = [];
  function walk(nodes: ArtifactSet['repoBlueprint']['root'], prefix: string): void {
    for (const node of nodes) {
      const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.type === 'file') {
        modules.push(fullPath);
      }
      if (node.children && node.children.length > 0) {
        walk(node.children, fullPath);
      }
    }
  }
  walk(artifacts.repoBlueprint.root, '');
  return modules;
}

/**
 * Build a bipartite mapping: module -> set of tasks that cover it.
 * A task "covers" a module if the module path appears in the task's filesWrite.
 */
function buildBipartiteGraph(
  artifacts: ArtifactSet,
): { moduleTasks: Map<string, Set<string>>; taskModules: Map<string, Set<string>> } {
  const modules = extractModules(artifacts);
  const moduleTasks = new Map<string, Set<string>>();
  const taskModules = new Map<string, Set<string>>();

  for (const mod of modules) {
    moduleTasks.set(mod, new Set());
  }

  for (const task of artifacts.taskGraph.tasks) {
    const covered = new Set<string>();
    for (const fp of task.filesWrite) {
      if (moduleTasks.has(fp)) {
        moduleTasks.get(fp)!.add(task.id);
        covered.add(fp);
      }
    }
    taskModules.set(task.id, covered);
  }

  return { moduleTasks, taskModules };
}

export const coverageGate: GatePlugin = {
  id: 'coverage',
  name: 'Coverage Gate',
  version: '1.0.0',
  priority: 3,
  fixable: true,

  async run(context: GateContext): Promise<GateResult> {
    const start = performance.now();

    if (context.signal.aborted) {
      return {
        gateId: 'coverage',
        score: 0,
        passed: false,
        findings: [],
        fixes: [],
        durationMs: performance.now() - start,
      };
    }

    const findings: GateFinding[] = [];
    const fixes: GateFix[] = [];

    const { moduleTasks } = buildBipartiteGraph(context.artifacts);
    const totalModules = moduleTasks.size;

    if (totalModules === 0) {
      return {
        gateId: 'coverage',
        score: 1.0,
        passed: true,
        findings: [],
        fixes: [],
        durationMs: performance.now() - start,
      };
    }

    // Find uncovered modules
    let coveredCount = 0;
    for (const [modulePath, tasks] of moduleTasks) {
      if (tasks.size > 0) {
        coveredCount++;
      } else {
        findings.push({
          ruleId: 'coverage-module-uncovered',
          severity: 'error',
          message: `Module "${modulePath}" has no covering task`,
          location: {
            artifact: 'repo_blueprint',
            file: 'repo_blueprint.yaml',
            path: ['root', modulePath],
          },
          fixable: true,
        });

        fixes.push({
          gateId: 'coverage',
          ruleId: 'coverage-module-uncovered',
          severity: 'error',
          description: `Generate skeleton task for uncovered module "${modulePath}"`,
          location: {
            file: 'task_graph.yaml',
            path: ['tasks'],
          },
          fix: {
            type: 'insert',
            target: 'tasks',
            value: {
              name: `Implement ${modulePath}`,
              filesWrite: [modulePath],
            },
          },
        });
      }
    }

    // Check for contracts (tickets) without implementing tasks
    const taskIds = new Set(context.artifacts.taskGraph.tasks.map(t => t.id));
    for (const ticket of context.artifacts.tickets) {
      if (!taskIds.has(ticket.frontmatter.id)) {
        findings.push({
          ruleId: 'coverage-contract-orphan',
          severity: 'warning',
          message: `Ticket "${ticket.frontmatter.id}" has no implementing task in task graph`,
          location: {
            artifact: 'tickets',
            file: `tickets/${ticket.frontmatter.id}.md`,
            path: ['frontmatter', 'id'],
          },
          fixable: false,
        });
      }
    }

    const score = totalModules > 0 ? coveredCount / totalModules : 1.0;
    const threshold = context.config.gates['coverage']?.threshold ?? context.config.threshold;
    const passed = score >= threshold;

    return {
      gateId: 'coverage',
      score,
      passed,
      findings,
      fixes,
      durationMs: performance.now() - start,
    };
  },
};
