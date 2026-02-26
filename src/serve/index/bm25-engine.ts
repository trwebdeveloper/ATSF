/**
 * BM25 search engine wrapper around wink-bm25-text-search.
 *
 * Provides document indexing, search with scored results, and
 * handles the minimum-3-document requirement with sentinel padding.
 */

import BM25 from 'wink-bm25-text-search';

// ─── Types ───────────────────────────────────────────────────────────

export interface BM25Document {
  readonly id: number;
  readonly text: string;
  readonly metadata?: Record<string, unknown>;
}

export interface BM25SearchResult {
  readonly id: number;
  readonly score: number;
}

// ─── Tokenizer ───────────────────────────────────────────────────────

/**
 * Simple tokenizer for BM25: lowercases text, splits on non-word characters,
 * and filters out empty tokens.
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\W+/)
    .filter((t) => t.length > 0);
}

// ─── Synonym Map ─────────────────────────────────────────────────────

const SYNONYM_MAP: ReadonlyMap<string, string[]> = new Map([
  ['database', ['db']],
  ['db', ['database']],
  ['authentication', ['auth']],
  ['auth', ['authentication']],
  ['configuration', ['config']],
  ['config', ['configuration']],
  ['repository', ['repo']],
  ['repo', ['repository']],
  ['dependency', ['dep', 'deps']],
  ['dependencies', ['deps']],
  ['environment', ['env']],
  ['env', ['environment']],
  ['application', ['app']],
  ['app', ['application']],
  ['implementation', ['impl']],
  ['impl', ['implementation']],
  ['function', ['func', 'fn']],
  ['func', ['function']],
  ['fn', ['function']],
  ['parameter', ['param', 'params']],
  ['param', ['parameter']],
  ['params', ['parameters']],
  ['specification', ['spec']],
  ['spec', ['specification']],
  ['directory', ['dir']],
  ['dir', ['directory']],
  ['document', ['doc']],
  ['doc', ['document']],
  ['template', ['tmpl']],
  ['tmpl', ['template']],
  ['message', ['msg']],
  ['msg', ['message']],
  ['request', ['req']],
  ['req', ['request']],
  ['response', ['res', 'resp']],
  ['res', ['response']],
  ['resp', ['response']],
  ['development', ['dev']],
  ['dev', ['development']],
  ['production', ['prod']],
  ['prod', ['production']],
  ['testing', ['test']],
  ['validation', ['validate']],
  ['validate', ['validation']],
  ['error', ['err']],
  ['err', ['error']],
  ['information', ['info']],
  ['info', ['information']],
]);

/**
 * Expand query terms with synonyms from the synonym map.
 */
export function expandSynonyms(query: string): string {
  const tokens = tokenize(query);
  const expanded = new Set(tokens);

  for (const token of tokens) {
    const synonyms = SYNONYM_MAP.get(token);
    if (synonyms) {
      for (const syn of synonyms) {
        expanded.add(syn);
      }
    }
  }

  return [...expanded].join(' ');
}

// ─── BM25Engine ──────────────────────────────────────────────────────

const SENTINEL_PREFIX = 'xyzsentinelxyz';

export class BM25Engine {
  private _engine: ReturnType<typeof BM25>;
  private _documents: Map<number, BM25Document>;
  private _consolidated: boolean;
  private _nextId: number;

  constructor() {
    this._engine = BM25();
    this._engine.defineConfig({ fldWeights: { text: 1 } });
    this._engine.definePrepTasks([tokenize]);
    this._documents = new Map();
    this._consolidated = false;
    this._nextId = 0;
  }

  /**
   * Add a document to the index. Returns the assigned document ID.
   */
  addDocument(text: string, metadata?: Record<string, unknown>): number {
    if (this._consolidated) {
      throw new Error('Cannot add documents after consolidation');
    }

    const id = this._nextId++;
    this._documents.set(id, { id, text, metadata });
    this._engine.addDoc({ text }, id);
    return id;
  }

  /**
   * Get a document by ID.
   */
  getDocument(id: number): BM25Document | undefined {
    return this._documents.get(id);
  }

  /**
   * Consolidate the index. Must be called before searching.
   * Adds sentinel documents if fewer than 3 docs exist (BM25 requirement).
   */
  consolidate(): void {
    if (this._consolidated) return;

    // BM25 requires at least 3 documents for consolidation
    const docsNeeded = Math.max(3, this._documents.size);
    for (let i = this._documents.size; i < docsNeeded; i++) {
      const sentinelId = this._nextId++;
      this._engine.addDoc({ text: `${SENTINEL_PREFIX}${i}pad` }, sentinelId);
    }

    this._engine.consolidate();
    this._consolidated = true;
  }

  /**
   * Search the index. Returns results sorted by descending score.
   * Only returns real documents (not sentinel padding).
   */
  search(query: string, limit?: number): BM25SearchResult[] {
    if (!this._consolidated) {
      this.consolidate();
    }

    // Expand query with synonyms
    const expandedQuery = expandSynonyms(query);
    const rawResults: Array<[string | number, number]> = this._engine.search(
      expandedQuery,
      limit ?? 20,
    );

    // Filter out sentinel docs and return only real documents
    // Note: wink-bm25-text-search returns IDs as strings
    return rawResults
      .map(([rawId, score]) => ({ id: Number(rawId), score }))
      .filter(({ id }) => this._documents.has(id));
  }

  /**
   * Total number of real (non-sentinel) documents in the index.
   */
  get size(): number {
    return this._documents.size;
  }

  /**
   * Whether the index has been consolidated and is ready for search.
   */
  get isConsolidated(): boolean {
    return this._consolidated;
  }

  /**
   * Reset the engine, removing all documents.
   */
  reset(): void {
    this._engine = BM25();
    this._engine.defineConfig({ fldWeights: { text: 1 } });
    this._engine.definePrepTasks([tokenize]);
    this._documents = new Map();
    this._consolidated = false;
    this._nextId = 0;
  }
}
