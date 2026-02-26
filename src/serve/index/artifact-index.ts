/**
 * ArtifactIndex: loads all ATSF artifacts on startup and builds
 * an in-memory BM25 index using wink-bm25-text-search.
 *
 * Spec Section 15.5: Indexing Strategy.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { BM25Engine } from './bm25-engine.js';
import { CrossRefResolver } from './cross-ref.js';
import type { IndexedChunk } from '../schemas.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface ArtifactIndexOptions {
  readonly outputDir: string;
}

export interface LoadedArtifacts {
  readonly taskGraph: unknown | null;
  readonly repoBlueprint: unknown | null;
  readonly mpd: string | null;
  readonly tickets: Map<string, string>;
  readonly aiPromptPack: Map<string, string>;
  readonly manifest: unknown | null;
}

// ─── ArtifactIndex ───────────────────────────────────────────────────

export class ArtifactIndex {
  private _bm25: BM25Engine;
  private _crossRef: CrossRefResolver;
  private _chunks: Map<number, IndexedChunk>;
  private _artifacts: LoadedArtifacts;
  private _outputDir: string;

  constructor(outputDir: string) {
    this._bm25 = new BM25Engine();
    this._crossRef = new CrossRefResolver();
    this._chunks = new Map();
    this._outputDir = outputDir;
    this._artifacts = {
      taskGraph: null,
      repoBlueprint: null,
      mpd: null,
      tickets: new Map(),
      aiPromptPack: new Map(),
      manifest: null,
    };
  }

  /**
   * Load artifacts from the output directory and build the search index.
   */
  async load(): Promise<void> {
    await this._loadManifest();
    await this._loadTaskGraph();
    await this._loadRepoBlueprint();
    await this._loadMpd();
    await this._loadTickets();
    await this._loadAiPromptPack();

    this._bm25.consolidate();
  }

  /**
   * Search the index for relevant chunks.
   */
  search(query: string, limit?: number): IndexedChunk[] {
    const results = this._bm25.search(query, limit);
    return results
      .map((r) => this._chunks.get(r.id) ?? null)
      .filter((c): c is IndexedChunk => c !== null);
  }

  /**
   * Search and return chunks with BM25 scores.
   */
  searchWithScores(
    query: string,
    limit?: number,
  ): Array<{ chunk: IndexedChunk; score: number }> {
    const results = this._bm25.search(query, limit);
    return results
      .map((r) => {
        const chunk = this._chunks.get(r.id);
        if (!chunk) return null;
        return { chunk, score: r.score };
      })
      .filter(
        (c): c is { chunk: IndexedChunk; score: number } => c !== null,
      );
  }

  /**
   * Structured field matching: check query against task IDs, file paths, etc.
   */
  structuredMatch(query: string): IndexedChunk[] {
    const matches: IndexedChunk[] = [];
    const upperQuery = query.toUpperCase();

    // Match task IDs (TASK-001 style)
    const taskIdMatch = upperQuery.match(/TASK-\d{3,}/g);
    if (taskIdMatch) {
      for (const chunk of this._chunks.values()) {
        for (const tid of chunk.taskIds) {
          if (taskIdMatch.includes(tid.toUpperCase())) {
            matches.push(chunk);
            break;
          }
        }
      }
    }

    // Match file paths
    const queryLower = query.toLowerCase();
    for (const chunk of this._chunks.values()) {
      if (
        chunk.source.path &&
        chunk.source.path.toLowerCase().includes(queryLower)
      ) {
        if (!matches.includes(chunk)) {
          matches.push(chunk);
        }
      }
    }

    return matches;
  }

  get bm25(): BM25Engine {
    return this._bm25;
  }

  get crossRef(): CrossRefResolver {
    return this._crossRef;
  }

  get artifacts(): LoadedArtifacts {
    return this._artifacts;
  }

  get chunksCount(): number {
    return this._chunks.size;
  }

  get outputDir(): string {
    return this._outputDir;
  }

  // ─── Private loading methods ─────────────────────────────────────

  private async _loadManifest(): Promise<void> {
    try {
      const content = await readFile(
        join(this._outputDir, 'manifest.json'),
        'utf-8',
      );
      (this._artifacts as { manifest: unknown }).manifest = JSON.parse(content);
    } catch {
      // No manifest is fine
    }
  }

  private async _loadTaskGraph(): Promise<void> {
    try {
      const content = await readFile(
        join(this._outputDir, 'task_graph.yaml'),
        'utf-8',
      );
      (this._artifacts as { taskGraph: unknown }).taskGraph = content;

      // Parse YAML tasks for chunking
      // Simple line-based parsing for task entries
      const taskBlocks = this._splitYamlTasks(content);
      for (const block of taskBlocks) {
        const id = this._addChunk(block.content, {
          file: 'task_graph.yaml',
          artifactType: 'task_graph',
          path: block.taskId,
        }, block.taskId ? [block.taskId] : []);

        // Register cross-references
        if (block.taskId) {
          this._crossRef.addTask({
            taskId: block.taskId,
            filesWrite: block.filesWrite,
            filesRead: block.filesRead,
            dependsOn: block.dependsOn,
          });
        }

        void id;
      }
    } catch {
      // No task graph
    }
  }

  private async _loadRepoBlueprint(): Promise<void> {
    try {
      const content = await readFile(
        join(this._outputDir, 'repo_blueprint.yaml'),
        'utf-8',
      );
      (this._artifacts as { repoBlueprint: unknown }).repoBlueprint = content;

      // Chunk by file entries
      const lines = content.split('\n');
      let currentChunk = '';
      let currentPath = '';

      for (const line of lines) {
        const pathMatch = line.match(/^\s*-?\s*path:\s*(.+)/);
        if (pathMatch && currentChunk) {
          this._addChunk(currentChunk, {
            file: 'repo_blueprint.yaml',
            artifactType: 'repo_blueprint',
            path: currentPath,
          }, []);
          currentChunk = '';
        }
        if (pathMatch) {
          currentPath = pathMatch[1].trim().replace(/['"]/g, '');
        }
        currentChunk += line + '\n';
      }
      if (currentChunk.trim()) {
        this._addChunk(currentChunk, {
          file: 'repo_blueprint.yaml',
          artifactType: 'repo_blueprint',
          path: currentPath,
        }, []);
      }
    } catch {
      // No blueprint
    }
  }

  private async _loadMpd(): Promise<void> {
    try {
      const content = await readFile(
        join(this._outputDir, 'MPD.md'),
        'utf-8',
      );
      (this._artifacts as { mpd: string | null }).mpd = content;

      // Chunk by H2 sections
      const sections = content.split(/^## /m);
      for (const section of sections) {
        if (!section.trim()) continue;
        const firstNewline = section.indexOf('\n');
        const title = firstNewline >= 0 ? section.slice(0, firstNewline).trim() : section.trim();
        this._addChunk(`## ${section}`, {
          file: 'MPD.md',
          artifactType: 'mpd',
          path: title,
        }, []);
      }
    } catch {
      // No MPD
    }
  }

  private async _loadTickets(): Promise<void> {
    try {
      const ticketsDir = join(this._outputDir, 'tickets');
      const files = await readdir(ticketsDir);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const content = await readFile(join(ticketsDir, file), 'utf-8');
        (this._artifacts as { tickets: Map<string, string> }).tickets.set(
          file,
          content,
        );

        // Extract task ID from filename or content
        const taskIdMatch = file.match(/TASK-\d{3,}/) ?? content.match(/TASK-\d{3,}/);
        const taskId = taskIdMatch ? taskIdMatch[0] : undefined;

        this._addChunk(content, {
          file: `tickets/${file}`,
          artifactType: 'tickets',
          path: basename(file, '.md'),
        }, taskId ? [taskId] : []);
      }
    } catch {
      // No tickets directory
    }
  }

  private async _loadAiPromptPack(): Promise<void> {
    try {
      const promptDir = join(this._outputDir, 'ai_prompt_pack');
      const files = await readdir(promptDir);

      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const content = await readFile(join(promptDir, file), 'utf-8');
        (this._artifacts as { aiPromptPack: Map<string, string> }).aiPromptPack.set(
          file,
          content,
        );

        // Extract task ID from filename or content
        const taskIdMatch = file.match(/TASK-\d{3,}/) ?? content.match(/TASK-\d{3,}/);
        const taskId = taskIdMatch ? taskIdMatch[0] : undefined;

        // Chunk by sections
        const sections = content.split(/^## /m);
        for (const section of sections) {
          if (!section.trim()) continue;
          const firstNewline = section.indexOf('\n');
          const sectionTitle = firstNewline >= 0 ? section.slice(0, firstNewline).trim() : section.trim();
          this._addChunk(`## ${section}`, {
            file: `ai_prompt_pack/${file}`,
            artifactType: 'ai_prompt_pack',
            path: sectionTitle,
          }, taskId ? [taskId] : []);
        }
      }
    } catch {
      // No prompt pack directory
    }
  }

  private _addChunk(
    content: string,
    source: { file: string; artifactType: string; path?: string },
    taskIds: string[],
  ): number {
    const id = this._bm25.addDocument(content);
    this._chunks.set(id, { id, content, source, taskIds });
    return id;
  }

  private _splitYamlTasks(
    content: string,
  ): Array<{
    content: string;
    taskId: string | undefined;
    filesWrite: string[];
    filesRead: string[];
    dependsOn: string[];
  }> {
    const blocks: Array<{
      content: string;
      taskId: string | undefined;
      filesWrite: string[];
      filesRead: string[];
      dependsOn: string[];
    }> = [];

    // Split on task entries (lines starting with "  - id:" or "- id:")
    const taskParts = content.split(/^(\s*-\s*id:\s*)/m);

    for (let i = 1; i < taskParts.length; i += 2) {
      const prefix = taskParts[i];
      const body = taskParts[i + 1] ?? '';
      const blockContent = prefix + body;

      const idMatch = blockContent.match(/id:\s*['"]?(TASK-\d{3,})['"]?/);
      const taskId = idMatch ? idMatch[1] : undefined;

      // Extract filesWrite
      const filesWrite: string[] = [];
      const fwMatch = blockContent.match(/filesWrite:\s*\n((?:\s+-\s+.+\n?)*)/);
      if (fwMatch) {
        const fwLines = fwMatch[1].match(/-\s+(.+)/g);
        if (fwLines) {
          for (const line of fwLines) {
            const m = line.match(/-\s+(.+)/);
            if (m) filesWrite.push(m[1].trim().replace(/['"]/g, ''));
          }
        }
      }

      // Extract filesRead
      const filesRead: string[] = [];
      const frMatch = blockContent.match(/filesRead:\s*\n((?:\s+-\s+.+\n?)*)/);
      if (frMatch) {
        const frLines = frMatch[1].match(/-\s+(.+)/g);
        if (frLines) {
          for (const line of frLines) {
            const m = line.match(/-\s+(.+)/);
            if (m) filesRead.push(m[1].trim().replace(/['"]/g, ''));
          }
        }
      }

      // Extract dependsOn
      const dependsOn: string[] = [];
      const depMatch = blockContent.match(
        /dependsOn:\s*\n((?:\s+-\s+.+\n?)*)/,
      );
      if (depMatch) {
        const depLines = depMatch[1].match(/-\s+(.+)/g);
        if (depLines) {
          for (const line of depLines) {
            const m = line.match(/-\s+(.+)/);
            if (m) dependsOn.push(m[1].trim().replace(/['"]/g, ''));
          }
        }
      }

      blocks.push({
        content: blockContent,
        taskId,
        filesWrite,
        filesRead,
        dependsOn,
      });
    }

    // If no task blocks found, add the entire content as one chunk
    if (blocks.length === 0 && content.trim()) {
      blocks.push({
        content,
        taskId: undefined,
        filesWrite: [],
        filesRead: [],
        dependsOn: [],
      });
    }

    return blocks;
  }
}
