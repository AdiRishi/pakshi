import { fieldAt } from "@repo/blocks/fields";
import type { Draft } from "@repo/contracts/draft";
import type { NamedBlock, Place } from "@repo/contracts/merge";
import type { PropPath } from "@repo/contracts/ops";
import { pageName } from "@repo/contracts/page";
import type { CheckIssue } from "@repo/contracts/publishing";
import type { BlockContracts } from "@repo/domain/document";

/*
 * What the checks find, as the agent reads it, and which of it only a person
 * can fix. Studio marks those, so "fix all" never promises what the agent
 * can't do. Studio's editor imports this module, so it leaves out the agent's
 * content conversion, which brings a Markdown parser.
 */

/**
 * Why only a person can fix an issue: an image to choose from the library, alt
 * text that a person writes or accepts, or where a form's entries go, which
 * is a site setting.
 */
export type PersonOnly = "image" | "alt-text" | "settings";

/** The kind of field a block issue is about, at the version the draft pins. */
const fieldKind = (
  draft: Draft,
  contracts: BlockContracts,
  issue: { readonly place: Place; readonly block: NamedBlock; readonly path: PropPath },
) => {
  const holder = issue.place.target === "site" ? draft.parts : draft.pages[issue.place.target];
  const type = holder?.blocks[issue.block.id]?.type;
  const fields = type === undefined ? undefined : contracts.get(type)?.fields;
  if (fields === undefined) return null;
  // An image's alt text is a part of its media field, after the field's own path.
  if (issue.path.at(-1) === "alt" && fieldAt(fields, issue.path.slice(0, -1))?.kind === "media")
    return "alt";
  return fieldAt(fields, issue.path)?.kind ?? null;
};

/** Why only a person can fix an issue, or null when the agent can. */
export const personOnly = (
  issue: CheckIssue,
  draft: Draft,
  contracts: BlockContracts,
): PersonOnly | null => {
  switch (issue._tag) {
    case "Incomplete":
    case "Placeholder": {
      const kind = fieldKind(draft, contracts, issue);
      return kind === "alt" ? "alt-text" : kind === "media" ? "image" : null;
    }
    case "NoFormEmails":
      return "settings";
    case "MissingMeta":
    case "BrokenLink":
    case "LinkWithoutText":
    case "UnlabelledField":
    case "MissingConsent":
      return null;
  }
};

const forPerson: Readonly<Record<PersonOnly, string>> = {
  image:
    "Only a person can fix this: you can't choose images. Leave it for them to choose one from the media library.",
  "alt-text":
    "Only a person can fix this: you can't see the image, so they write its alt text or accept the one suggested in its settings.",
  settings:
    "Only a person can fix this: where entries are emailed is a site setting, which you can't change.",
};

const blockAt = (place: Place, block: NamedBlock) =>
  `${place.title} (${place.target}), ${block.title} block ${block.id}`;

/** Where a link to a page that isn't served goes, and how to mend it. */
const brokenTo = (draft: Draft, issue: Extract<CheckIssue, { readonly _tag: "BrokenLink" }>) => {
  const linked = draft.pages[issue.page];
  return linked === undefined
    ? `links to ${issue.page}, a page that no longer exists. Point it at a page that does, or remove the link.`
    : `links to ${issue.page} "${pageName(linked)}", which is unpublished in this draft. Point it at a published page, or ask the person whether to publish ${issue.page} again with setStatus.`;
};

const describe = (issue: CheckIssue, draft: Draft, contracts: BlockContracts) => {
  switch (issue._tag) {
    case "Incomplete":
      return `${blockAt(issue.place, issue.block)}, field ${issue.path.join(".")}: ${issue.message}.`;
    case "Placeholder":
      return fieldKind(draft, contracts, issue) === "form"
        ? `${blockAt(issue.place, issue.block)}, field ${issue.path.join(".")}: still the placeholder form. Point it at one of the draft's forms, or add one with setForm and point it there.`
        : `${blockAt(issue.place, issue.block)}, field ${issue.path.join(".")}: still the block's placeholder content.`;
    case "MissingMeta":
      return `${issue.place.title} (${issue.place.target}): no ${issue.field}. Set it with setMeta.`;
    case "BrokenLink":
      return issue.block === null
        ? `The site's ${issue.place.title.toLowerCase()}, "${issue.field}", ${brokenTo(draft, issue)} Menus and redirects change with setMenu and setRedirect on "site".`
        : `${blockAt(issue.place, issue.block)}, field ${issue.field}, ${brokenTo(draft, issue)}`;
    case "LinkWithoutText":
      return issue.block === null
        ? `The site's ${issue.place.title.toLowerCase()}: an item has no label. Give it one with setMenu on "site".`
        : `${blockAt(issue.place, issue.block)}, field ${issue.path.join(".")}: a link shows no text. Give it words that say where it goes.`;
    case "UnlabelledField":
      return `Form ${issue.form} "${issue.name}": field ${issue.field} has no label. Give it one with setForm.`;
    case "NoFormEmails":
      return `Form ${issue.form} "${issue.name}": no one receives its entries.`;
    case "MissingConsent":
      return `Form ${issue.form} "${issue.name}" asks for an email address or phone number without a required consent checkbox. Add a required checkbox field linking to the site's privacy policy with setForm. If the site has no privacy policy page, ask the person where it is.`;
  }
};

/** An issue as the agent reads it: where it is, by ID, how to fix it, or that only a person can. */
export const issueForAgent = (issue: CheckIssue, draft: Draft, contracts: BlockContracts) => {
  const reason = personOnly(issue, draft, contracts);
  const line = describe(issue, draft, contracts);
  return reason === null ? line : `${line} ${forPerson[reason]}`;
};
