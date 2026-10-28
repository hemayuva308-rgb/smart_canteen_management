import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Unit tests run with NODE_ENV=test and import modules in-process. This starts the app as a real process in each mode
// and fails on any configuration complaint, e.g. express-rate-limit prints (but does not throw) a ValidationError
// for an unsupported option and then silently ignores it.
for (const mode of ['development', 'production']) {
  test(`the app builds cleanly in ${mode} mode: no config errors or warnings on stderr`, () => {
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', "const m = await import('./src/app.js'); m.createApp(); console.log('BOOT_OK');"], {
      env: { PATH: process.env.PATH, NODE_ENV: mode, JWT_SECRET: 'a'.repeat(48) }, encoding: 'utf8', timeout: 20000,
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /BOOT_OK/);
    const noise = r.stderr.split('\n').filter((l) => !/punycode|trace-deprecation/i.test(l) && l.trim());
    assert.deepEqual(noise, []);
  });
}
