import type Rendition from "epubjs/types/rendition";
import type { Location } from "epubjs/types/rendition";

// EPUB.js resolves reportLocation() when it queues a RAF, before location/relocated update.
// Wait for the event so callers can keep position tracking paused until it is reported.
export async function reportedLocation(
  rendition: Rendition,
): Promise<Location> {
  let receive: (location: Location) => void = () => {};
  let timer: ReturnType<typeof setTimeout> | undefined;
  const location = new Promise<Location>((resolve, reject) => {
    receive = resolve;
    rendition.once("relocated", receive);
    timer = setTimeout(
      () => reject(new Error("읽기 위치 확인 시간이 초과됐습니다.")),
      15000,
    );
    rendition.reportLocation().catch(reject);
  });
  try {
    return await location;
  } finally {
    clearTimeout(timer);
    rendition.off("relocated", receive);
  }
}
