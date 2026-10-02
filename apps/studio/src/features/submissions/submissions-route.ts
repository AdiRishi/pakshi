import { AppRequestError } from "@repo/contracts/app";
import { FormId, type SiteId } from "@repo/contracts/ids";
import type { QueryClient } from "@tanstack/react-query";
import { Schema } from "effect";

import { loadSiteTab } from "../sites/site-route";
import { siteEntriesQuery } from "./queries";

/** A submissions address's search: the form shown, and what its entries are searched for. */
export const SubmissionsSearch = Schema.Struct({
  form: Schema.optionalKey(FormId),
  q: Schema.optionalKey(Schema.String),
});
export type SubmissionsSearch = typeof SubmissionsSearch.Type;

/**
 * Loads a site's forms and entries, or word that the person works on the site
 * but may not read its entries.
 */
export const loadSubmissions = (queryClient: QueryClient, site: SiteId) =>
  loadSiteTab(queryClient, site, async () => {
    try {
      await queryClient.query(siteEntriesQuery(site));
      return { forbidden: false };
    } catch (error) {
      if (!(error instanceof AppRequestError && error.code === "forbidden")) throw error;
      return { forbidden: true };
    }
  });
