/**
 * `atsf gate list` command — T15
 *
 * List all available quality gates.
 *
 * Source: Section 3.3 (atsf gate subcommands); Section 7 (Quality Gates).
 */

import { Command, Flags } from '@oclif/core';
import { GateRegistry } from '../../../gates/registry.js';

/**
 * Core gate list logic, extracted for testability.
 */
export function runGateListLogic(options: {
  format?: string;
  log: (msg: string) => void;
}): { gates: Array<{ id: string; priority: number }> } {
  const { format, log } = options;

  const registry = new GateRegistry();
  const gates = registry.getAll();

  const gateList = gates.map(g => ({
    id: g.id,
    priority: g.priority,
  }));

  if (format === 'json') {
    log(JSON.stringify(gateList, null, 2));
  } else {
    log('Available quality gates:');
    log('');
    log('  ID               Priority');
    log('  ---------------  --------');
    for (const gate of gateList) {
      const id = gate.id.padEnd(15);
      log(`  ${id}  ${gate.priority}`);
    }
    log('');
    log(`Total: ${gateList.length} gates`);
  }

  return { gates: gateList };
}

export default class GateList extends Command {
  static override description = 'List all available quality gates';

  static override examples = [
    '<%= config.bin %> gate list',
    '<%= config.bin %> gate list --format json',
  ];

  static override flags = {
    format: Flags.string({
      char: 'f',
      description: 'Output format',
      options: ['table', 'json'],
      default: 'table',
    }),
  };

  public async run(): Promise<void> {
    const { flags } = await this.parse(GateList);

    runGateListLogic({
      format: flags.format,
      log: (msg) => this.log(msg),
    });
  }
}
