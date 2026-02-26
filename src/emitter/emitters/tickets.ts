/**
 * TicketsEmitter — T11
 *
 * Emits individual developer tickets as YAML frontmatter + Markdown files.
 * Each ticket is written to tickets/{taskId}.md
 * Also writes tickets/{taskId}.json for structured validation.
 */

import { stringify } from 'yaml';
import type { Emitter, EmitterContext, TicketInput } from '../types.js';

/** Render a ticket as YAML frontmatter + Markdown body. */
function renderTicket(ticket: TicketInput): string {
  const { frontmatter, body } = ticket;

  // Serialize frontmatter as YAML (deterministic, sorted keys)
  const fm = stringify({
    assignee: frontmatter.assignee,
    dependencies: frontmatter.dependencies,
    estimate: frontmatter.estimate,
    id: frontmatter.id,
    labels: frontmatter.labels,
    priority: frontmatter.priority,
    status: frontmatter.status,
    title: frontmatter.title,
    type: frontmatter.type,
  }, {
    sortMapEntries: true,
    lineWidth: 120,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  }).trimEnd();

  const lines: string[] = [
    '---',
    fm,
    '---',
    '',
    `## Description`,
    '',
    body.description,
    '',
    `## Acceptance Criteria`,
    '',
    ...body.acceptanceCriteria.flatMap(ac => [
      `- **Given** ${ac.given}`,
      `  **When** ${ac.when}`,
      `  **Then** ${ac.then}`,
      '',
    ]),
  ];

  if (body.technicalNotes) {
    lines.push(`## Technical Notes`, '', body.technicalNotes, '');
  }

  if (body.relatedDecisions.length > 0) {
    lines.push(`## Related Decisions`, '', ...body.relatedDecisions.map(d => `- ${d}`), '');
  }

  return lines.join('\n');
}

export class TicketsEmitter implements Emitter {
  readonly name = 'tickets';

  async emit(ctx: EmitterContext): Promise<void> {
    const tickets = ctx.ticketsInput ?? [];

    for (const ticket of tickets) {
      const taskId = ticket.frontmatter.id;
      const mdPath = `tickets/${taskId}.md`;
      const jsonPath = `tickets/${taskId}.json`;

      ctx.vfs.writeFile(mdPath, renderTicket(ticket));
      ctx.vfs.writeFile(jsonPath, JSON.stringify(ticket, null, 2));
    }
  }
}
