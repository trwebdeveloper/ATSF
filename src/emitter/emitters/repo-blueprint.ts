/**
 * RepoBlueprintEmitter — T11
 *
 * Emits repo_blueprint.yaml: directory structure and file listing for the target repository.
 */

import { createHash } from 'node:crypto';
import { stringify } from 'yaml';
import type { Emitter, EmitterContext } from '../types.js';

function contentHash(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

function toYaml(data: unknown): string {
  return stringify(data, {
    sortMapEntries: true,
    lineWidth: 120,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  });
}

export class RepoBlueprintEmitter implements Emitter {
  readonly name = 'repo-blueprint';

  async emit(ctx: EmitterContext): Promise<void> {
    const input = ctx.repoBlueprintInput ?? {
      projectName: ctx.projectName,
      root: [],
    };

    // Build artifact (compute checksum from data content)
    const dataForHash = { projectName: input.projectName, root: input.root };
    const yamlForHash = toYaml(dataForHash);

    const artifact = {
      version: '1.0',
      generated: ctx.generatedAt,
      checksum: contentHash(yamlForHash),
      projectName: input.projectName,
      root: input.root,
    };

    const yamlOutput = toYaml(artifact);
    ctx.vfs.writeFile('repo_blueprint.yaml', yamlOutput);
  }
}
