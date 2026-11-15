// Unit tests: local stand-in parser + routing decision (pure functions only).
// Run: node --test tests/parser.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseShotlistLocally, decideRoute } from '../local-parser.js';
import { SHORT_BRIEF, LONG_SCRIPT, SHORT_MAX_CHARS } from '../demo-inputs.js';

test('routing: short brief goes on-device first, long script goes cloud only', () => {
  assert.equal(decideRoute(SHORT_BRIEF.length, SHORT_MAX_CHARS), 'ON_DEVICE_FIRST');
  assert.equal(decideRoute(LONG_SCRIPT.length, SHORT_MAX_CHARS), 'CLOUD_ONLY');
  assert.equal(decideRoute(SHORT_MAX_CHARS, SHORT_MAX_CHARS), 'ON_DEVICE_FIRST');
  assert.equal(decideRoute(SHORT_MAX_CHARS + 1, SHORT_MAX_CHARS), 'CLOUD_ONLY');
  assert.ok(SHORT_BRIEF.length <= SHORT_MAX_CHARS, `short brief is ${SHORT_BRIEF.length} chars, must be <= ${SHORT_MAX_CHARS}`);
  assert.ok(LONG_SCRIPT.length > SHORT_MAX_CHARS, `long script is ${LONG_SCRIPT.length} chars, must be > ${SHORT_MAX_CHARS}`);
});

test('parser: short brief yields 3 shots, one scene, positive durations', () => {
  const r = parseShotlistLocally(SHORT_BRIEF);
  assert.equal(r.shots.length, 3);
  assert.equal(r.callSheet.scenes, 1);
  assert.equal(r.callSheet.totalShots, 3);
  assert.ok(r.callSheet.estRuntimeSeconds > 0);
  assert.ok(r.shots.every((s) => s.description && s.camera && s.durationSeconds > 0));
  assert.deepEqual(r.shots.map((s) => s.shot), ['Wide establishing', 'Medium action', 'Close-up detail']);
});

test('parser: long script detects 4 scenes and adds dialogue shots', () => {
  const r = parseShotlistLocally(LONG_SCRIPT);
  assert.equal(r.callSheet.scenes, 4);
  assert.ok(r.shots.length >= 12, `expected >= 12 shots, got ${r.shots.length}`);
  assert.ok(r.shots.some((s) => s.shot === 'Over-the-shoulder'), 'dialogue scene should add an OTS shot');
  assert.ok(r.shots.every((s, i) => s.n === i + 1), 'shot numbers are sequential');
});

test('parser: empty input returns an empty shotlist, never throws', () => {
  const r = parseShotlistLocally('   ');
  assert.equal(r.shots.length, 0);
  assert.equal(r.callSheet.totalShots, 0);
});

test('parser: deterministic (same input, same output)', () => {
  assert.deepEqual(parseShotlistLocally(LONG_SCRIPT), parseShotlistLocally(LONG_SCRIPT));
});
