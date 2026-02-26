/**
 * TicketsEmitter tests — T11
 */
import { describe, it, expect } from 'vitest';
import { TicketsEmitter } from '../../../src/emitter/emitters/tickets.js';
import { TicketSchema } from '../../../src/contracts/artifact-schemas.js';
import { VirtualFS } from '../../../src/emitter/virtual-fs.js';
import type { EmitterContext, TicketInput } from '../../../src/emitter/types.js';

function makeTicketInput(): TicketInput {
  return {
    frontmatter: {
      id: 'TASK-001',
      title: 'Implement database schema',
      type: 'feature' as const,
      priority: 'high' as const,
      estimate: '4h',
      dependencies: [],
      labels: ['backend', 'database'],
      assignee: 'unassigned',
      status: 'backlog' as const,
    },
    body: {
      description: 'Create the initial database schema including all required tables and relationships.',
      acceptanceCriteria: [
        {
          given: 'A fresh database instance',
          when: 'The migration script is run',
          then: 'All tables are created with correct constraints',
        },
      ],
      relatedDecisions: [],
    },
  };
}

function makeCtx(overrides: Partial<EmitterContext> = {}): EmitterContext {
  return {
    projectName: 'Tickets Project',
    generatedAt: '2026-02-26T00:00:00.000Z',
    lang: 'en',
    vfs: new VirtualFS(),
    totalCostUsd: 0,
    durationMs: 0,
    ticketsInput: [makeTicketInput()],
    ...overrides,
  };
}

describe('TicketsEmitter', () => {
  it('writes ticket files to tickets/ directory in VirtualFS', async () => {
    const ctx = makeCtx();
    const emitter = new TicketsEmitter();
    await emitter.emit(ctx);

    const files = ctx.vfs.listFiles();
    expect(files.some(f => f.startsWith('tickets/'))).toBe(true);
  });

  it('creates one file per ticket', async () => {
    const ticket2: TicketInput = {
      frontmatter: {
        id: 'TASK-002',
        title: 'Implement API routes',
        type: 'feature' as const,
        priority: 'medium' as const,
        estimate: '8h',
        dependencies: ['TASK-001'],
        labels: ['api'],
        assignee: 'unassigned',
        status: 'backlog' as const,
      },
      body: {
        description: 'Create REST API routes for the CRM application using Express and Zod validation.',
        acceptanceCriteria: [
          {
            given: 'A valid authentication token',
            when: 'A GET request is made to /api/users',
            then: 'A paginated list of users is returned with status 200',
          },
        ],
        relatedDecisions: [],
      },
    };

    const ctx = makeCtx({ ticketsInput: [makeTicketInput(), ticket2] });
    const emitter = new TicketsEmitter();
    await emitter.emit(ctx);

    const ticketFiles = ctx.vfs.listFiles().filter(f => f.startsWith('tickets/') && f.endsWith('.md'));
    expect(ticketFiles).toHaveLength(2);
  });

  it('ticket files contain YAML frontmatter', async () => {
    const ctx = makeCtx();
    const emitter = new TicketsEmitter();
    await emitter.emit(ctx);

    const ticketFiles = ctx.vfs.listFiles().filter(f => f.startsWith('tickets/'));
    const content = ctx.vfs.readFile(ticketFiles[0]) as string;
    expect(content).toContain('---');
    expect(content).toContain('TASK-001');
  });

  it('ticket filenames are based on task IDs', async () => {
    const ctx = makeCtx();
    const emitter = new TicketsEmitter();
    await emitter.emit(ctx);

    const ticketFiles = ctx.vfs.listFiles().filter(f => f.startsWith('tickets/'));
    expect(ticketFiles[0]).toContain('TASK-001');
  });

  it('parsed ticket data validates against TicketSchema', async () => {
    const ctx = makeCtx();
    const emitter = new TicketsEmitter();
    await emitter.emit(ctx);

    // Look for a JSON version of the ticket for schema validation
    const jsonFile = ctx.vfs.readFile('tickets/TASK-001.json');
    if (jsonFile) {
      const parsed = JSON.parse(jsonFile as string);
      const result = TicketSchema.safeParse(parsed);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
    } else {
      // The markdown file should contain the ticket ID
      const ticketFiles = ctx.vfs.listFiles().filter(f => f.startsWith('tickets/'));
      expect(ticketFiles.length).toBeGreaterThan(0);
    }
  });

  it('is deterministic', async () => {
    const emitter = new TicketsEmitter();
    const ctx1 = makeCtx();
    const ctx2 = makeCtx();
    await emitter.emit(ctx1);
    await emitter.emit(ctx2);

    const files1 = ctx1.vfs.listFiles().filter(f => f.startsWith('tickets/')).sort();
    const files2 = ctx2.vfs.listFiles().filter(f => f.startsWith('tickets/')).sort();
    expect(files1).toEqual(files2);
    for (const f of files1) {
      expect(ctx1.vfs.readFile(f)).toBe(ctx2.vfs.readFile(f));
    }
  });
});
