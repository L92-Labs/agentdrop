import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = join(dirname(fileURLToPath(import.meta.url)), "../bin/agentdrop.js");

function run(args, env = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    timeout: 10_000,
  });
}

test("help exits 0 and prints usage", () => {
  const r = run(["help"]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /agentdrop init/);
  assert.match(r.stdout, /agentdrop upload/);
  assert.match(r.stdout, /agentdrop delete/);
  assert.match(r.stdout, /agentdrop rotate/);
  assert.match(r.stdout, /share rotate/);
  assert.match(r.stdout, /agentdrop expires/);
  assert.match(r.stdout, /--password/);
  assert.match(r.stdout, /--expires/);
  assert.match(r.stdout, /\.md files/);
});

test("expires without args exits 1", () => {
  const r = run(["expires"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: agentdrop expires/);
});

test("unknown command exits 1", () => {
  const r = run(["nope"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown command/);
});

test("upload without file exits 1", () => {
  const r = run(["upload"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: agentdrop upload/);
});

test("upload missing path exits 1", () => {
  const r = run(["upload", "/tmp/agentdrop-does-not-exist-xyz"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /file not found/);
});

test("upload without init exits 1 when file exists", () => {
  const home = mkdtempSync(join(tmpdir(), "agentdrop-cli-"));
  const file = join(home, "shot.png");
  writeFileSync(file, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const r = run(["upload", file], { HOME: home });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /agentdrop init/);
});

test("delete without id exits 1", () => {
  const r = run(["delete"]);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: agentdrop delete/);
});
