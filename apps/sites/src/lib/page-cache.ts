import type { ReleaseId } from "@repo/contracts/ids";

const lastPage = 1000;

/**
 * Which page of a blog list a request asks for, from `?page=N`. Anything but
 * a whole number from 2 to 1000 reads as the first page, so the page cache
 * holds at most a thousand copies of an address however it's asked for.
 */
export const pageNumberOf = (url: URL) => {
  const asked = url.searchParams.get("page");
  if (asked === null || !/^[1-9][0-9]{0,3}$/.test(asked)) return 1;
  const number = Number(asked);
  return number <= lastPage ? number : 1;
};

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
