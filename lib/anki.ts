import { spawn } from "node:child_process";
import path from "node:path";
import { dataRoot } from "./db";

export type AnkiCardInput = {
  text: string;
  deck: string;
  title: string;
  chapter: string;
  context: string;
};

export function validateCard(value: unknown): AnkiCardInput {
  if (!value || typeof value !== "object")
    throw new Error("카드 정보를 입력해주세요.");
  const data: Record<string, unknown> = { context: "", ...value };
  const limits = {
    text: 2000,
    deck: 200,
    title: 500,
    chapter: 500,
    context: 8000,
  };
  const result: Record<string, string> = {};
  for (const [key, limit] of Object.entries(limits)) {
    if (
      typeof data[key] !== "string" ||
      data[key].length > limit ||
      /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(data[key])
    )
      throw new Error("카드 입력 형식이나 길이를 확인해주세요.");
    result[key] = data[key].trim();
  }
  if (!result.text || !result.deck)
    throw new Error("영어 문장과 Anki 덱은 필수입니다.");
  if (
    /[\r\n]/.test(result.deck) ||
    result.deck.split("::").some((part) => !part.trim())
  )
    throw new Error("덱 경로는 영어::독서처럼 입력해주세요.");
  return result as AnkiCardInput;
}

export function registerCard(input: AnkiCardInput): Promise<{
  noteId: number;
  cardId: number;
  deck: string;
  duplicate: boolean;
}> {
  return new Promise((resolve, reject) => {
    // The Python entrypoint is explicitly copied into the Docker image.
    const child = spawn(
      /* turbopackIgnore: true */
      process.env.ANKI_PYTHON || "python3",
      [path.join(process.cwd(), "scripts/register_anki_card.py")],
      {
        env: { ...process.env, ANKI_DATA_DIR: path.join(dataRoot, "anki") },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 360_000);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 64_000) child.kill("SIGTERM");
    });
    // Dependency errors can contain credentials. Never forward stderr to the client or logs.
    child.stderr.resume();
    child.on("error", () => {
      clearTimeout(timer);
      reject(new Error("Anki 실행 환경을 확인해주세요."));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const result = JSON.parse(output);
        if (code !== 0 || result.error)
          throw new Error(result.error || "Anki 등록에 실패했습니다.");
        if (
          !Number.isSafeInteger(result.noteId) ||
          !Number.isSafeInteger(result.cardId)
        )
          throw new Error();
        resolve(result);
      } catch (error) {
        reject(
          error instanceof Error && output.startsWith("{")
            ? error
            : new Error(
                "Anki 등록을 완료하지 못했습니다. 같은 카드로 다시 시도해주세요.",
              ),
        );
      }
    });
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify(input));
  });
}
