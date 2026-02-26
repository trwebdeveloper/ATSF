/**
 * Normalize a file path to POSIX-style forward slashes and lowercase.
 * Applied at system boundaries: GraphBuilder input, ConflictDetector, FileLockManager.
 *
 * Replaces both backslashes and native path separators with forward slashes,
 * and lowercases for case-insensitive comparison (conservative on Linux,
 * correct on macOS/Windows).
 *
 * @param p - The path to normalize
 * @returns The normalized path (forward slashes, lowercase)
 */
export function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}
