declare module 'wink-bm25-text-search' {
  interface BM25Config {
    fldWeights: Record<string, number>;
  }

  interface BM25Instance {
    defineConfig(config: BM25Config): void;
    definePrepTasks(tasks: Array<(text: string) => string[]>, field?: string): void;
    addDoc(doc: Record<string, string>, id: number): void;
    consolidate(): void;
    search(text: string, limit?: number): Array<[number, number]>;
    reset(): void;
    exportJSON(): string;
    importJSON(json: string): boolean;
  }

  function BM25(): BM25Instance;
  export default BM25;
}
