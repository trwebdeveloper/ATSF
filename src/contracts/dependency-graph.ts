/**
 * Contract Dependency Graph — T09
 *
 * Tracks contract change propagation: when a schema changes,
 * which downstream contracts are affected?
 *
 * This module provides a simple directed graph of contract dependencies
 * so that schema version bumps can propagate validation invalidation.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ContractNode {
  readonly id: string;
  readonly dependsOn: ReadonlyArray<string>;
}

export interface PropagationResult {
  /** The IDs of all contracts affected by a change to the source contract. */
  readonly affected: ReadonlyArray<string>;
}

/* ------------------------------------------------------------------ */
/*  ContractDependencyGraph                                            */
/* ------------------------------------------------------------------ */

export interface ContractDependencyGraph {
  /** Register a contract and its dependencies. */
  register(node: ContractNode): void;

  /** Get all contracts that depend (directly or transitively) on the given contract. */
  getAffected(contractId: string): PropagationResult;

  /** Get the direct dependencies of a contract. */
  getDependencies(contractId: string): ReadonlyArray<string>;

  /** Get all registered contract IDs. */
  getAllIds(): ReadonlyArray<string>;
}

export function createContractDependencyGraph(): ContractDependencyGraph {
  // Forward edges: contractId -> set of contracts it depends on
  const dependsOn = new Map<string, Set<string>>();
  // Reverse edges: contractId -> set of contracts that depend on it
  const dependedBy = new Map<string, Set<string>>();

  return {
    register(node: ContractNode): void {
      dependsOn.set(node.id, new Set(node.dependsOn));
      for (const dep of node.dependsOn) {
        if (!dependedBy.has(dep)) {
          dependedBy.set(dep, new Set());
        }
        dependedBy.get(dep)!.add(node.id);
      }
      // Ensure the node itself exists in dependedBy map
      if (!dependedBy.has(node.id)) {
        dependedBy.set(node.id, new Set());
      }
    },

    getAffected(contractId: string): PropagationResult {
      const affected = new Set<string>();
      const queue: string[] = [contractId];

      while (queue.length > 0) {
        const current = queue.shift()!;
        const deps = dependedBy.get(current);
        if (deps) {
          for (const dep of deps) {
            if (!affected.has(dep)) {
              affected.add(dep);
              queue.push(dep);
            }
          }
        }
      }

      return { affected: Array.from(affected) };
    },

    getDependencies(contractId: string): ReadonlyArray<string> {
      const deps = dependsOn.get(contractId);
      return deps ? Array.from(deps) : [];
    },

    getAllIds(): ReadonlyArray<string> {
      return Array.from(dependsOn.keys());
    },
  };
}
