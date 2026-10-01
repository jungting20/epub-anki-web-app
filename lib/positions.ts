import { openDB } from "idb";
import type { Position } from "./types";
let database: ReturnType<typeof openDB> | undefined;
const storage = () =>
  (database ||= openDB("epub-reader", 1, {
    upgrade(db) {
      db.createObjectStore("positions", { keyPath: "bookId" });
    },
  }));
export async function readPosition(id: string): Promise<Position | undefined> {
  return (await storage()).get("positions", id);
}
export async function writePosition(position: Position) {
  const db = await storage();
  const tx = db.transaction("positions", "readwrite");
  const current: Position | undefined = await tx.store.get(position.bookId);
  if (
    !current ||
    position.updatedAt > current.updatedAt ||
    (position.updatedAt === current.updatedAt &&
      position.cfi === current.cfi &&
      position.synced)
  )
    await tx.store.put(position);
  await tx.done;
}
export function choosePosition(local?: Position, server?: Position | null) {
  if (local && !local.synced) return local;
  return server || local;
}
export async function restorePosition(id: string) {
  const local = await readPosition(id);
  try {
    const response = await fetch(`/api/books/${id}/position`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Position unavailable");
    const server = (await response.json()) as Position | null;
    const chosen = choosePosition(
      local,
      server ? { ...server, synced: true } : null,
    );
    if (chosen) await writePosition(chosen);
    return chosen;
  } catch {
    return local;
  }
}
// One request at a time per book; writes/acks are additionally guarded by timestamp in IDB.
const running = new Map<string, Promise<void>>();
export async function syncPosition(id: string) {
  if (running.has(id)) return running.get(id);
  const work = (async () => {
    const local = await readPosition(id);
    if (!local || local.synced) return;
    const response = await fetch(`/api/books/${id}/position`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(local),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("서버 저장 실패");
    const server = (await response.json()) as Position;
    if (server.cfi === local.cfi && server.updatedAt === local.updatedAt)
      await writePosition({ ...local, synced: true });
    else if (server.updatedAt >= local.updatedAt) {
      // Clock moved backwards: preserve the unsynced local location and advance its revision.
      const latest = await readPosition(id);
      if (latest && latest.updatedAt === local.updatedAt)
        await writePosition({
          ...latest,
          updatedAt: server.updatedAt + 1,
          synced: false,
        });
    }
  })();
  running.set(id, work);
  try {
    await work;
  } finally {
    running.delete(id);
  }
}
export async function syncPending() {
  const all = (await (await storage()).getAll("positions")) as Position[];
  await Promise.allSettled(
    all.filter((p) => !p.synced).map((p) => syncPosition(p.bookId)),
  );
}
export class PositionTracker {
  private latest?: Position;
  private localTimer?: ReturnType<typeof setTimeout>;
  private serverTimer?: ReturnType<typeof setTimeout>;
  private maxTimer?: ReturnType<typeof setTimeout>;
  private retryTimer: ReturnType<typeof setInterval>;
  private disposed = false;
  constructor(
    private id: string,
    private status: (s: string) => void,
    initial?: Position,
  ) {
    this.latest = initial;
    this.retryTimer = setInterval(() => {
      void this.push();
    }, 5000);
    if (initial && !initial.synced) void this.push();
  }
  update(cfi: string) {
    if (this.disposed || this.latest?.cfi === cfi) return;
    this.latest = {
      bookId: this.id,
      cfi,
      updatedAt: Math.max(Date.now(), (this.latest?.updatedAt || 0) + 1),
      version: 1,
      synced: false,
    };
    this.status("로컬 저장 중…");
    clearTimeout(this.localTimer);
    this.localTimer = setTimeout(() => {
      void this.persist();
    }, 180);
    clearTimeout(this.serverTimer);
    this.serverTimer = setTimeout(() => {
      void this.push();
    }, 1500);
    if (!this.maxTimer)
      this.maxTimer = setTimeout(() => {
        void this.push();
      }, 5000);
  }
  async persist() {
    clearTimeout(this.localTimer);
    if (!this.latest) return;
    try {
      await writePosition(this.latest);
      if (!this.disposed) this.status("로컬 저장됨 · 서버 반영 대기");
    } catch {
      if (!this.disposed)
        this.status("로컬 저장 실패 · 브라우저 저장 권한을 확인하세요");
    }
  }
  async push() {
    clearTimeout(this.serverTimer);
    clearTimeout(this.maxTimer);
    this.maxTimer = undefined;
    await this.persist();
    try {
      await syncPosition(this.id);
      const saved = await readPosition(this.id);
      if (saved?.synced && saved.updatedAt === this.latest?.updatedAt) {
        this.latest = saved;
        if (!this.disposed) this.status("서버에 저장됨");
      }
    } catch {
      if (!this.disposed) this.status("로컬 저장됨 · 서버 연결 후 자동 재시도");
    }
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.localTimer);
    clearTimeout(this.serverTimer);
    clearTimeout(this.maxTimer);
    clearInterval(this.retryTimer);
    // Capture the latest position synchronously before the next book starts loading.
    void this.push();
  }
}
