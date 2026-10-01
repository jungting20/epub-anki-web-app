import { registerCard, validateCard } from "@/lib/anki";

export const runtime = "nodejs";
export const maxDuration = 360;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: "허용되지 않은 요청입니다." },
      { status: 403 },
    );
  let input;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("카드 정보를 입력해주세요.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 64_000) {
        await reader.cancel();
        return Response.json(
          { error: "카드 입력이 너무 큽니다." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    input = validateCard(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof SyntaxError
            ? "올바른 JSON이 필요합니다."
            : (error as Error).message,
      },
      { status: 400 },
    );
  }
  try {
    return Response.json(await registerCard(input));
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 503 });
  }
}
