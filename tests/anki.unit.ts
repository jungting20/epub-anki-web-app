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
