"use client";
import type { BookInfo } from "@/lib/types";
export default function BookSidebar({
  books,
  current,
  select,
  upload,
  busy,
  error,
  reload,
}: {
  books: BookInfo[];
  current?: string;
  select: (b: BookInfo) => void;
  upload: (f: File) => void;
  busy: boolean;
  error: string;
  reload: () => void;
}) {
  return (
    <aside className="sidebar library" aria-label="책 목록">
      <div className="eyebrow">YOUR LIBRARY</div>
      <h2>
        나의 책장 <small>{books.length}</small>
      </h2>
      <label className={`upload ${busy ? "disabled" : ""}`}>
        {busy ? "업로드 중…" : "+ EPUB 업로드"}
        <input
          aria-label="EPUB 업로드"
          type="file"
          accept=".epub,application/epub+zip"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) upload(file);
          }}
        />
      </label>
      <p className="muted small">EPUB 파일 · 최대 50MB</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="book-list">
        {books.map((book, index) => (
          <button
            className={`book-card ${current === book.id ? "active" : ""}`}
            key={book.id}
            data-book-id={book.id}
            aria-pressed={current === book.id}
            onClick={() => select(book)}
          >
            <span
              className={`book-cover cover-${index % 3}`}
              aria-hidden="true"
            >
              {book.title.slice(0, 1)}
              <img
                src={`/api/books/${book.id}/cover`}
                alt=""
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </span>
            <span className="book-meta">
              <strong>{book.title}</strong>
              <span>{book.author}</span>
              {current === book.id && <em>읽는 중</em>}
            </span>
          </button>
        ))}
      </div>
      {!books.length && (
        <p className="muted">
          첫 EPUB을 업로드해
          <br />
          책장을 채워보세요.
        </p>
      )}
      <button className="text-button" onClick={reload}>
        목록 새로고침
      </button>
    </aside>
  );
}
