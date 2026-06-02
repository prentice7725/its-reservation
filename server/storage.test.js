import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { atomicWriteJson } from './storage.js';

test('atomicWriteJson replaces the destination with formatted JSON', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'its-reservation-storage-'));
  const filePath = path.join(directory, 'data.json');

  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await fs.writeFile(filePath, '{"stale":true}', 'utf-8');
  await atomicWriteJson(filePath, { fresh: true });

  assert.equal(await fs.readFile(filePath, 'utf-8'), '{\n  "fresh": true\n}');
});

test('atomicWriteJson removes its temporary file after rename', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'its-reservation-storage-'));
  const filePath = path.join(directory, 'data.json');

  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await atomicWriteJson(filePath, ['saved']);

  assert.deepEqual(await fs.readdir(directory), ['data.json']);
});

test('atomicWriteJson isolates concurrent temporary files', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'its-reservation-storage-'));
  const filePath = path.join(directory, 'data.json');

  t.after(() => fs.rm(directory, { recursive: true, force: true }));

  await Promise.all([
    atomicWriteJson(filePath, { version: 1 }),
    atomicWriteJson(filePath, { version: 2 }),
  ]);

  assert.deepEqual(await fs.readdir(directory), ['data.json']);
  assert.ok([1, 2].includes(JSON.parse(await fs.readFile(filePath, 'utf-8')).version));
});
