import { AppRequestError } from "@repo/contracts/app";
import { FormId, type SiteId } from "@repo/contracts/ids";
import type { QueryClient } from "@tanstack/react-query";
import { Schema } from "effect";

import { siteSettingsQuery } from "../sites/queries";
import { loadSite } from "../sites/site-route";
import { siteEntriesQuery } from "./queries";

/** A submissions address's search: the form shown, and what its entries are searched for. */
export const SubmissionsSearch = Schema.Struct({
  form: Schema.optionalKey(FormId),
  q: Schema.optionalKey(Schema.String),
});
export type SubmissionsSearch = typeof SubmissionsSearch.Type;

/**
 * Loads a site's forms and entries, or, for someone who works on the site but
 * may not read its entries, the site's name to say so with.
 */
export const loadSubmissions = (queryClient: QueryClient, site: SiteId) =>
  loadSite(async () => {
    try {
      await queryClient.query(siteEntriesQuery(site));
      return { forbidden: null };
    } catch (error) {
      if (!(error instanceof AppRequestError && error.code === "forbidden")) throw error;
      const settings = await queryClient.query(siteSettingsQuery(site));
      return { forbidden: settings.site };
    }
  });
