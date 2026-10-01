"use client";
import { useState } from "react";
import type { SelectionInfo } from "@/lib/types";
export default function ActionSidebar({
  selection,
  clear,
}: {
  selection: SelectionInfo | null;
  clear: () => void;
}) {
  const [notice, setNotice] = useState("");
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
