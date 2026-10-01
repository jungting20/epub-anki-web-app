import { db, dataRoot, publicBook, type BookRow } from "@/lib/db";
import { inspectEpub } from "@/lib/epub-upload";
import { createHash, randomUUID } from "node:crypto";
import { writeFile, unlink } from "node:fs/promises";
import path from "node:path";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(
    db()
      .prepare("SELECT * FROM books ORDER BY createdAt DESC")
      .all()
      .map((b) => publicBook(b as BookRow)),
  );
}
export async function POST(request: Request) {
  const limit = 50 * 1024 * 1024;
  let target: string | undefined;
  try {
    if (Number(request.headers.get("content-length")) > limit + 1024 * 1024)
      return Response.json(
        { error: "파일은 최대 50MB까지 업로드할 수 있습니다." },
        { status: 413 },
      );
    // Limit streamed multipart data as well, including requests without Content-Length.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("파일을 선택해주세요.");
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit + 1024 * 1024) {
        await reader.cancel();
        return Response.json(
          { error: "파일은 최대 50MB까지 업로드할 수 있습니다." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "content-type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".epub"))
      throw new Error(".epub 파일을 선택해주세요.");
    if (!file.size || file.size > limit)
      return Response.json(
        { error: "빈 파일이거나 50MB 제한을 초과했습니다." },
        { status: 413 },
      );
    const bytes = Buffer.from(await file.arrayBuffer());
    const hash = createHash("sha256").update(bytes).digest("hex");
    const existing = db()
      .prepare("SELECT * FROM books WHERE hash = ?")
      .get(hash) as BookRow | undefined;
    if (existing)
      return Response.json({ book: publicBook(existing), duplicate: true });
    const metadata = await inspectEpub(bytes);
    const id = randomUUID();
    const filePath = `books/${id}.epub`;
    target = path.join(dataRoot, filePath);
    await writeFile(target, bytes, { flag: "wx" });
    // Recheck after async filesystem operation: concurrent duplicate uploads may finish together.
    const result = db().transaction(() => {
      const duplicate = db()
        .prepare("SELECT * FROM books WHERE hash = ?")
        .get(hash) as BookRow | undefined;
      if (duplicate) return { book: publicBook(duplicate), duplicate: true };
      const row = {
        id,
        ...metadata,
        filePath,
        hash,
        createdAt: new Date().toISOString(),
      };
      db()
        .prepare(
          "INSERT INTO books VALUES (@id, @title, @author, @filePath, @hash, @createdAt)",
        )
        .run(row);
      return { book: publicBook(row), duplicate: false };
    })();
    if (result.duplicate) await unlink(target);
    target = undefined;
    return Response.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (target) await unlink(target).catch(() => {});
    console.error("Upload failed:", error);
    return Response.json(
      {
        error:
          error instanceof Error && /EPUB|epub|파일/.test(error.message)
            ? error.message
            : "업로드 저장에 실패했습니다. 다시 시도해주세요.",
      },
      { status: 400 },
    );
  }
}
