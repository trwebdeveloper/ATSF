/**
 * TicketsEmitter — T11
 *
 * Emits individual developer tickets as YAML frontmatter + Markdown files.
 * Each ticket is written to tickets/{taskId}.md
 * Also writes tickets/{taskId}.json for structured validation.
 */

import { stringify } from 'yaml';
import type { Emitter, EmitterContext, TicketInput } from '../types.js';
import { getStrings } from '../i18n.js';

/** Render a ticket as YAML frontmatter + Markdown body. */
function renderTicket(ticket: TicketInput, lang: string): string {
  const s = getStrings(lang);
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
    `## ${s.description}`,
    '',
    body.description,
    '',
    `## ${s.acceptanceCriteria}`,
    '',
    ...body.acceptanceCriteria.flatMap(ac => [
      `- **${s.given}** ${ac.given}`,
      `  **${s.when}** ${ac.when}`,
      `  **${s.then}** ${ac.then}`,
      '',
    ]),
  ];

  if (body.technicalNotes) {
    lines.push(`## ${s.technicalNotes}`, '', body.technicalNotes, '');
  }

  if (body.relatedDecisions.length > 0) {
    lines.push(`## ${s.relatedDecisions}`, '', ...body.relatedDecisions.map(d => `- ${d}`), '');
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

      ctx.vfs.writeFile(mdPath, renderTicket(ticket, ctx.lang));
      ctx.vfs.writeFile(jsonPath, JSON.stringify(ticket, null, 2));
    }
  }
}
