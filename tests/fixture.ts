import JSZip from "jszip";
import { mkdir, writeFile } from "node:fs/promises";
export async function fixture(title = "The Quiet Garden") {
  const zip = new JSZip();
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
  );
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0"?><package version="3.0" unique-identifier="id" xmlns="http://www.idpf.org/2007/opf"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:${title.replaceAll(" ", "-")}</dc:identifier><dc:title>${title}</dc:title><dc:creator>Leaf Test Author</dc:creator><dc:language>en</dc:language><meta property="dcterms:modified">2026-10-01T00:00:00Z</meta></metadata><manifest><item id="cover" href="cover.png" media-type="image/png" properties="cover-image"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/><item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>`,
  );
  zip.file(
    "OEBPS/cover.png",
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXWQAAAAASUVORK5CYII=",
      "base64",
    ),
  );
  zip.file(
    "OEBPS/nav.xhtml",
    `<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>Contents</title></head><body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">Chapter One</a></li><li><a href="ch2.xhtml">Chapter Two</a></li></ol></nav></body></html>`,
  );
  for (let ch = 1; ch <= 2; ch++)
    zip.file(
      `OEBPS/ch${ch}.xhtml`,
      `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${ch}</title></head><body><h1>Chapter ${ch === 1 ? "One" : "Two"}</h1><script>parent.__epubScriptRan = true;</script>${Array.from({ length: 70 }, (_, i) => `<p id="p${i}">Chapter ${ch}, paragraph ${i}. The morning light fell softly across the garden. Every small step brings us closer to understanding the world. She opened her book and began to read with quiet curiosity.</p>`).join("")}</body></html>`,
    );
  for (const file of Object.values(zip.files))
    file.date = new Date("2026-01-01T00:00:00Z");
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
async function main() {
  await mkdir("tests/fixtures", { recursive: true });
  await writeFile("tests/fixtures/garden.epub", await fixture());
  await writeFile(
    "tests/fixtures/river.epub",
    await fixture("Along the River"),
  );
  await writeFile("tests/fixtures/invalid.epub", "Not a ZIP file");
}
if (process.argv[1]?.endsWith("fixture.ts")) void main();
