import { bookById, dataRoot } from "@/lib/db";
import { readFile } from "node:fs/promises";
import path from "node:path";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const book = bookById((await params).id);
  if (!book)
    return Response.json({ error: "책을 찾을 수 없습니다." }, { status: 404 });
  try {
    return new Response(await readFile(path.join(dataRoot, book.filePath)), {
      headers: {
        "Content-Type": "application/epub+zip",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": `attachment; filename="${book.id}.epub"`,
      },
    });
  } catch {
    return Response.json(
      { error: "원본 파일을 읽을 수 없습니다." },
      { status: 500 },
    );
  }
}
