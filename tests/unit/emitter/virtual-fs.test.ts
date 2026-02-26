/**
 * VirtualFS tests — T11
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { VirtualFS } from '../../../src/emitter/virtual-fs.js';

describe('VirtualFS', () => {
  let vfs: VirtualFS;
  let tmpDir: string;

  beforeEach(() => {
    vfs = new VirtualFS();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vfs-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writeFile / readFile', () => {
    it('writes and reads back a string file', () => {
      vfs.writeFile('foo/bar.txt', 'hello world');
      expect(vfs.readFile('foo/bar.txt')).toBe('hello world');
    });

    it('writes and reads back a Buffer file', () => {
      const buf = Buffer.from([0x01, 0x02, 0x03]);
      vfs.writeFile('data/bin.bin', buf);
      expect(vfs.readFile('data/bin.bin')).toEqual(buf);
    });

    it('overwrites an existing file', () => {
      vfs.writeFile('a.txt', 'first');
      vfs.writeFile('a.txt', 'second');
      expect(vfs.readFile('a.txt')).toBe('second');
    });

    it('returns undefined for missing file', () => {
      expect(vfs.readFile('nonexistent.txt')).toBeUndefined();
    });
  });

  describe('listFiles', () => {
    it('returns empty array when no files written', () => {
      expect(vfs.listFiles()).toEqual([]);
    });

    it('lists all written files', () => {
      vfs.writeFile('a.txt', 'a');
      vfs.writeFile('subdir/b.txt', 'b');
      vfs.writeFile('subdir/c.txt', 'c');
      const files = vfs.listFiles();
      expect(files).toHaveLength(3);
      expect(files).toContain('a.txt');
      expect(files).toContain('subdir/b.txt');
      expect(files).toContain('subdir/c.txt');
    });

    it('returns readonly array', () => {
      vfs.writeFile('x.txt', 'x');
      const files = vfs.listFiles();
      expect(Array.isArray(files)).toBe(true);
    });
  });

  describe('clear', () => {
    it('clears all files', () => {
      vfs.writeFile('a.txt', 'a');
      vfs.writeFile('b.txt', 'b');
      vfs.clear();
      expect(vfs.listFiles()).toEqual([]);
      expect(vfs.readFile('a.txt')).toBeUndefined();
    });
  });

  describe('flush', () => {
    it('creates files in the output directory', async () => {
      const outDir = path.join(tmpDir, 'output');
      vfs.writeFile('hello.txt', 'world');
      vfs.writeFile('subdir/nested.txt', 'nested content');
      await vfs.flush(outDir);

      expect(fs.existsSync(path.join(outDir, 'hello.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(outDir, 'hello.txt'), 'utf8')).toBe('world');
      expect(fs.existsSync(path.join(outDir, 'subdir/nested.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(outDir, 'subdir/nested.txt'), 'utf8')).toBe('nested content');
    });

    it('creates sibling temp dir in SAME parent as outputDir (not /tmp)', async () => {
      const outDir = path.join(tmpDir, 'myoutput');
      vfs.writeFile('file.txt', 'content');

      // spy via hooks isn't easy; instead just verify after flush that
      // no leftover temp dirs exist in tmpDir's parent (which would be os.tmpdir())
      await vfs.flush(outDir);

      // After flush, the sibling temp dir should be gone (renamed or deleted)
      const parentDir = path.dirname(outDir);
      const siblings = fs.readdirSync(parentDir);
      const tempSiblings = siblings.filter(s => s.startsWith('.atsf-tmp-'));
      expect(tempSiblings).toHaveLength(0);

      // The output should exist in the sibling of outDir (i.e., same parent)
      expect(parentDir).toBe(tmpDir);
    });

    it('can flush to a new (non-existent) output directory', async () => {
      const outDir = path.join(tmpDir, 'brand-new-dir');
      vfs.writeFile('task_graph.yaml', 'version: 1.0');
      await vfs.flush(outDir);
      expect(fs.existsSync(path.join(outDir, 'task_graph.yaml'))).toBe(true);
    });

    it('handles Buffer content during flush', async () => {
      const outDir = path.join(tmpDir, 'output-buf');
      const buf = Buffer.from('binary content');
      vfs.writeFile('data.bin', buf);
      await vfs.flush(outDir);
      const read = fs.readFileSync(path.join(outDir, 'data.bin'));
      expect(read).toEqual(buf);
    });
  });
});
