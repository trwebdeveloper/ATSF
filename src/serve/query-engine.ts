/**
 * QueryEngine: BM25 retrieval + optional LLM synthesis.
 *
 * Spec Section 15.5: Query Engine Design.
 *
 * Query Flow:
 *   Question -> Structured field match -> Synonym expansion -> Tokenize
 *   -> [Task scoping] -> BM25 search -> Merge structured matches (boosted)
 *   -> Cross-ref enrichment
 *   -> [rawContext=true: return chunks] | [rawContext=false: LLM synthesis]
 *   -> Response
 */

import { ArtifactIndex } from './index/artifact-index.js';
import type { QueryRequest, QueryResponse } from './schemas.js';

// ─── Types ───────────────────────────────────────────────────────────

export interface QueryEngineOptions {
  readonly index: ArtifactIndex;
  readonly llmEnabled: boolean;
}

export type ConfidenceLevel = 'high' | 'medium' | 'low';

// ─── Confidence Scoring ──────────────────────────────────────────────

/**
 * Determine confidence level based on top BM25 score.
 *
 * Spec Section 15.5 Confidence Scoring:
 *   high:   Top BM25 result score > 10.0
 *   medium: Top BM25 result score 5.0-10.0
 *   low:    Top BM25 result score < 5.0
 */
function scoreToConfidence(topScore: number): ConfidenceLevel {
  if (topScore > 10.0) return 'high';
  if (topScore >= 5.0) return 'medium';
  return 'low';
}

// ─── QueryEngine ─────────────────────────────────────────────────────

export class QueryEngine {
  private _index: ArtifactIndex;
  private _llmEnabled: boolean;

  constructor(options: QueryEngineOptions) {
    this._index = options.index;
    this._llmEnabled = options.llmEnabled;
  }

  /**
   * Execute a query against the artifact index.
   */
  async query(request: QueryRequest): Promise<QueryResponse> {
    const maxChunks = request.maxChunks ?? 5;
    const rawContext = request.rawContext ?? false;

    // Step 1: Structured field matching (boosted above BM25)
    const structuredMatches = this._index.structuredMatch(request.question);

    // Step 2: BM25 search with synonym expansion (handled by BM25Engine)
    let bm25Results = this._index.searchWithScores(request.question, maxChunks + 5);

    // Step 3: Task scoping - filter to specific task if requested
    if (request.taskId) {
      bm25Results = bm25Results.filter((r) =>
        r.chunk.taskIds.includes(request.taskId!),
      );
    }

    // Filter by artifact types if specified
    if (request.artifactTypes && request.artifactTypes.length > 0) {
      bm25Results = bm25Results.filter((r) =>
        request.artifactTypes!.includes(
          r.chunk.source.artifactType as
            | 'task_graph'
            | 'repo_blueprint'
            | 'mpd'
            | 'tickets'
            | 'ai_prompt_pack',
        ),
      );
    }

    // Step 4: Merge structured matches (boosted) with BM25 results
    const seenIds = new Set<number>();
    const mergedResults: Array<{ chunk: typeof bm25Results[0]['chunk']; score: number }> = [];

    // Add structural matches first with a boost
    for (const chunk of structuredMatches) {
      if (!seenIds.has(chunk.id)) {
        seenIds.add(chunk.id);
        mergedResults.push({ chunk, score: 100.0 }); // High boost for structural matches
      }
    }

    // Add BM25 results
    for (const result of bm25Results) {
      if (!seenIds.has(result.chunk.id)) {
        seenIds.add(result.chunk.id);
        mergedResults.push(result);
      }
    }

    // Limit to maxChunks
    const finalResults = mergedResults.slice(0, maxChunks);

    // Determine confidence from top BM25 score (excluding structural boost)
    const topBm25Score =
      bm25Results.length > 0 ? bm25Results[0].score : 0;
    const confidence = scoreToConfidence(topBm25Score);

    // Cross-reference enrichment for related tasks
    const relatedTasks = this._index.crossRef.getRelatedTasksFromChunks(
      finalResults.map((r) => r.chunk),
    );

    // Build chunks for response
    const chunks = finalResults.map((r) => ({
      content: r.chunk.content,
      score: r.score,
      source: {
        file: r.chunk.source.file,
        artifactType: r.chunk.source.artifactType,
        path: r.chunk.source.path,
      },
    }));

    // Build sources (unique source files)
    const sourceSet = new Set<string>();
    const sources = finalResults
      .filter((r) => {
        const key = `${r.chunk.source.file}:${r.chunk.source.artifactType}`;
        if (sourceSet.has(key)) return false;
        sourceSet.add(key);
        return true;
      })
      .map((r) => ({
        file: r.chunk.source.file,
        artifactType: r.chunk.source.artifactType,
        path: r.chunk.source.path,
      }));

    const answerable = finalResults.length > 0 && confidence !== 'low';

    // Step 5: Generate answer
    let answer: string;
    let llmUsed = false;

    if (rawContext || !this._llmEnabled) {
      // Return raw context - concatenate chunk contents
      answer = finalResults.length > 0
        ? finalResults.map((r) => r.chunk.content).join('\n\n---\n\n')
        : 'No relevant context found for your question.';
    } else {
      // LLM synthesis would go here.
      // For now, assemble a structured answer from chunks.
      llmUsed = false;
      answer = this._synthesizeAnswer(request.question, finalResults);
    }

    // Build escalation if not answerable
    const escalation = !answerable
      ? {
          issueId: `ESC-${Date.now().toString(36)}`,
          category: 'missing_detail' as const,
          suggestedActions: [
            'Rephrase the question with more specific terms',
            'Specify a task ID to scope the search',
          ],
          blockedTaskIds: [] as string[],
        }
      : undefined;

    return {
      answer,
      confidence,
      answerable,
      escalation,
      sources,
      chunks,
      relatedTasks,
      llmUsed,
    };
  }

  /**
   * Synthesize an answer from retrieved chunks without LLM.
   */
  private _synthesizeAnswer(
    question: string,
    results: Array<{ chunk: { content: string; source: { file: string } }; score: number }>,
  ): string {
    if (results.length === 0) {
      return 'No relevant context found for your question.';
    }

    const topResult = results[0];
    const sourceInfo = results
      .slice(0, 3)
      .map((r) => r.chunk.source.file)
      .join(', ');

    // Truncate content if too long
    const content = topResult.chunk.content.length > 2000
      ? topResult.chunk.content.slice(0, 2000) + '...'
      : topResult.chunk.content;

    return `Based on ${sourceInfo}:\n\n${content}`;
  }

  get index(): ArtifactIndex {
    return this._index;
  }

  get llmEnabled(): boolean {
    return this._llmEnabled;
  }
}
