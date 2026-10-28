#!/usr/bin/env node
// Runs `pnpm verify` locally and attaches the result to the current commit as the `local/verify`
// commit status. There is no build or test job in GitHub Actions by design: this script is the CI.
//
// It refuses to set any status when the working tree is dirty or HEAD is not on the remote,
// because a status must describe exactly the commit that the pull request shows.
import { spawnSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CONTEXT = 'local/verify';

/** Extracts "owner/repo" from an https, scp-style ssh or ssh:// GitHub remote URL. */
export function parseRemote(url) {
  const match =
    /^(?:https?:\/\/(?:[^@/]+@)?[^/]+\/|ssh:\/\/[^/]+\/|[^@\s]+@[^:\s]+:)([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(
      url.trim(),
    );
  if (!match) throw new Error(`cannot read owner/repo from remote URL: ${url}`);
  return { owner: match[1], repo: match[2] };
}

function run(cmd, args, options = {}) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  if (res.error) throw new Error(`cannot run ${cmd}: ${res.error.message}`);
  return res;
}

function git(...args) {
  const res = run('git', args);
  return { ok: res.status === 0, out: (res.stdout ?? '').trim(), err: (res.stderr ?? '').trim() };
}

function fail(message) {
  console.error(`local-verify: ${message}`);
  process.exit(1);
}

function assertCleanAndPushed() {
  if (git('status', '--porcelain').out !== '') {
    fail('the working tree is not clean; commit or stash changes first. No status was set.');
  }
  if (!git('fetch', 'origin', '--quiet').ok) {
    fail('cannot fetch origin to check that HEAD was pushed. No status was set.');
  }
  const head = git('rev-parse', 'HEAD').out;
  const branch = git('symbolic-ref', '--short', '-q', 'HEAD');
  if (branch.ok && branch.out) {
    const remote = git('rev-parse', '--verify', '-q', `origin/${branch.out}`);
    if (!remote.ok || remote.out !== head) {
      fail(
        `HEAD ${head.slice(0, 7)} is not the tip of origin/${branch.out}; push first. No status was set.`,
      );
    }
  } else if (git('branch', '-r', '--contains', 'HEAD').out === '') {
    fail('HEAD is not on any remote branch; push first. No status was set.');
  }
  return head;
}

function setStatus({ owner, repo }, sha, state, description) {
  const args = [
    'api',
    `repos/${owner}/${repo}/statuses/${sha}`,
    '-f',
    `state=${state}`,
    '-f',
    `context=${CONTEXT}`,
    '-f',
    `description=${description}`,
  ];
  if (process.env.LOCAL_VERIFY_TARGET_URL) {
    args.push('-f', `target_url=${process.env.LOCAL_VERIFY_TARGET_URL}`);
  }
  const res = run('gh', args, { stdio: ['ignore', 'ignore', 'inherit'] });
  if (res.status !== 0) fail(`gh could not set the ${CONTEXT} status (exit ${res.status}).`);
  console.log(`local-verify: ${CONTEXT} = ${state} on ${sha}`);
}

export function main() {
  const head = assertCleanAndPushed();
  const target = parseRemote(git('config', '--get', 'remote.origin.url').out);
  const mainSha = git('rev-parse', '--short', 'origin/main');
  const base = `pnpm verify, main@${mainSha.ok ? mainSha.out : 'unknown'}`;

  console.log(`local-verify: running pnpm verify on ${head}`);
  const verify = run('pnpm', ['verify'], { stdio: 'inherit' });

  if (git('rev-parse', 'HEAD').out !== head || git('status', '--porcelain').out !== '') {
    fail('the commit or the working tree changed while verifying. No status was set.');
  }
  if (verify.status === 0) {
    setStatus(target, head, 'success', base);
    return 0;
  }
  setStatus(target, head, 'failure', `${base} failed`);
  return verify.status || 1;
}

const invoked = process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) process.exit(main());
