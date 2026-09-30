import type { DraftSharing, ShareAccess } from "@repo/contracts/sharing";

/** Who is opening a draft: a signed-in person, with whether they may edit the site's pages, or an anonymous visitor. */
export type Visitor = { readonly id: string; readonly editsSite: boolean } | { readonly id: null };

const rank = { view: 1, edit: 2 } as const;

const widest = (grants: ReadonlyArray<ShareAccess>): ShareAccess | null =>
  grants.reduce<ShareAccess | null>(
    (best, access) => (best === null || rank[access] > rank[best] ? access : best),
    null,
  );

/**
 * What a visitor may do with a draft: edit it, view its preview, or nothing.
 * People who may edit the site's pages can edit every draft. Editing needs a
 * signed-in person, so a link shared for editing lets anonymous visitors view.
 */
export const draftAccess = (sharing: DraftSharing, visitor: Visitor): ShareAccess | null => {
  if (visitor.id === null) return sharing.general.audience === "link" ? "view" : null;
  if (visitor.editsSite) return "edit";
  return widest([
    ...sharing.people
      .filter((share) => share.person.id === visitor.id)
      .map((share) => share.access),
    ...(sharing.general.audience === "people" ? [] : [sharing.general.access]),
  ]);
};
