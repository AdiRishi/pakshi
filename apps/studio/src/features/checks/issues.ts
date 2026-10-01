import type { Draft } from "@repo/contracts/draft";
import { BlockId, type FormId, type PageId } from "@repo/contracts/ids";
import type { PropPath, Target } from "@repo/contracts/ops";
import type { CheckIssue } from "@repo/contracts/publishing";
import { formsUsedBy } from "@repo/domain/document";

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

/** An issue's key, the same each time the checks find it, so it can be named in an address. */
export const issueKey = (issue: CheckIssue) => {
  switch (issue._tag) {
    case "NoFormEmails":
    case "MissingConsent":
      return `${issue._tag}:${issue.form}`;
    case "UnlabelledField":
      return `${issue._tag}:${issue.form}:${issue.field}`;
    case "MissingMeta":
      return `${issue._tag}:${issue.place.target}:${issue.field}`;
    case "BrokenLink":
      return `${issue._tag}:${issue.place.target}:${issue.block?.id ?? issue.field}:${issue.page}`;
    case "Incomplete":
    case "Placeholder":
    case "LinkWithoutText":
      return `${issue._tag}:${issue.place.target}:${issue.block?.id ?? ""}:${issue.path.join("/")}`;
  }
};

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
      return issue.place.target === "site" ? { kind: "pages" } : { kind: "page", page: issue.place.target };
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

/** What to do about an issue, as the checks panel says it beside the issue. */
export const hintFor = (issue: CheckIssue) => {
  switch (issue._tag) {
    case "Incomplete":
      return `Fill in ${issue.field}. ${issue.message}.`;
    case "Placeholder":
      return `Replace the placeholder content in ${issue.field} with your own.`;
    case "MissingMeta":
      return `Give the page a ${issue.field} in its settings, beside the page.`;
    case "BrokenLink":
      return "Point the link at a published page, or publish the page it links to.";
    case "LinkWithoutText":
      return issue.block === null
        ? `Give every item in the ${issue.place.title.toLowerCase()} a label, under Pages and menus.`
        : "Give the link words that say where it goes, such as the page's name.";
    case "UnlabelledField":
      return `Give every field in ${issue.name} a label, in the form's settings beside the page.`;
    case "NoFormEmails":
      return `Add an address for ${issue.name}'s entries in Settings, under Forms and email.`;
    case "MissingConsent":
      return `Add a required consent checkbox to ${issue.name}, linking to your privacy policy.`;
  }
};
