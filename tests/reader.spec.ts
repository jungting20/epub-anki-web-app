import { test, expect, type Page } from "@playwright/test";
import { fixture } from "./fixture";
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.stack || error.message));
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});
async function localPosition(page: Page, id: string) {
  return page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const r = indexedDB.open("epub-reader", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    return new Promise<
      { cfi: string; updatedAt: number; synced: boolean } | undefined
    >((resolve) => {
      const r = db.transaction("positions").objectStore("positions").get(id);
      r.onsuccess = () => {
        resolve(r.result);
        db.close();
      };
    });
  }, id);
}
async function ready(page: Page) {
  await expect(page.locator(".reader-loading")).toHaveCount(0);
  await expect(page.locator(".epub-host iframe")).toBeVisible();
}
async function scroll(page: Page, top: number) {
  await page.locator(".epub-host .epub-container").evaluate((node, y) => {
    node.scrollTop = y;
    node.dispatchEvent(new Event("scroll"));
  }, top);
}
test("EPUB selection, navigation, restore, and offline synchronization", async ({
  page,
  request,
  context,
}) => {
  const upload = await request.post("/api/books", {
    multipart: {
      file: {
        name: "garden.epub",
        mimeType: "application/epub+zip",
        buffer: await fixture(),
      },
    },
  });
  expect(upload.ok()).toBeTruthy();
  const { book } = await upload.json();
  const cover = await request.get(`/api/books/${book.id}/cover`);
  expect(cover.ok()).toBeTruthy();
  expect(cover.headers()["content-type"]).toBe("image/png");
  const duplicate = await request.post("/api/books", {
    multipart: {
      file: {
        name: "garden.epub",
        mimeType: "application/epub+zip",
        buffer: await fixture(),
      },
    },
  });
  expect((await duplicate.json()).duplicate).toBe(true);
  const second = await request.post("/api/books", {
    multipart: {
      file: {
        name: "river.epub",
        mimeType: "application/epub+zip",
        buffer: await fixture("Along the River"),
      },
    },
  });
  const river = (await second.json()).book;
  await page.goto("/");
  await page.locator(`[data-book-id="${book.id}"]`).click();
  await ready(page);
  expect(
    await page.evaluate(
      () =>
        (window as unknown as { __epubScriptRan?: boolean }).__epubScriptRan,
    ),
  ).toBeUndefined();
  await expect(page.locator(".epub-host iframe")).toHaveAttribute(
    "sandbox",
    "allow-same-origin",
  );
  await page
    .locator(".epub-host iframe")
    .evaluate((frame: HTMLIFrameElement) => {
      const doc = frame.contentDocument!;
      const p = doc.querySelector("p")!;
      const range = doc.createRange();
      range.selectNodeContents(p);
      const selection = frame.contentWindow!.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      doc.dispatchEvent(new Event("selectionchange"));
    });
  await expect(page.locator("blockquote")).toContainText("morning light");
  await page.getByRole("heading", { name: "문장 수집" }).click();
  await expect(page.locator("blockquote")).toContainText("morning light");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "문장 복사" }).click();
  await expect(page.getByText("복사했습니다.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    "morning light",
  );
  await page.getByRole("button", { name: "선택 초기화" }).click();
  await expect(page.locator("blockquote")).toHaveCount(0);
  await page.locator(".reader-settings > summary").click();
  await page.getByRole("button", { name: "목차", exact: true }).click();
  await page.getByRole("button", { name: "Chapter Two", exact: true }).click();
  await expect(page.locator(".reader-footer")).toContainText("Chapter Two");
  await scroll(page, 1800);
  await expect
    .poll(async () => (await localPosition(page, book.id))?.cfi)
    .toContain("epubcfi(");
  await expect
    .poll(async () => (await localPosition(page, book.id))?.synced)
    .toBe(true);
  const before = (await localPosition(page, book.id))!;
  await page.locator(".reader-settings > summary").click();
  await page.locator('input[aria-label="글자 크기"]').fill("25");
  await page.getByLabel("줄 간격").selectOption("2");
  await page.getByRole("button", { name: "어두운 테마" }).click();
  await expect(page.locator(".app")).toHaveClass(/dark/);
  await page.waitForTimeout(1000);
  // The same text CFI anchor is used for layout changes, not a pixel offset.
  const changed = (await localPosition(page, book.id))!;
  expect(changed.cfi.split("/1:")[0]).toBe(before.cfi.split("/1:")[0]);
  await page.reload();
  await ready(page);
  await expect(page.getByLabel("글자 크기")).toHaveValue("25");
  await expect(page.getByLabel("줄 간격")).toHaveValue("2");
  await expect(page.locator(".reader-footer")).toContainText("Chapter Two");
  await expect
    .poll(async () => (await localPosition(page, book.id))?.cfi)
    .toBe(changed.cfi);
  await page.locator(`[data-book-id="${river.id}"]`).click();
  await ready(page);
  await page.locator(`[data-book-id="${book.id}"]`).click();
  await ready(page);
  await expect(page.locator(".reader-footer")).toContainText("Chapter Two");
  await page.route("**/position", (route) =>
    route.request().method() === "PUT"
      ? route.fulfill({ status: 503, body: "{}" })
      : route.continue(),
  );
  await scroll(page, 3600);
  await expect
    .poll(async () => (await localPosition(page, book.id))?.synced)
    .toBe(false);
  const offline = (await localPosition(page, book.id))!;
  expect(offline.cfi).not.toBe(changed.cfi);
  await page.reload();
  await ready(page);
  await expect
    .poll(async () => (await localPosition(page, book.id))?.cfi)
    .toBe(offline.cfi);
  await page.unroute("**/position");
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(async () => (await localPosition(page, book.id))?.synced, {
      timeout: 15000,
    })
    .toBe(true);
  const server = await (
    await request.get(`/api/books/${book.id}/position`)
  ).json();
  expect(server.cfi).toBe(offline.cfi);
  // Older server requests must not overwrite the latest revision.
  await request.put(`/api/books/${book.id}/position`, {
    data: { ...server, cfi: before.cfi, updatedAt: server.updatedAt - 10 },
  });
  expect(
    (await (await request.get(`/api/books/${book.id}/position`)).json()).cfi,
  ).toBe(offline.cfi);
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page.locator(".app")).toBeVisible();
  await page.getByRole("button", { name: "문장 접기" }).click();
  await page.getByRole("button", { name: "책장 접기" }).click();
  await expect(page.locator(".actions")).toHaveCount(0);
  await expect(page.locator(".library")).toHaveCount(0);
});
test("invalid upload leaves library unchanged and is shown in UI", async ({
  page,
  request,
}) => {
  const before = await (await request.get("/api/books")).json();
  await page.goto("/");
  await page.getByLabel("EPUB 업로드", { exact: true }).setInputFiles({
    name: "invalid.epub",
    mimeType: "application/epub+zip",
    buffer: Buffer.from("broken"),
  });
  await expect(page.locator(".library [role=alert]")).toContainText(
    "올바른 EPUB",
  );
  expect(await (await request.get("/api/books")).json()).toEqual(before);
  const res = await request.post("/api/books", {
    multipart: {
      file: {
        name: "large.epub",
        mimeType: "application/epub+zip",
        buffer: Buffer.alloc(51 * 1024 * 1024),
      },
    },
  });
  expect(res.status()).toBe(413);
});
test("upload through the UI opens the book, touch selection persists, rapid switches stay isolated", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByLabel("EPUB 업로드", { exact: true }).setInputFiles({
    name: "willow.epub",
    mimeType: "application/epub+zip",
    buffer: await fixture("Under the Willow"),
  });
  await expect(page.locator(".reader-heading h1")).toHaveText(
    "Under the Willow",
  );
  await ready(page);
  await page
    .locator(".epub-host iframe")
    .evaluate((frame: HTMLIFrameElement) => {
      const doc = frame.contentDocument!;
      const range = doc.createRange();
      range.selectNodeContents(doc.querySelector("p")!);
      const selection = frame.contentWindow!.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      doc.dispatchEvent(new Event("touchend"));
    });
  await expect(page.locator("blockquote")).toContainText("morning light");
  const books = await (await request.get("/api/books")).json();
  const garden = books.find(
    (b: { title: string }) => b.title === "The Quiet Garden",
  );
  const river = books.find(
    (b: { title: string }) => b.title === "Along the River",
  );
  await page.route(`**/books/${garden.id}/file`, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.continue().catch(() => {});
  });
  await page.locator(`[data-book-id="${garden.id}"]`).click();
  await expect(page.locator("blockquote")).toHaveCount(0);
  await page.locator(`[data-book-id="${river.id}"]`).click();
  await ready(page);
  await page.waitForTimeout(1000);
  await expect(page.locator(".reader-heading h1")).toHaveText(
    "Along the River",
  );
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: "test-results/ipad-width.png" });
});
