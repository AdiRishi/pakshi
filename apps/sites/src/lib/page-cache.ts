import { pageNumberOf } from "@repo/contracts/collections";
import type { ReleaseId } from "@repo/contracts/ids";

/**
 * The Workers cache key for a page: the host, the site's release, this
 * Worker's version and the address, plus the page number past the first. A
 * page names its own address, so each host gets its own copy, and a publish
 * or a deploy changes the key instead of needing a purge. The page
 * number is the one query parameter a cached page reads, so it's the only one
 * in the key.
 */
export const pageCacheKey = (request: {
  readonly url: URL;
  readonly release: ReleaseId;
  readonly worker: string;
}) => {
  const { host, pathname } = request.url;
  const number = pageNumberOf(request.url);
  const page = number === 1 ? "" : `?page=${number}`;
  return `https://page-cache.pakshi/${host}/${request.release}/${request.worker}${pathname}${page}`;
};
