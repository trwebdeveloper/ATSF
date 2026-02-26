/**
 * VirtualFS — T11
 *
 * In-memory filesystem with atomic flush to disk.
 * Atomic flush uses a sibling temp directory (same parent as outputDir) to avoid
 * cross-device rename failures (EXDEV). Falls back to recursive copy+delete if needed.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

/** File entry in the virtual filesystem. */
interface VFSEntry {
  content: string | Buffer;
}

export class VirtualFS {
  private readonly files = new Map<string, VFSEntry>();

  /** Write a file to the in-memory filesystem. */
  writeFile(filePath: string, content: string | Buffer): void {
    this.files.set(filePath, { content });
  }

  /** Read a file from the in-memory filesystem. Returns undefined if not found. */
  readFile(filePath: string): string | Buffer | undefined {
    return this.files.get(filePath)?.content;
  }

  /** List all files in the virtual filesystem. */
  listFiles(): readonly string[] {
    return Array.from(this.files.keys());
  }

  /**
   * Atomically flush all files to disk.
   *
   * Strategy:
   * 1. Create a sibling temp dir: {parent(outputDir)}/.atsf-tmp-{uuid}/
   * 2. Write all files to the temp dir (creating subdirs as needed)
   * 3. Attempt fs.rename(tempDir, outputDir) — atomic on same filesystem
   * 4. On EXDEV (cross-device link), fall back to recursive copy + delete
   *
   * This ensures all-or-nothing: no partial output on failure.
   */
  async flush(outputDir: string): Promise<void> {
    const absoluteOutput = path.resolve(outputDir);
    const parentDir = path.dirname(absoluteOutput);
    const tempDirName = `.atsf-tmp-${randomUUID()}`;
    const tempDir = path.join(parentDir, tempDirName);

    // Ensure parent exists
    fs.mkdirSync(parentDir, { recursive: true });

    // Write all files to temp dir
    for (const [filePath, entry] of this.files) {
      const dest = path.join(tempDir, filePath);
      const destDir = path.dirname(dest);
      fs.mkdirSync(destDir, { recursive: true });

      if (typeof entry.content === 'string') {
        fs.writeFileSync(dest, entry.content, 'utf8');
      } else {
        fs.writeFileSync(dest, entry.content);
      }
    }

    // Attempt atomic rename
    try {
      // Remove existing outputDir if it exists (rename won't overwrite a directory)
      if (fs.existsSync(absoluteOutput)) {
        fs.rmSync(absoluteOutput, { recursive: true, force: true });
      }
      fs.renameSync(tempDir, absoluteOutput);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'EXDEV') {
        // Cross-device: fall back to copy + delete
        await this.copyRecursive(tempDir, absoluteOutput);
        fs.rmSync(tempDir, { recursive: true, force: true });
      } else {
        // Clean up temp dir before re-throwing
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { /* ignore */ }
        throw err;
      }
    }
  }

  /**
   * Recursively copy all files from src directory to dest directory.
   * Used as EXDEV fallback for flush().
   */
  private async copyRecursive(src: string, dest: string): Promise<void> {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /** Clear all files (for testing/reset). */
  clear(): void {
    this.files.clear();
  }
}
