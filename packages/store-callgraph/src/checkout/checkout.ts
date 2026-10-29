import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface Checkout {
  /** The worktree, laid out like the repository root. */
  dir: string;
  sha: string;
  warnings: string[];
  dispose(): void;
}

const LOCKFILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock'];

export function gitRoot(cwd: string): string {
  return git(cwd, 'rev-parse', '--show-toplevel');
}

/**
 * Checks out `rev` into a temporary worktree. Type information comes from `node_modules`,
 * which isn't in git: if the revision's lockfile matches the working tree's, the existing
 * `node_modules` directories are linked in. Otherwise `install` is run, if given.
 */
export function checkout(repo: string, rev: string, install?: string): Checkout {
  const sha = git(repo, 'rev-parse', '--verify', `${rev}^{commit}`);
  const dir = mkdtempSync(path.join(os.tmpdir(), 'store-callgraph-'));
  git(repo, 'worktree', 'add', '--detach', '--quiet', dir, sha);
  const warnings: string[] = [];
  const dispose = () => {
    try {
      git(repo, 'worktree', 'remove', '--force', dir);
    } catch {
      rmSync(dir, { recursive: true, force: true });
      git(repo, 'worktree', 'prune');
    }
  };

  try {
    const changed = LOCKFILES.filter((f) => existsSync(path.join(repo, f)) && read(repo, f) !== read(dir, f));
    if (changed.length && install) {
      execFileSync(install, { cwd: dir, shell: true, stdio: 'inherit' });
    } else {
      if (changed.length)
        warnings.push(
          `${rev}: ${changed.join(', ')} differs from the working tree; using its node_modules anyway (pass --install to install)`,
        );
      for (const modules of nodeModulesDirs(repo)) {
        const target = path.join(dir, modules);
        if (existsSync(path.dirname(target)) && !existsSync(target))
          symlinkSync(path.join(repo, modules), target, 'dir');
      }
    }
  } catch (error) {
    dispose();
    throw error;
  }
  return { dir, sha, warnings, dispose };
}

/** `node_modules` directories in the repository, relative to it, outside other ones. */
function nodeModulesDirs(repo: string, rel = '', depth = 0): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(path.join(repo, rel), { withFileTypes: true })) {
    const child = path.join(rel, entry.name);
    const full = path.join(repo, child);
    // Often a symlink, e.g. to a shared install.
    const isDir = entry.isDirectory() || (entry.isSymbolicLink() && existsSync(full) && statSync(full).isDirectory());
    if (entry.name === 'node_modules' && isDir) found.push(child);
    if (!entry.isDirectory() || entry.name === '.git' || entry.name === 'node_modules') continue;
    if (depth < 4 && !entry.name.startsWith('.')) found.push(...nodeModulesDirs(repo, child, depth + 1));
  }
  return found.sort();
}

function read(dir: string, file: string): string | undefined {
  const p = path.join(dir, file);
  return existsSync(p) ? readFileSync(p, 'utf8') : undefined;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
