import type { EntryId, FormId, SiteId } from "@repo/contracts/ids";
import type { EntryCursor } from "@repo/contracts/studio";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { getFormEntries, getFormEntry, getSiteEntries } from "./functions";

export const siteEntriesQuery = (site: SiteId) =>
  queryOptions({
    queryKey: ["sites", site, "entries"],
    queryFn: () => getSiteEntries({ data: { site } }),
  });

export const formEntriesQuery = (site: SiteId, form: FormId, search: string | null) =>
  infiniteQueryOptions({
    queryKey: ["sites", site, "entries", form, search],
    queryFn: ({ pageParam }: { readonly pageParam: EntryCursor | null }) =>
      getFormEntries({ data: { site, form, search, before: pageParam } }),
    initialPageParam: null,
    getNextPageParam: (page): EntryCursor | undefined => {
      const last = page.entries.at(-1);
      return page.more && last !== undefined
        ? { receivedAt: last.receivedAt, id: last.id }
        : undefined;
    },
  });

export const formEntryQuery = (site: SiteId, entry: EntryId) =>
  queryOptions({
    queryKey: ["sites", site, "entry", entry],
    queryFn: () => getFormEntry({ data: { site, entry } }),
  });
