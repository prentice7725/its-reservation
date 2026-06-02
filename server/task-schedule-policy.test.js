import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldRegisterSchedule } from './task-schedule-policy.js';

test('registers enabled scheduled tasks', () => {
  assert.equal(shouldRegisterSchedule({
    enabled: true,
    startMode: { type: 'scheduled' },
    runMode: { type: 'once' },
  }), true);
});

test('registers enabled manual repeat and cron tasks', () => {
  assert.equal(shouldRegisterSchedule({
    enabled: true,
    startMode: { type: 'manual' },
    runMode: { type: 'repeat' },
  }), true);
  assert.equal(shouldRegisterSchedule({
    enabled: true,
    startMode: { type: 'manual' },
    runMode: { type: 'cron' },
  }), true);
});

test('does not register manual once tasks', () => {
  assert.equal(shouldRegisterSchedule({
    enabled: true,
    startMode: { type: 'manual' },
    runMode: { type: 'once' },
  }), false);
});

test('does not register incomplete or disabled tasks', () => {
  assert.equal(shouldRegisterSchedule(), false);
  assert.equal(shouldRegisterSchedule({ enabled: false }), false);
  assert.equal(shouldRegisterSchedule({ enabled: true }), false);
  assert.equal(shouldRegisterSchedule({ enabled: true, startMode: { type: 'scheduled' } }), false);
});
