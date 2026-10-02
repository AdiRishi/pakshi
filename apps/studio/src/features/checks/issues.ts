import type { Draft } from "@repo/contracts/draft";
import { BlockId, type FormId, type PageId } from "@repo/contracts/ids";
import { PropPath, type Target } from "@repo/contracts/ops";
import type { CheckIssue } from "@repo/contracts/publishing";
import { formsUsedBy } from "@repo/domain/document";
import { Schema } from "effect";

import { describeIssue } from "@/features/approvals/describe";

/**
 * Where a person fixes an issue: a block or one of its fields on a page of
 * the draft, where `page` is null for the header and footer, which every page
 * shows; a page's own settings; the draft's menus and redirects; or the
 * site's forms and email settings.
 */
export type FixPlace =
  | {
      readonly kind: "canvas";
      readonly page: PageId | null;
      readonly target: Target;
      readonly block: BlockId;
      readonly path: PropPath | null;
    }
  | { readonly kind: "page"; readonly page: PageId }
  | { readonly kind: "pages" }
  | { readonly kind: "forms" };

/** The first block in the draft showing a form, served pages first, then the header and footer. */
const formBlock = (draft: Draft, form: FormId) => {
  const holders = [
    ...Object.values(draft.pages).map((page) => ({ page: page.id, blocks: page.blocks })),
    { page: null, blocks: draft.parts.blocks },
  ];
  for (const holder of holders)
    for (const [id, block] of Object.entries(holder.blocks))
      if (formsUsedBy({ [id]: block }).has(form))
        return { page: holder.page, block: BlockId.make(id) };
  return null;
};

/** Where an issue is fixed, or null when the draft no longer shows what it's about. */
export const fixPlaceOf = (issue: CheckIssue, draft: Draft): FixPlace | null => {
  switch (issue._tag) {
    case "NoFormEmails":
      return { kind: "forms" };
    case "MissingConsent":
    case "UnlabelledField": {
      // A form is edited in the settings of a block that shows it.
      const found = formBlock(draft, issue.form);
      if (found === null) return null;
      return {
        kind: "canvas",
        page: found.page,
        target: found.page ?? "site",
        block: found.block,
        path: null,
      };
    }
    case "MissingMeta":
      return issue.place.target === "site"
        ? { kind: "pages" }
        : { kind: "page", page: issue.place.target };
    case "BrokenLink":
    case "LinkWithoutText":
    case "Incomplete":
    case "Placeholder": {
      if (issue.block === null) return { kind: "pages" };
      const { target } = issue.place;
      return {
        kind: "canvas",
        page: target === "site" ? null : target,
        target,
        block: issue.block.id,
        path: issue._tag === "BrokenLink" ? null : issue.path,
      };
    }
  }
};

/** A block, or one of its fields, that the editor selects once its page opens. */
export const ShownBlock = Schema.Struct({ block: BlockId, path: Schema.optionalKey(PropPath) });
export type ShownBlock = typeof ShownBlock.Type;

/**
 * The page an issue is fixed on, with the block or field to select there,
 * for a link from outside the editor. Null when no one page has it: it's in
 * the header, footer or menus, or in a form.
 */
export const issuePage = (
  issue: CheckIssue,
): { readonly page: PageId; readonly show?: ShownBlock } | null => {
  switch (issue._tag) {
    case "NoFormEmails":
    case "MissingConsent":
    case "UnlabelledField":
      return null;
    case "MissingMeta":
      return issue.place.target === "site" ? null : { page: issue.place.target };
    case "BrokenLink":
    case "LinkWithoutText":
    case "Incomplete":
    case "Placeholder": {
      const { target } = issue.place;
      if (target === "site" || issue.block === null) return null;
      return {
        page: target,
        show:
          issue._tag === "BrokenLink"
            ? { block: issue.block.id }
            : { block: issue.block.id, path: issue.path },
      };
    }
  }
};

/** How many issues "Fix all" names in its message. Pakshi reads every one with check_draft. */
const named = 8;

/** What "Fix all" sends Pakshi on the person's behalf: the issues it can fix, as the checks word them. */
export const fixAllMessage = (issues: ReadonlyArray<CheckIssue>) =>
  [
    "Fix everything the checks found that you can:",
    ...issues.slice(0, named).map((issue) => `- ${describeIssue(issue).text}`),
    ...(issues.length > named ? [`- And ${issues.length - named} more`] : []),
  ].join("\n");
