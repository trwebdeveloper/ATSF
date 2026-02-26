import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { GraphBuilder } from '../../../src/dag/static/graph-builder.js';
import type { RawTaskDefinition, TaskGraph } from '../../../src/dag/types.js';

function makeDef(overrides: Partial<RawTaskDefinition> & { id: string }): RawTaskDefinition {
  return {
    name: overrides.id,
    description: `Description for ${overrides.id}`,
    type: 'planning',
    agent: 'planner',
    dependsOn: [],
    filesRead: [],
    filesWrite: [],
    ...overrides,
  };
}

describe('GraphBuilder', () => {
  it('constructs TaskGraph from valid RawTaskDefinition[]', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1', filesWrite: ['src/a.ts'] }),
      makeDef({ id: 'T2', dependsOn: ['T1'], filesWrite: ['src/b.ts'] }),
      makeDef({ id: 'T3', dependsOn: ['T1'], filesWrite: ['src/c.ts'] }),
      makeDef({ id: 'T4', dependsOn: ['T2', 'T3'], filesWrite: ['src/d.ts'] }),
    ];

    const builder = new GraphBuilder();
    const graph: TaskGraph = builder.build(defs);

    // Verify structure
    expect(graph.nodes).toBeInstanceOf(Map);
    expect(graph.nodes.size).toBe(4);
    expect(graph.edges.length).toBeGreaterThan(0);
    expect(graph.layers.length).toBeGreaterThan(0);
    expect(graph.criticalPath.length).toBeGreaterThan(0);
  });

  it('computes layer for each TaskNode', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1' }),
      makeDef({ id: 'T2', dependsOn: ['T1'] }),
      makeDef({ id: 'T3', dependsOn: ['T1'] }),
      makeDef({ id: 'T4', dependsOn: ['T2', 'T3'] }),
    ];

    const builder = new GraphBuilder();
    const graph = builder.build(defs);

    expect(graph.nodes.get('T1')!.layer).toBe(0);
    expect(graph.nodes.get('T2')!.layer).toBe(1);
    expect(graph.nodes.get('T3')!.layer).toBe(1);
    expect(graph.nodes.get('T4')!.layer).toBe(2);
  });

  it('computes fileConflicts for each TaskNode', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1', filesWrite: ['src/shared.ts'] }),
      makeDef({ id: 'T2', filesWrite: ['src/shared.ts'] }),
      makeDef({ id: 'T3', filesWrite: ['src/other.ts'] }),
    ];

    const builder = new GraphBuilder();
    const graph = builder.build(defs);

    // T1 and T2 conflict on src/shared.ts
    expect(graph.nodes.get('T1')!.fileConflicts).toContain('T2');
    expect(graph.nodes.get('T2')!.fileConflicts).toContain('T1');
    // T3 has no conflicts
    expect(graph.nodes.get('T3')!.fileConflicts).toHaveLength(0);
  });

  it('TaskNode extends RawTaskDefinition (inherits all fields)', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({
        id: 'T1',
        name: 'Test Task',
        description: 'A test',
        type: 'planning',
        agent: 'planner',
        filesRead: ['input.txt'],
        filesWrite: ['output.txt'],
        priority: 5,
        metadata: { key: 'value' },
      }),
    ];

    const builder = new GraphBuilder();
    const graph = builder.build(defs);
    const node = graph.nodes.get('T1')!;

    expect(node.id).toBe('T1');
    expect(node.name).toBe('Test Task');
    expect(node.description).toBe('A test');
    expect(node.type).toBe('planning');
    expect(node.agent).toBe('planner');
    expect(node.filesRead).toEqual(['input.txt']);
    expect(node.filesWrite).toEqual(['output.txt']);
    expect(node.priority).toBe(5);
    expect(node.metadata).toEqual({ key: 'value' });
    // Computed fields
    expect(typeof node.layer).toBe('number');
    expect(Array.isArray(node.fileConflicts)).toBe(true);
  });

  it('throws on cyclic dependencies', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'A', dependsOn: ['C'] }),
      makeDef({ id: 'B', dependsOn: ['A'] }),
      makeDef({ id: 'C', dependsOn: ['B'] }),
    ];

    const builder = new GraphBuilder();
    expect(() => builder.build(defs)).toThrow();
  });

  it('throws on missing dependencies', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1', dependsOn: ['NONEXISTENT'] }),
    ];

    const builder = new GraphBuilder();
    expect(() => builder.build(defs)).toThrow();
  });

  it('normalizes file paths (backslash to forward slash, lowercase)', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1', filesWrite: ['Src\\Auth\\Login.ts'] }),
    ];

    const builder = new GraphBuilder();
    const graph = builder.build(defs);
    const node = graph.nodes.get('T1')!;

    // On Linux path.sep is '/', but normalizePath lowercases
    expect(node.filesWrite[0]).toBe('src/auth/login.ts');
  });

  it('stores critical path in TaskGraph.criticalPath', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1' }),
      makeDef({ id: 'T2', dependsOn: ['T1'] }),
      makeDef({ id: 'T3', dependsOn: ['T2'] }),
    ];

    const builder = new GraphBuilder();
    const graph = builder.build(defs);

    expect(graph.criticalPath).toEqual(['T1', 'T2', 'T3']);
  });

  it('stores file conflicts in TaskGraph.fileConflicts', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1', filesWrite: ['src/shared.ts'] }),
      makeDef({ id: 'T2', filesWrite: ['src/shared.ts'] }),
    ];

    const builder = new GraphBuilder();
    const graph = builder.build(defs);

    expect(graph.fileConflicts.length).toBeGreaterThanOrEqual(1);
    expect(graph.fileConflicts.some(c =>
      c.reason === 'write-write' &&
      ((c.taskA === 'T1' && c.taskB === 'T2') || (c.taskA === 'T2' && c.taskB === 'T1')),
    )).toBe(true);
  });

  it('includes file_conflict edges in TaskGraph.edges', () => {
    const defs: RawTaskDefinition[] = [
      makeDef({ id: 'T1', filesWrite: ['src/shared.ts'] }),
      makeDef({ id: 'T2', filesWrite: ['src/shared.ts'] }),
    ];

    const builder = new GraphBuilder();
    const graph = builder.build(defs);

    const conflictEdges = graph.edges.filter(e => e.type === 'file_conflict');
    expect(conflictEdges.length).toBeGreaterThanOrEqual(1);
  });

  it('parses YAML task definitions matching Section 5.4 schema', () => {
    const yamlPath = resolve(import.meta.dirname, '../../fixtures/sample-task-graph.yaml');
    const content = readFileSync(yamlPath, 'utf-8');
    const parsed = parseYaml(content) as {
      version: string;
      project: { name: string; description: string };
      tasks: RawTaskDefinition[];
    };

    expect(parsed.version).toBe('1.0');
    expect(parsed.project.name).toBe('SaaS CRM MVP');
    expect(parsed.tasks).toHaveLength(4);

    // Ensure tasks can be fed into GraphBuilder
    const builder = new GraphBuilder();
    const graph = builder.build(parsed.tasks);
    expect(graph.nodes.size).toBe(4);
    expect(graph.layers.length).toBe(3); // 3 layers: T1 -> T2,T3 -> T4
  });

  it('rejects invalid YAML task graph with cycles', () => {
    const yamlPath = resolve(import.meta.dirname, '../../fixtures/invalid-task-graph.yaml');
    const content = readFileSync(yamlPath, 'utf-8');
    const parsed = parseYaml(content) as {
      tasks: RawTaskDefinition[];
    };

    const builder = new GraphBuilder();
    expect(() => builder.build(parsed.tasks)).toThrow();
  });
});
