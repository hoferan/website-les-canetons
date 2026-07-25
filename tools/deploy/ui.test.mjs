// tools/deploy/ui.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bar, fmtDuration, humanBytes, createUI } from './ui.mjs';

function fakeStream() {
  return {
    chunks: [],
    write(s) {
      this.chunks.push(s);
    },
    text() {
      return this.chunks.join('');
    },
  };
}

test('bar: boundaries and arrow head', () => {
  assert.equal(bar(0, 10), `[${'-'.repeat(20)}]`);
  assert.equal(bar(10, 10), `[${'='.repeat(20)}]`);
  assert.equal(bar(5, 10), `[${'='.repeat(9)}>${'-'.repeat(10)}]`);
  assert.equal(bar(3, 0), `[${'-'.repeat(20)}]`); // no total -> empty bar, no crash
});

test('fmtDuration: seconds under a minute, m/s above', () => {
  assert.equal(fmtDuration(1400), '1.4s');
  assert.equal(fmtDuration(75000), '1m 15s');
});

test('humanBytes: B / KB / MB', () => {
  assert.equal(humanBytes(512), '512 B');
  assert.equal(humanBytes(2048), '2.0 KB');
  assert.equal(humanBytes(3 * 1024 * 1024), '3.0 MB');
});

test('non-TTY: start/done print plain sequential lines with note and duration', () => {
  const stream = fakeStream();
  let t = 0;
  const ui = createUI({ stream, isTTY: false, now: () => t });
  ui.plan([{ id: 'build', title: 'Build' }, { id: 'upload', title: 'Upload' }]);
  ui.start('build');
  t = 1500;
  ui.done('build', '6912 files');
  const out = stream.text();
  assert.match(out, /> Build/);
  assert.match(out, /OK Build — 6912 files \(1\.5s\)/);
  assert.ok(!out.includes('\x1b['), 'non-TTY output must contain no ANSI escapes');
  ui.close();
});

test('non-TTY: progress prints a heartbeat at most every heartbeatMs', () => {
  const stream = fakeStream();
  let t = 0;
  const ui = createUI({ stream, isTTY: false, now: () => t, heartbeatMs: 10000 });
  ui.plan([{ id: 'up', title: 'Upload' }]);
  ui.start('up');
  const before = stream.chunks.length;
  t = 5000;
  ui.progress('up', { done: 5, total: 10 });
  assert.equal(stream.chunks.length, before, 'no heartbeat before heartbeatMs');
  t = 10000;
  ui.progress('up', { done: 7, total: 10 });
  assert.match(stream.chunks.at(-1), /Upload: 7\/10/);
  t = 12000;
  ui.progress('up', { done: 8, total: 10 });
  assert.match(stream.chunks.at(-1), /7\/10/, 'no new heartbeat 2s after the last one');
  ui.close();
});

test('detail: printed only when verbose', () => {
  const quiet = fakeStream();
  const ui1 = createUI({ stream: quiet, isTTY: false, verbose: false });
  ui1.detail('+ file.js');
  assert.equal(quiet.text(), '');
  ui1.close();

  const loud = fakeStream();
  const ui2 = createUI({ stream: loud, isTTY: false, verbose: true });
  ui2.detail('+ file.js');
  assert.match(loud.text(), /\+ file\.js/);
  ui2.close();
});

test('TTY: redraws the step block in place with ANSI and renders a progress bar', () => {
  const stream = fakeStream();
  let t = 0;
  const ui = createUI({ stream, isTTY: true, now: () => t });
  ui.plan([{ id: 'a', title: 'Upload' }]);
  ui.start('a');
  ui.progress('a', { done: 5, total: 10 });
  const out = stream.text();
  assert.ok(out.includes('\x1b[1A'), 'redraw moves the cursor up over the block');
  assert.ok(out.includes('[========='), 'renders the bar');
  assert.ok(out.includes('5/10'), 'renders counts');
  ui.close();
});

test('fail: marks the active step and prints message + hint', () => {
  const stream = fakeStream();
  const ui = createUI({ stream, isTTY: false });
  ui.plan([{ id: 'a', title: 'Plan' }]);
  ui.start('a');
  ui.failActive('safety brake tripped', 'Re-run with --force-delete.');
  const out = stream.text();
  assert.match(out, /FAILED at Plan: safety brake tripped/);
  assert.match(out, /-> Re-run with --force-delete\./);
  ui.close();
});

test('skip and summary render', () => {
  const stream = fakeStream();
  const ui = createUI({ stream, isTTY: false });
  ui.plan([{ id: 'v', title: 'Verify' }]);
  ui.skip('v', 'nothing uploaded');
  ui.summary('TEST deploy done in 3.0s — 0 uploaded.');
  const out = stream.text();
  assert.match(out, /Verify — skipped \(nothing uploaded\)/);
  assert.match(out, /TEST deploy done in 3\.0s/);
  ui.close();
});

test('fmtDuration: no "1m 60s" at rounding boundaries', () => {
  assert.equal(fmtDuration(119500), '2m 0s');
  assert.equal(fmtDuration(59999), '1m 0s');
});

test('TTY: step lines are truncated to the stream width (no wrap corruption)', () => {
  const stream = fakeStream();
  stream.columns = 30;
  const ui = createUI({ stream, isTTY: true, now: () => 0 });
  ui.plan([{ id: 'a', title: 'Upload' }]);
  ui.start('a', 'x'.repeat(200));
  const lines = stream.text().split('\n');
  assert.ok(lines.every((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').length < 30), 'every physical line fits');
  ui.close();
});

test('done without start renders a zero duration, not epoch time', () => {
  const stream = fakeStream();
  const ui = createUI({ stream, isTTY: false, now: () => 5000 });
  ui.plan([{ id: 'a', title: 'Verify' }]);
  ui.done('a', 'skipped upload');
  assert.match(stream.text(), /\(0\.0s\)/);
  ui.close();
});

test('unknown step id throws a named error', () => {
  const ui = createUI({ stream: fakeStream(), isTTY: false });
  ui.plan([{ id: 'a', title: 'A' }]);
  assert.throws(() => ui.start('typo'), /unknown step id "typo"/);
  ui.close();
});
