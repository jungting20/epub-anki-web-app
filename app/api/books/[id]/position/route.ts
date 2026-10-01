import { bookById, db } from "@/lib/db";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { id } = await params;
  if (!bookById(id))
    return Response.json({ error: "책을 찾을 수 없습니다." }, { status: 404 });
  return Response.json(
    db().prepare("SELECT * FROM positions WHERE bookId = ?").get(id) || null,
  );
}
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  if (!bookById(id))
    return Response.json({ error: "책을 찾을 수 없습니다." }, { status: 404 });
  let p;
  try {
    p = await request.json();
  } catch {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (
    p.version !== 1 ||
    typeof p.cfi !== "string" ||
    !p.cfi.startsWith("epubcfi(") ||
    p.cfi.length > 4096 ||
    !Number.isSafeInteger(p.updatedAt) ||
    p.updatedAt < 0
  )
    return Response.json({ error: "잘못된 읽기 위치입니다." }, { status: 400 });
  db()
    .prepare(
      `INSERT INTO positions (bookId,cfi,updatedAt,version) VALUES (?,?,?,1) ON CONFLICT(bookId) DO UPDATE SET cfi=excluded.cfi, updatedAt=excluded.updatedAt WHERE excluded.updatedAt > positions.updatedAt`,
    )
    .run(id, p.cfi, p.updatedAt);
  return Response.json(
    db().prepare("SELECT * FROM positions WHERE bookId = ?").get(id),
  );
}
