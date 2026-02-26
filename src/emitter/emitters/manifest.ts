/**
 * ManifestEmitter — T11
 *
 * Emits manifest.json: records every file produced by the pipeline,
 * including checksums and artifact type classifications.
 */

import { createHash } from 'node:crypto';
import type { Emitter, EmitterContext } from '../types.js';

/** Artifact type enum for file classification. */
type ArtifactType = 'task_graph' | 'repo_blueprint' | 'mpd' | 'tickets' | 'ai_prompt_pack' | 'manifest';

/** Compute SHA-256 hash of string content. */
function contentHash(content: string | Buffer): string {
  const hash = createHash('sha256');
  if (typeof content === 'string') {
    hash.update(content, 'utf8');
  } else {
    hash.update(content);
  }
  return `sha256:${hash.digest('hex')}`;
}

/** Classify a file path into an artifact type. */
function classifyArtifact(filePath: string): ArtifactType {
  if (filePath === 'task_graph.yaml') return 'task_graph';
  if (filePath === 'repo_blueprint.yaml') return 'repo_blueprint';
  if (filePath === 'MPD.md' || filePath === 'mpd-data.json') return 'mpd';
  if (filePath.startsWith('tickets/')) return 'tickets';
  if (filePath.startsWith('ai_prompt_pack/')) return 'ai_prompt_pack';
  if (filePath === 'manifest.json') return 'manifest';
  // Default to task_graph for unknown files
  return 'task_graph';
}

/** Get size in bytes of string or Buffer content. */
function sizeBytes(content: string | Buffer): number {
  if (typeof content === 'string') {
    return Buffer.byteLength(content, 'utf8');
  }
  return content.byteLength;
}

export class ManifestEmitter implements Emitter {
  readonly name = 'manifest';

  async emit(ctx: EmitterContext): Promise<void> {
    // Snapshot all files currently in VFS (before we add manifest itself)
    const existingFiles = ctx.vfs.listFiles();

    // Build file entries for all existing files
    const fileEntries = existingFiles.map(filePath => {
      const content = ctx.vfs.readFile(filePath);
      if (content === undefined) {
        throw new Error(`ManifestEmitter: file in listFiles() not readable: ${filePath}`);
      }
      return {
        path: filePath,
        checksum: contentHash(content),
        sizeBytes: sizeBytes(content),
        artifactType: classifyArtifact(filePath),
      };
    });

    // Build the manifest object (without the manifest entry itself yet)
    const manifestData = {
      version: '1.0',
      generated: ctx.generatedAt,
      atsfVersion: '1.0.0',
      projectName: ctx.projectName,
      files: fileEntries,
      totalTasks: ctx.totalTasks ?? 0,
      totalCostUsd: ctx.totalCostUsd,
      durationMs: ctx.durationMs,
    };

    // Serialize to JSON (deterministic — JSON.stringify with sorted keys)
    const manifestJson = JSON.stringify(sortObjectKeys(manifestData), null, 2);

    // Add the manifest entry itself
    const manifestEntry = {
      path: 'manifest.json',
      checksum: contentHash(manifestJson),
      sizeBytes: Buffer.byteLength(manifestJson, 'utf8'),
      artifactType: 'manifest' as ArtifactType,
    };

    // Re-create with manifest self-entry
    const manifestDataWithSelf = {
      ...manifestData,
      files: [...fileEntries, manifestEntry],
    };

    const finalJson = JSON.stringify(sortObjectKeys(manifestDataWithSelf), null, 2);
    ctx.vfs.writeFile('manifest.json', finalJson);
  }
}

/** Recursively sort object keys for deterministic JSON output. */
function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    return obj.map(sortObjectKeys);
  }
  if (obj !== null && typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}
