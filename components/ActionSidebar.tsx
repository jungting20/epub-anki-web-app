"use client";
import { useEffect, useRef, useState } from "react";
import type { SelectionInfo } from "@/lib/types";
export default function ActionSidebar({
  selection,
  clear,
}: {
  selection: SelectionInfo | null;
  clear: () => void;
}) {
  const [notice, setNotice] = useState("");
  const [deck, setDeck] = useState("영어::독서");
  const [registering, setRegistering] = useState(false);
  const pending = useRef(false);
  const selectionKey = selection
    ? `${selection.bookId}:${selection.cfi}:${selection.text}`
    : "";
  const currentSelection = useRef(selectionKey);
  currentSelection.current = selectionKey;
  useEffect(() => {
    try {
      setDeck(localStorage.getItem("anki-deck") || "영어::독서");
    } catch {}
  }, []);
  useEffect(() => {
    setNotice("");
  }, [selectionKey]);
  async function createCard() {
    if (!selection || pending.current || !deck.trim()) return;
    pending.current = true;
    setRegistering(true);
    setNotice("");
    const submittedSelection = selectionKey;
    try {
      const response = await fetch("/api/anki/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: selection.text,
          deck: deck.trim(),
          title: selection.title,
          chapter: selection.chapter,
          context: selection.context,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Anki 등록에 실패했습니다.");
      if (currentSelection.current === submittedSelection)
        setNotice(
          `${result.deck} 덱에 ${result.duplicate ? "이미 등록된 카드입니다" : "등록했습니다"}. Anki에서 동기화하세요.`,
        );
    } catch (error) {
      if (currentSelection.current === submittedSelection)
        setNotice(
          error instanceof Error
            ? error.message
            : "연결에 실패했습니다. 다시 시도해주세요.",
        );
    } finally {
      pending.current = false;
      setRegistering(false);
    }
  }
  async function copy() {
    if (!selection) return;
    try {
      await navigator.clipboard.writeText(selection.text);
      setNotice("복사했습니다.");
    } catch {
      setNotice(
        "복사 권한을 확인해주세요. 선택 문장을 직접 복사할 수도 있습니다.",
      );
    }
  }
  return (
    <section className="sentence-actions" aria-label="문장 액션">
      <div className="eyebrow">SENTENCE DESK</div>
      <h2>문장 수집</h2>
      <p className="muted">읽다가 마음에 남는 영어 문장을 선택하세요.</p>
      {selection ? (
        <>
          <blockquote>{selection.text}</blockquote>
          <div className="selection-source">
            <strong>{selection.title}</strong>
            <span>{selection.chapter}</span>
          </div>
          <div className="button-row">
            <button onClick={copy}>문장 복사</button>
            <button
              className="secondary"
              onClick={() => {
                clear();
                setNotice("");
              }}
            >
              선택 초기화
            </button>
          </div>
          <div className="anki-controls">
            <label htmlFor="anki-deck">Anki 덱 경로</label>
            <input
              id="anki-deck"
              value={deck}
              maxLength={200}
              placeholder="영어::독서::책 이름"
              disabled={registering}
              onChange={(event) => {
                setDeck(event.target.value);
                try {
                  localStorage.setItem("anki-deck", event.target.value);
                } catch {}
              }}
            />
            <p className="muted">
              Basic · 앞면은 음성, 뒷면은 영어 문장과 한글 번역
            </p>
            <button onClick={createCard} disabled={registering || !deck.trim()}>
              {registering ? "번역·음성 생성 및 등록 중…" : "Anki 카드 생성"}
            </button>
          </div>
          {selection.context && (
            <details>
              <summary>문맥 보기</summary>
              <p className="context">{selection.context}</p>
            </details>
          )}
          <p role="status" className="muted">
            {notice}
          </p>
        </>
      ) : (
        <div className="selection-empty">
          <span>“ ”</span>
          <p>
            선택한 문장이
            <br />
            여기에 남습니다.
          </p>
        </div>
      )}
      <p className="sidebar-foot">한 문장씩, 더 깊이 읽기.</p>
    </section>
  );
}
