import { AppRequestError } from "@repo/contracts/app";
import { DraftId, PageId, SiteId, SubmissionId } from "@repo/contracts/ids";
import { notFound } from "@tanstack/react-router";
import { Option, Schema } from "effect";

const decodeOrNotFound = <S extends Schema.Decoder<unknown>>(
  schema: S,
  value: string,
): S["Type"] => {
  const decoded = Schema.decodeOption(schema)(value);
  if (Option.isNone(decoded)) throw notFound();
  return decoded.value;
};

/** A site route's params: an address with a malformed site ID is a page that doesn't exist. */
export const siteParams = {
  parse: (params: { readonly siteId: string }) => ({
    siteId: decodeOrNotFound(SiteId, params.siteId),
  }),
  stringify: (params: { readonly siteId: SiteId }) => ({ siteId: params.siteId }),
};

export const draftParams = {
  parse: (params: { readonly draftId: string }) => ({
    draftId: decodeOrNotFound(DraftId, params.draftId),
  }),
  stringify: (params: { readonly draftId: DraftId }) => ({ draftId: params.draftId }),
};

export const pageParams = {
  parse: (params: { readonly pageId: string }) => ({
    pageId: decodeOrNotFound(PageId, params.pageId),
  }),
  stringify: (params: { readonly pageId: PageId }) => ({ pageId: params.pageId }),
};

export const submissionParams = {
  parse: (params: { readonly submissionId: string }) => ({
    submissionId: decodeOrNotFound(SubmissionId, params.submissionId),
  }),
  stringify: (params: { readonly submissionId: SubmissionId }) => ({
    submissionId: params.submissionId,
  }),
};

/** Loads a site's data, treating a site the person can't reach as a page that doesn't exist. */
export const loadSite = async <A>(load: () => Promise<A>) => {
  try {
    return await load();
  } catch (error) {
    if (error instanceof AppRequestError && error.code === "not_found") throw notFound();
    throw error;
  }
};
