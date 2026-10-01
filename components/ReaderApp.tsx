"use client";
import { useEffect, useState } from "react";
import type { BookInfo, ReadingSettings, SelectionInfo } from "@/lib/types";
import ActionSidebar from "./ActionSidebar";
import BookSidebar from "./BookSidebar";
import EpubReader from "./EpubReader";
import { syncPending } from "@/lib/positions";
const defaults: ReadingSettings = {
  fontSize: 19,
  lineHeight: 1.8,
  theme: "light",
};
export default function ReaderApp() {
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [book, setBook] = useState<BookInfo>();
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [settings, setSettings] = useState(defaults);
  const [ready, setReady] = useState(false);
  const [left, setLeft] = useState(true);
  const [right, setRight] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    try {
      const res = await fetch("/api/books", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const list = (await res.json()) as BookInfo[];
      setBooks(list);
      setError("");
      setBook(
        (previous) =>
          previous ||
          list.find((b) => b.id === localStorage.getItem("last-book")) ||
          list[0],
      );
    } catch {
      setError(
        "책 목록을 불러올 수 없습니다. 서버 연결을 확인하고 새로고침해주세요.",
      );
    }
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("reading-settings") || "null",
      );
      if (saved)
        setSettings({
          fontSize: Math.min(32, Math.max(14, Number(saved.fontSize) || 19)),
          lineHeight: Math.min(
            2.4,
            Math.max(1.3, Number(saved.lineHeight) || 1.8),
          ),
          theme: saved.theme === "dark" ? "dark" : "light",
        });
    } catch {}
    setReady(true);
    void load();
    const retry = () => {
      void syncPending().catch(() => {});
    };
    const timer = setInterval(retry, 8000);
    window.addEventListener("online", retry);
    retry();
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem("reading-settings", JSON.stringify(settings));
      } catch {}
    }
  }, [settings, ready]);
  function select(next: BookInfo) {
    if (next.id === book?.id) return;
    setSelection(null);
    setBook(next);
    try {
      localStorage.setItem("last-book", next.id);
    } catch {}
  }
  async function upload(file: File) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/books", { method: "POST", body: form });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "업로드 실패");
      await load();
      select(result.book);
      setNotice(
        result.duplicate
          ? "이미 업로드한 책입니다. 기존 책을 열었습니다."
          : "책을 업로드했습니다.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={`app ${settings.theme}`}>
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">l</span>leaf
          <span className="brand-caption">ENGLISH READING ROOM</span>
        </div>
        <div className="header-actions">
          <button
            className="secondary"
            aria-expanded={left}
            onClick={() => setLeft(!left)}
          >
            {left ? "문장 접기" : "문장 펼치기"}
          </button>
          <button
            className="secondary"
            aria-expanded={right}
            onClick={() => setRight(!right)}
          >
            {right ? "책장 접기" : "책장 펼치기"}
          </button>
        </div>
      </header>
      {notice && (
        <div role="status" className="notice">
          {notice}
          <button
            className="text-button"
            onClick={() => setNotice("")}
            aria-label="알림 닫기"
          >
            ×
          </button>
        </div>
      )}
      <div
        className={`workspace ${left ? "" : "hide-left"} ${right ? "" : "hide-right"}`}
      >
        {left && (
          <aside className="sidebar actions" aria-label="문장 액션">
            <ActionSidebar
              selection={selection}
              clear={() => setSelection(null)}
            />
          </aside>
        )}
        <main className="reading-space">
          {ready && book ? (
            <EpubReader
              key={book.id}
              book={book}
              settings={settings}
              changeSettings={setSettings}
              onSelection={setSelection}
            />
          ) : (
            <div className="welcome">
              <div className="eyebrow">A LITTLE EVERY DAY</div>
              <h1>
                영어로 읽는,
                <br />
                나만의 조용한 시간.
              </h1>
              <p>
                오른쪽 책장에 EPUB을 업로드하세요.
                <br />
                문장을 선택하고, 읽던 곳에서 이어 읽으세요.
              </p>
              <div className="welcome-rule" />
              <span>YOUR NEXT CHAPTER STARTS HERE</span>
            </div>
          )}
        </main>
        {right && (
          <BookSidebar
            books={books}
            current={book?.id}
            select={select}
            upload={upload}
            busy={busy}
            error={error}
            reload={load}
          />
        )}
      </div>
    </div>
  );
}
