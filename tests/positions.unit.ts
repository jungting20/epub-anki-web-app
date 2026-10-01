import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  choosePosition,
  writePosition,
  readPosition,
  syncPosition,
  restorePosition,
  PositionTracker,
} from "../lib/positions";
import type { Position } from "../lib/types";
const position = (id: string, revision: number, synced = false): Position => ({
  bookId: id,
  cfi: `epubcfi(/6/2!/4/2/1:${revision})`,
  updatedAt: revision,
  version: 1,
  synced,
});
test("unsynced local takes priority, server wins for synced local, offline uses local", async () => {
  const local = position("restore", 1);
  const server = position("restore", 2, true);
  assert.equal(choosePosition(local, server), local);
  assert.equal(choosePosition({ ...local, synced: true }, server), server);
  await writePosition(local);
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  try {
    assert.deepEqual(await restorePosition("restore"), local);
  } finally {
    globalThis.fetch = original;
  }
});
test("late acknowledgements cannot clear a newer unsynced position; books stay separate", async () => {
  const original = globalThis.fetch;
  const old = position("race", 10);
  const latest = position("race", 11);
  await writePosition(old);
  await writePosition(position("other", 20));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  globalThis.fetch = async (_url, init) => {
    await gate;
    return Response.json(JSON.parse(init!.body as string));
  };
  try {
    const pending = syncPosition("race");
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writePosition(latest);
    release();
    await pending;
    assert.deepEqual(await readPosition("race"), latest);
    assert.deepEqual(await readPosition("other"), position("other", 20));
    await writePosition(old);
    assert.deepEqual(await readPosition("race"), latest);
    await syncPosition("race");
    assert.equal((await readPosition("race"))?.synced, true);
  } finally {
    release();
    globalThis.fetch = original;
  }
});
test("continuous changes still reach the server within the maximum wait", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, init) => {
    calls++;
    return Response.json(JSON.parse(init!.body as string));
  };
  const tracker = new PositionTracker("max-wait", () => {});
  try {
    for (let i = 0; i < 28; i++) {
      tracker.update(position("max-wait", i).cfi);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(
      calls >= 1,
      "server must save even though 1.5s debounce never settles",
    );
    tracker.dispose();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      (await readPosition("max-wait"))?.cfi,
      position("max-wait", 27).cfi,
    );
  } finally {
    tracker.dispose();
    await new Promise((resolve) => setTimeout(resolve, 50));
    globalThis.fetch = original;
  }
});
