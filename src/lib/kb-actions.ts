/**
 * T3 看板 ↔ 权威执行器 桥（纯薄壳）。
 *
 * 铁律：本文件与 API route **绝不直接改** status / cite_allowed / commit_hash。
 * 所有状态变更只 execFile 调 drudge 侧 kb_action.py（唯一入口，内部走 kb_state.transition）。
 */
import 'server-only';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileP = promisify(execFile);
const VAULT = process.env.LTY_VAULT_ROOT || '/Users/lty/LTY旭珑';
const DRUDGE = path.join(VAULT, '_meta', 'drudge');
const PY = path.join(DRUDGE, '.venv', 'bin', 'python');
const SCRIPT = path.join(DRUDGE, 'kb_action.py');

export type KbAction = 'confirm' | 'reject' | 'setfields' | 'publish';
export type KbItem = {
  file: string;
  status: string;
  dept: string | null;
  type: string | null;
  owner: string | null;
  permission: string | null;
  version: string | null;
  cite_allowed: boolean | null;
  summary: string | null;
};

function badPath(fileRel: string): boolean {
  return (
    !fileRel ||
    fileRel.includes('..') ||
    path.isAbsolute(fileRel) ||
    !(fileRel.startsWith('raw/') || fileRel.startsWith('wiki/'))
  );
}

async function runPy(args: string[]): Promise<unknown> {
  try {
    const { stdout } = await execFileP(PY, [SCRIPT, ...args], {
      cwd: DRUDGE,
      timeout: 60000,
      maxBuffer: 4 << 20,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8', LC_ALL: 'en_US.UTF-8', LANG: 'en_US.UTF-8' },
    });
    const line = stdout.trim().split('\n').filter(Boolean).pop() || '{}';
    return JSON.parse(line);
  } catch (e: unknown) {
    // kb_action.py 在 ok:false 时以非 0 退出，但 stdout 仍是 JSON
    const err = e as { stdout?: string; message?: string };
    const out = typeof err?.stdout === 'string' ? err.stdout.trim().split('\n').filter(Boolean).pop() : '';
    if (out) {
      try {
        return JSON.parse(out);
      } catch {
        /* fallthrough */
      }
    }
    return { ok: false, error: String(err?.message ?? e) };
  }
}

export async function getKbReviewItems(): Promise<KbItem[]> {
  const json = await runPy(['list']);
  return Array.isArray(json) ? (json as KbItem[]) : [];
}

export async function runKbAction(
  action: KbAction,
  fileRel: string,
  opts: { actor: string; reason?: string; owner?: string; permission?: string; version?: string },
): Promise<Record<string, unknown>> {
  if (badPath(fileRel)) return { ok: false, error: 'BAD_PATH' };
  const args = [action, '--file', fileRel, '--actor', opts.actor || 'system'];
  if (opts.reason) args.push('--reason', opts.reason);
  if (opts.owner) args.push('--owner', opts.owner);
  if (opts.permission) args.push('--permission', opts.permission);
  if (opts.version) args.push('--version', opts.version);
  return (await runPy(args)) as Record<string, unknown>;
}
