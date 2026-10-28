import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseRemote } from './local-verify.mjs';

const script = fileURLToPath(new URL('./local-verify.mjs', import.meta.url));

const sh = (cwd, cmd, ...args) => execFileSync(cmd, args, { cwd, encoding: 'utf8' }).trim();

/** A work clone with a bare "origin", plus fake `pnpm` and `gh` executables that log their use. */
function fixture({ pnpmExit = 0 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'local-verify-'));
  const bare = join(root, 'origin.git');
  const work = join(root, 'work');
  const bin = join(root, 'bin');
  const ghLog = join(root, 'gh.log');
  sh(root, 'git', 'init', '--bare', '-b', 'main', bare);
  sh(root, 'git', 'clone', bare, work);
  sh(work, 'git', 'config', 'user.email', 't@example.com');
  sh(work, 'git', 'config', 'user.name', 't');
  writeFileSync(join(work, 'a.txt'), 'a');
  sh(work, 'git', 'add', '.');
  sh(work, 'git', 'commit', '-m', 'init');
  sh(work, 'git', 'push', 'origin', 'HEAD:main');
  sh(work, 'git', 'remote', 'set-url', 'origin', 'https://github.com/acme/widgets.git');
  sh(work, 'git', 'config', `url.${bare}.insteadOf`, 'https://github.com/acme/widgets.git');
  sh(root, 'mkdir', bin);
  writeFileSync(join(bin, 'pnpm'), `#!/bin/sh\nexit ${pnpmExit}\n`);
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho "$@" >> "${ghLog}"\n`);
  chmodSync(join(bin, 'pnpm'), 0o755);
  chmodSync(join(bin, 'gh'), 0o755);
  const run = () =>
    spawnSync('node', [script], {
      cwd: work,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    });
  const statuses = () => (existsSync(ghLog) ? readFileSync(ghLog, 'utf8').trim().split('\n') : []);
  return { work, run, statuses };
}

describe('parseRemote', () => {
  it('reads owner/repo from every GitHub URL shape', () => {
    for (const url of [
      'https://github.com/acme/widgets.git',
      'https://github.com/acme/widgets',
      'https://user@github.com/acme/widgets.git',
      'git@github.com:acme/widgets.git',
      'ssh://git@github.com/acme/widgets.git',
    ]) {
      assert.deepEqual(parseRemote(url), { owner: 'acme', repo: 'widgets' }, url);
    }
  });

  it('rejects a URL it cannot read', () => {
    assert.throws(() => parseRemote('not a url'));
  });
});

describe('local-verify.mjs', () => {
  it('sets success on the pushed HEAD when verify passes', () => {
    const f = fixture();
    const sha = sh(f.work, 'git', 'rev-parse', 'HEAD');
    const res = f.run();
    assert.equal(res.status, 0, res.stderr);
    const calls = f.statuses();
    assert.equal(calls.length, 1);
    assert.match(calls[0], new RegExp(`repos/acme/widgets/statuses/${sha}`));
    assert.match(calls[0], /state=success/);
    assert.match(calls[0], /context=local\/verify/);
  });

  it('refuses a dirty tree without setting a status', () => {
    const f = fixture();
    writeFileSync(join(f.work, 'dirty.txt'), 'x');
    const res = f.run();
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /not clean/);
    assert.deepEqual(f.statuses(), []);
  });

  it('refuses a HEAD that is not on the remote without setting a status', () => {
    const f = fixture();
    writeFileSync(join(f.work, 'b.txt'), 'b');
    sh(f.work, 'git', 'add', '.');
    sh(f.work, 'git', 'commit', '-m', 'local only');
    const res = f.run();
    assert.notEqual(res.status, 0);
    assert.match(res.stderr, /not the tip of origin/);
    assert.deepEqual(f.statuses(), []);
  });

  it('sets failure and exits non-zero when verify fails', () => {
    const f = fixture({ pnpmExit: 3 });
    const res = f.run();
    assert.equal(res.status, 3);
    const calls = f.statuses();
    assert.equal(calls.length, 1);
    assert.match(calls[0], /state=failure/);
  });
});
