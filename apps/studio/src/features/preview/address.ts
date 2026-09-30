import { PagePath } from "@repo/contracts/page";
import { mediaSegment } from "@repo/contracts/studio";
import { Option, Schema } from "effect";

/**
 * What the rest of a preview's or review's address asks for: one of its
 * images, a page by its address on the site, or nothing it can serve.
 */
export const requested = (rest: string) => {
  if (rest.startsWith(`${mediaSegment}/`)) return { kind: "media" } as const;
  const path = Schema.decodeOption(PagePath)(`/${rest.replace(/\/$/, "")}`);
  return Option.isSome(path) ? ({ kind: "page", path: path.value } as const) : null;
};
