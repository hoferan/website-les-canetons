import assert from 'node:assert/strict';
import test from 'node:test';

import { NEEDS, iniBytes, renderProbe, verdicts } from './host-probe.mjs';

test('iniBytes reads php.ini shorthand', () => {
  assert.equal(iniBytes('32M'), 32 * 1024 ** 2);
  assert.equal(iniBytes('512k'), 512 * 1024);
  assert.equal(iniBytes('1G'), 1024 ** 3);
  assert.equal(iniBytes('8388608'), 8388608);
  assert.equal(iniBytes(''), null);
  assert.equal(iniBytes(false), null);
});

test('renderProbe puts the token in and refuses anything but 64 hex', () => {
  const token = 'ab'.repeat(32);
  const php = renderProbe(token);
  assert.ok(php.includes(`hash_equals('${token}', $token)`));
  assert.ok(!php.includes('__TOKEN__'));
  assert.throws(() => renderProbe("x'; phpinfo(); //"));
});

test('the rendered probe keeps its regex backslashes', () => {
  assert.ok(renderProbe('0'.repeat(64)).includes(String.raw`'/^\\s*([A-Z_]+)\\s*=\\s*(.*?)\\s*$/'`));
});

test('verdicts compare each limit with what an upload needs', () => {
  const ok = verdicts({
    ini: { upload_max_filesize: '32M', post_max_size: '32M' },
    database: { max_allowed_packet: 64 * 1024 ** 2 },
  });
  assert.deepEqual(
    ok.map((v) => v.ok),
    [true, true, true]
  );

  const low = verdicts({
    ini: { upload_max_filesize: '512K', post_max_size: '1M' },
    database: { error: 'PDOException' },
  });
  assert.deepEqual(
    low.map((v) => [v.name, v.ok]),
    [
      ['upload_max_filesize', false],
      ['post_max_size', false],
      ['max_allowed_packet', false],
    ]
  );
  assert.equal(low[2].bytes, null);
  assert.equal(NEEDS.post_max_size, 3 * 614_400 + 16_384);
});
