import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import path from "node:path";
const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  processEntities: false,
});
function parse(xml: string) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true)
    throw new Error("EPUB XML 구조가 올바르지 않습니다.");
  return parser.parse(xml);
}
export async function inspectEpub(bytes: Buffer) {
  try {
    const zip = await JSZip.loadAsync(bytes);
    // ZIP central-directory sizes are checked before decompressing resources.
    let total = 0;
    for (const entry of Object.values(zip.files)) {
      const size =
        (entry as unknown as { _data?: { uncompressedSize: number } })._data
          ?.uncompressedSize || 0;
      total += size;
      if (size > 30 * 1024 * 1024 || total > 200 * 1024 * 1024)
        throw new Error("EPUB 압축 해제 크기가 제한을 초과했습니다.");
    }
    if (
      (await zip.file("mimetype")?.async("string"))?.trim() !==
      "application/epub+zip"
    )
      throw new Error("EPUB mimetype이 없습니다.");
    const container = parse(
      (await zip.file("META-INF/container.xml")?.async("string")) || "",
    );
    const roots = container.container?.rootfiles?.rootfile;
    const root = Array.isArray(roots) ? roots[0] : roots;
    const opfPath = root?.["@_full-path"];
    if (typeof opfPath !== "string")
      throw new Error("EPUB 패키지를 찾을 수 없습니다.");
    const pkg = parse((await zip.file(opfPath)?.async("string")) || "").package;
    const items = [pkg?.manifest?.item].flat().filter(Boolean);
    const spine = [pkg?.spine?.itemref].flat().filter(Boolean);
    if (!spine.length || !items.length)
      throw new Error("EPUB 본문이 없습니다.");
    for (const ref of spine) {
      const item = items.find((i) => i["@_id"] === ref["@_idref"]);
      if (
        !item ||
        !zip.file(
          path.posix.normalize(
            path.posix.join(
              path.posix.dirname(opfPath),
              decodeURIComponent(item["@_href"].split("#")[0]),
            ),
          ),
        )
      )
        throw new Error("EPUB 본문 파일이 누락되었습니다.");
    }
    function value(v: unknown): string {
      if (Array.isArray(v)) return value(v[0]);
      if (v && typeof v === "object")
        return value((v as Record<string, unknown>)["#text"]);
      return typeof v === "string" ? v.trim().slice(0, 500) : "";
    }
    return {
      title: value(pkg.metadata?.title) || "제목 없는 책",
      author: value(pkg.metadata?.creator) || "저자 미상",
    };
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message.startsWith("EPUB")
        ? error.message
        : "올바른 EPUB 파일이 아닙니다.",
    );
  }
}

export async function extractCover(
  bytes: Buffer,
): Promise<{ bytes: Buffer; mime: string } | null> {
  const zip = await JSZip.loadAsync(bytes);
  const container = parse(
    await zip.file("META-INF/container.xml")!.async("string"),
  );
  const roots = [container.container.rootfiles.rootfile].flat();
  const opfPath = roots[0]["@_full-path"];
  const pkg = parse(await zip.file(opfPath)!.async("string")).package;
  const items = [pkg.manifest.item].flat();
  const meta = [pkg.metadata.meta].flat().filter(Boolean);
  const coverId = meta.find((m) => m["@_name"] === "cover")?.["@_content"];
  const cover =
    items.find((i) =>
      String(i["@_properties"] || "")
        .split(/\s+/)
        .includes("cover-image"),
    ) || items.find((i) => coverId && i["@_id"] === coverId);
  // Serve raster covers only; unrecognized or missing covers use the built-in fallback.
  if (
    !cover ||
    !["image/jpeg", "image/png", "image/gif", "image/webp"].includes(
      cover["@_media-type"],
    )
  )
    return null;
  const entry = zip.file(
    path.posix.normalize(
      path.posix.join(
        path.posix.dirname(opfPath),
        decodeURIComponent(cover["@_href"]),
      ),
    ),
  );
  if (!entry) return null;
  const result = await entry.async("nodebuffer");
  if (result.length > 5 * 1024 * 1024) return null;
  return { bytes: result, mime: cover["@_media-type"] };
}
