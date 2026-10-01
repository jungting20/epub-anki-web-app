"use client";
import { useEffect, useRef, useState } from "react";
import type Book from "epubjs/types/book";
import type Rendition from "epubjs/types/rendition";
import type Contents from "epubjs/types/contents";
import type { Location } from "epubjs/types/rendition";
import type { NavItem } from "epubjs/types/navigation";
import type { BookInfo, ReadingSettings, SelectionInfo } from "@/lib/types";
import { PositionTracker, restorePosition } from "@/lib/positions";
async function withTimeout<T>(
  promise: Promise<T>,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), 15000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
function flatten(
  items: NavItem[],
  depth = 0,
): { href: string; label: string; depth: number }[] {
  return items.flatMap((item) => [
    { href: item.href, label: item.label.trim(), depth },
    ...flatten(item.subitems || [], depth + 1),
  ]);
}
function applySettings(rendition: Rendition, settings: ReadingSettings) {
  rendition.themes.default({
    body: {
      "font-family": 'Georgia, "Times New Roman", serif !important',
      "font-size": `${settings.fontSize}px !important`,
      "line-height": `${settings.lineHeight} !important`,
      color: `${settings.theme === "dark" ? "#e4dfd5" : "#2c332e"} !important`,
      background: `${settings.theme === "dark" ? "#1c2421" : "#fcfaf5"} !important`,
      padding: "32px 36px !important",
      "box-sizing": "border-box",
    },
    "p, li, div": {
      "font-size": "inherit !important",
      "line-height": "inherit !important",
    },
    "img, svg": { "max-width": "100% !important", height: "auto" },
    a: {
      color:
        settings.theme === "dark" ? "#9eceb6 !important" : "#38674f !important",
    },
    "::selection": { background: "#c7dbc2" },
  });
}
export default function EpubReader({
  book,
  settings,
  changeSettings,
  onSelection,
}: {
  book: BookInfo;
  settings: ReadingSettings;
  changeSettings: (s: ReadingSettings) => void;
  onSelection: (s: SelectionInfo) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const settingsPanel = useRef<HTMLDetailsElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const currentSettings = useRef(settings);
  currentSettings.current = settings;
  const selectionCallback = useRef(onSelection);
  selectionCallback.current = onSelection;
  const readyRef = useRef(false);
  const adjusting = useRef(false);
  const anchor = useRef<string | undefined>(undefined);
  const trackerRef = useRef<PositionTracker | undefined>(undefined);
  const [toc, setToc] = useState<ReturnType<typeof flatten>>([]);
  const [chapter, setChapter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sync, setSync] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [tocOpen, setTocOpen] = useState(false);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const panel = settingsPanel.current;
      if (panel && !panel.contains(event.target as Node)) panel.open = false;
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  useEffect(() => {
    let cancelled = false;
    let epub: Book | undefined;
    let opening: Promise<unknown> | undefined;
    let initialization: Promise<void> | undefined;
    let rendition: Rendition | undefined;
    let tracker: PositionTracker | undefined;
    const controller = new AbortController();
    const cleanupContents: (() => void)[] = [];
    readyRef.current = false;
    setLoading(true);
    setError("");
    const visibility = () => {
      if (document.visibilityState === "hidden") void tracker?.push();
    };
    const pagehide = () => {
      void tracker?.persist();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", pagehide);
    async function start() {
      try {
        const [{ default: ePub }, response, saved] = await Promise.all([
          import("epubjs"),
          fetch(`/api/books/${book.id}/file`, { signal: controller.signal }),
          restorePosition(book.id),
        ]);
        if (cancelled) return;
        if (!response.ok) throw new Error("EPUB 원본을 불러올 수 없습니다.");
        const bytes = await response.arrayBuffer();
        if (cancelled) return;
        epub = ePub(bytes);
        opening = Promise.all([epub.opened, epub.ready]);
        await withTimeout(
          opening,
          "EPUB을 해석하지 못했습니다. 파일 구조를 확인해주세요.",
        );
        if (cancelled) return;
        const navigation = flatten((await epub.loaded.navigation).toc);
        if (cancelled) return;
        setToc(navigation);
        // Sanitize before serialization; iframe sandbox additionally blocks all scripts.
        epub.spine.hooks.content.register((doc: Document) => {
          doc
            .querySelectorAll(
              'script, iframe, object, embed, form, base, meta[http-equiv="refresh"]',
            )
            .forEach((n) => n.remove());
          doc.querySelectorAll("*").forEach((element) => {
            for (const attr of Array.from(element.attributes))
              if (
                /^on/i.test(attr.name) ||
                /^(javascript|vbscript):/i.test(attr.value.trim())
              )
                element.removeAttribute(attr.name);
          });
          const policy = doc.createElement("meta");
          policy.setAttribute("http-equiv", "Content-Security-Policy");
          policy.setAttribute(
            "content",
            "default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob: data:; font-src blob: data:; media-src blob: data:; script-src 'none'; frame-src 'none'; form-action 'none'",
          );
          doc.head?.prepend(policy);
        });
        rendition = epub.renderTo(host.current!, {
          width: "100%",
          height: "100%",
          flow: "scrolled-doc",
          overflow: "scroll",
          manager: "default",
          spread: "none",
          allowScriptedContent: false,
        });
        renditionRef.current = rendition;
        applySettings(rendition, currentSettings.current);
        const chapterName = (href: string) =>
          navigation.find(
            (n) =>
              n.href.split("#")[0] === href.split("#")[0] ||
              n.href.split("#")[0].endsWith("/" + href.split("#")[0]),
          )?.label || href;
        rendition.hooks.content.register((contents: Contents) => {
          contents.overflowX("hidden");
          const capture = () => {
            if (cancelled) return;
            const selected = contents.window.getSelection();
            const text = selected?.toString().trim();
            if (!selected?.rangeCount || !text) return;
            const range = selected.getRangeAt(0);
            const element =
              range.startContainer.nodeType === 1
                ? (range.startContainer as Element)
                : range.startContainer.parentElement;
            const paragraph = element?.closest("p, li, blockquote") || element;
            const context = [
              paragraph?.previousElementSibling?.textContent,
              paragraph?.textContent,
              paragraph?.nextElementSibling?.textContent,
            ]
              .filter(Boolean)
              .join("\n")
              .slice(0, 6000);
            const href = epub?.spine.get(contents.sectionIndex)?.href || "";
            selectionCallback.current({
              text,
              bookId: book.id,
              title: book.title,
              chapter: chapterName(href),
              cfi: contents.cfiFromRange(range),
              context,
            });
          };
          let timer: ReturnType<typeof setTimeout>;
          const schedule = () => {
            clearTimeout(timer);
            timer = setTimeout(capture, 100);
          };
          contents.document.addEventListener("selectionchange", schedule);
          contents.document.addEventListener("pointerup", schedule);
          contents.document.addEventListener("touchend", schedule);
          cleanupContents.push(() => {
            clearTimeout(timer);
            contents.document.removeEventListener("selectionchange", schedule);
            contents.document.removeEventListener("pointerup", schedule);
            contents.document.removeEventListener("touchend", schedule);
          });
        });
        rendition.on("relocated", (location: Location) => {
          if (
            cancelled ||
            !readyRef.current ||
            adjusting.current ||
            !location.start?.cfi
          )
            return;
          anchor.current = location.start.cfi;
          setChapter(chapterName(location.start.href));
          tracker?.update(location.start.cfi);
        });
        rendition.on("displayError", (err: Error) => {
          if (!cancelled) setError("본문을 표시할 수 없습니다: " + err.message);
        });
        if (saved) {
          try {
            await withTimeout(
              rendition.display(saved.cfi),
              "저장된 위치를 열지 못했습니다.",
            );
          } catch {
            await rendition.display();
            if (!cancelled)
              setError("저장된 위치를 찾지 못해 책 처음을 열었습니다.");
          }
        } else
          await withTimeout(rendition.display(), "본문을 표시하지 못했습니다.");
        if (cancelled) return;
        // reportLocation drains the rendition queue after the restore display.
        await rendition.reportLocation();
        if (cancelled) return;
        tracker = new PositionTracker(
          book.id,
          (text) => {
            if (!cancelled) setSync(text);
          },
          saved,
        );
        trackerRef.current = tracker;
        anchor.current = saved?.cfi || rendition.location?.start?.cfi;
        setChapter(chapterName(rendition.location?.start?.href || ""));
        readyRef.current = true;
        setLoading(false);
        if (!saved && anchor.current) tracker.update(anchor.current);
      } catch (err) {
        if (!cancelled) {
          setLoading(false);
          setError(
            err instanceof Error ? err.message : "EPUB을 열지 못했습니다.",
          );
        }
      }
    }
    initialization = start();
    return () => {
      cancelled = true;
      readyRef.current = false;
      controller.abort();
      tracker?.dispose();
      trackerRef.current = undefined;
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", pagehide);
      cleanupContents.forEach((clean) => clean());
      // EPUB.js parsing isn't abortable. Keep its internal loading promises intact until
      // parsing settles; callbacks are already cancelled and this host is detached.
      if (epub) {
        const previous = epub;
        void Promise.all([initialization, opening, rendition?.started]).then(
          () => previous.destroy(),
          () => previous.destroy(),
        );
      }
      renditionRef.current = null;
      host.current?.replaceChildren();
    };
  }, [book.id, book.title, attempt]);
  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition || !readyRef.current) return;
    let cancelled = false;
    adjusting.current = true;
    const cfi = anchor.current;
    applySettings(rendition, settings);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (cfi) await rendition.display(cfi);
          await rendition.reportLocation();
        } catch {
          if (!cancelled)
            setError("읽기 설정을 적용하지 못했습니다. 다시 시도해주세요.");
        } finally {
          if (!cancelled) adjusting.current = false;
        }
      })();
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [settings]);
  async function navigate(target: string) {
    try {
      await renditionRef.current?.display(target);
      setTocOpen(false);
      if (settingsPanel.current) settingsPanel.current.open = false;
    } catch {
      setError("챕터를 열지 못했습니다.");
    }
  }
  return (
    <section className="reader">
      <div className="reader-heading">
        <div className="eyebrow">NOW READING</div>
        <h1>{book.title}</h1>
        <p>{book.author}</p>
      </div>
      <details
        className="reader-settings"
        ref={settingsPanel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.currentTarget.open = false;
            event.currentTarget.querySelector("summary")?.focus();
          }
        }}
      >
        <summary className="secondary">읽기 설정</summary>
        <section className="reading-controls" aria-label="읽기 설정">
          <div className="eyebrow">READING TOOLS</div>
          <div className="reader-toolbar">
            <button
              className="secondary"
              onClick={() => setTocOpen(!tocOpen)}
              aria-expanded={tocOpen}
            >
              목차
            </button>
            <label>
              글자{" "}
              <input
                aria-label="글자 크기"
                type="range"
                min="14"
                max="32"
                value={settings.fontSize}
                onChange={(e) =>
                  changeSettings({
                    ...settings,
                    fontSize: Number(e.target.value),
                  })
                }
              />
              <span>{settings.fontSize}</span>
            </label>
            <label>
              줄 간격{" "}
              <select
                aria-label="줄 간격"
                value={settings.lineHeight}
                onChange={(e) =>
                  changeSettings({
                    ...settings,
                    lineHeight: Number(e.target.value),
                  })
                }
              >
                {[1.4, 1.6, 1.8, 2, 2.2, 2.4].map((n) => (
                  <option value={n} key={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary"
              onClick={() =>
                changeSettings({
                  ...settings,
                  theme: settings.theme === "light" ? "dark" : "light",
                })
              }
            >
              {settings.theme === "light" ? "어두운 테마" : "밝은 테마"}
            </button>
          </div>
          {tocOpen && (
            <nav className="toc" aria-label="목차">
              {toc.length ? (
                toc.map((item, i) => (
                  <button
                    className="text-button"
                    key={item.href + i}
                    style={{ paddingLeft: 12 + item.depth * 14 }}
                    onClick={() => navigate(item.href)}
                  >
                    {item.label}
                  </button>
                ))
              ) : (
                <p>이 책에는 목차가 없습니다.</p>
              )}
            </nav>
          )}
        </section>
      </details>
      {error && (
        <div role="alert" className="error reader-error">
          {error}
          <button
            className="secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            다시 열기
          </button>
        </div>
      )}
      <div className="epub-area">
        <div className="epub-host" ref={host} />
        {loading && (
          <div className="reader-loading" role="status">
            책을 펼치고 있습니다…
          </div>
        )}
      </div>
      <footer className="reader-footer">
        <button
          className="text-button"
          disabled={loading}
          onClick={() => {
            void renditionRef.current
              ?.prev()
              .catch(() => setError("이전 챕터를 열지 못했습니다."));
          }}
        >
          ← 이전
        </button>
        <div>
          <span>{chapter}</span>
          <small role="status">{sync || "읽기 위치 준비됨"}</small>
        </div>
        <button
          className="text-button"
          disabled={loading}
          onClick={() => {
            void renditionRef.current
              ?.next()
              .catch(() => setError("다음 챕터를 열지 못했습니다."));
          }}
        >
          다음 →
        </button>
      </footer>
    </section>
  );
}
