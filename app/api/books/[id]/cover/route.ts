import { bookById, dataRoot } from "@/lib/db";
import { extractCover } from "@/lib/epub-upload";
import { readFile } from "node:fs/promises";
import path from "node:path";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const book = bookById((await params).id);
  if (!book) return new Response(null, { status: 404 });
  try {
    const cover = await extractCover(
      await readFile(path.join(dataRoot, book.filePath)),
    );
    if (cover)
      return new Response(new Uint8Array(cover.bytes), {
        headers: {
          "Content-Type": cover.mime,
          "Cache-Control": "private, max-age=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
  } catch {}
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "private, max-age=86400" },
  });
}
