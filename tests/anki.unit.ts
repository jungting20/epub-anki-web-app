import { test } from "node:test";
import assert from "node:assert/strict";
import { validateCard } from "../lib/anki";
const card = {
  text: 'Selected "sentence".',
  deck: "영어::독서",
  title: "Book",
  chapter: "Chapter 1",
  context: "Context around the selected sentence.",
};
test("Anki accepts custom nested deck and preserves sentence", () => {
  assert.deepEqual(validateCard(card), card);
});
test("Anki rejects invalid paths, empty text and oversized values", () => {
  for (const deck of ["", "영어::", "::영어", "영어\n독서", "a".repeat(201)])
    assert.throws(() => validateCard({ ...card, deck }));
  assert.throws(() => validateCard({ ...card, text: " " }));
  assert.throws(() => validateCard({ ...card, text: "a".repeat(2001) }));
  assert.throws(() => validateCard(null));
});

test("Anki origin check accepts tunnel Host despite internal Next.js URL", async () => {
  const { POST } = await import("../app/api/anki/cards/route");
  const request = new Request("http://0.0.0.0:3000/api/anki/cards", {
    method: "POST",
    headers: {
      Host: "127.0.0.1:3001",
      Origin: "http://127.0.0.1:3001",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal((await POST(request)).status, 400);
});

test("Anki origin check supports HTTPS proxies and rejects other origins", async () => {
  const { POST } = await import("../app/api/anki/cards/route");
  for (const [origin, status] of [
    ["https://reader.example.com", 400],
    ["https://other.example.com", 403],
    ["null", 403],
    ["http://reader.example.com", 403],
  ] as const) {
    const request = new Request("http://0.0.0.0:3000/api/anki/cards", {
      method: "POST",
      headers: {
        Host: "reader.example.com",
        Origin: origin,
        "X-Forwarded-Proto": "https",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal((await POST(request)).status, status);
  }
});
