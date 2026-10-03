import { Schema } from "effect";

const prefixed = (prefix: string) =>
  Schema.String.check(Schema.isPattern(new RegExp(`^${prefix}_[A-Za-z0-9]{1,64}$`, "u")));

export const BrandId = prefixed("brand").pipe(Schema.brand("BrandId"));
export type BrandId = typeof BrandId.Type;

export const SiteId = prefixed("site").pipe(Schema.brand("SiteId"));
export type SiteId = typeof SiteId.Type;

export const PageId = prefixed("pg").pipe(Schema.brand("PageId"));
export type PageId = typeof PageId.Type;

export const BlockId = prefixed("b").pipe(Schema.brand("BlockId"));
export type BlockId = typeof BlockId.Type;

export const MediaId = prefixed("med").pipe(Schema.brand("MediaId"));
export type MediaId = typeof MediaId.Type;

export const FormId = prefixed("frm").pipe(Schema.brand("FormId"));
export type FormId = typeof FormId.Type;

export const ReleaseId = prefixed("rel").pipe(Schema.brand("ReleaseId"));
export type ReleaseId = typeof ReleaseId.Type;

export const SnapshotId = prefixed("snap").pipe(Schema.brand("SnapshotId"));
export type SnapshotId = typeof SnapshotId.Type;

export const DraftId = prefixed("dr").pipe(Schema.brand("DraftId"));
export type DraftId = typeof DraftId.Type;

/** A draft submitted for approval. */
export const SubmissionId = prefixed("sub").pipe(Schema.brand("SubmissionId"));
export type SubmissionId = typeof SubmissionId.Type;

/** A batch of edit operations. Its sender creates the ID, so a batch sent twice applies once. */
export const BatchId = prefixed("bat").pipe(Schema.brand("BatchId"));
export type BatchId = typeof BatchId.Type;

/** One turn of a conversation with the agent: a person's message and everything the agent did for it. */
export const TurnId = prefixed("turn").pipe(Schema.brand("TurnId"));
export type TurnId = typeof TurnId.Type;

/** A document someone gave the agent to work from, such as a programme or a brief. */
export const SourceId = prefixed("src").pipe(Schema.brand("SourceId"));
export type SourceId = typeof SourceId.Type;

/** An item in a list inside a block's props, such as one image in a gallery. */
export const ItemId = prefixed("it").pipe(Schema.brand("ItemId"));
export type ItemId = typeof ItemId.Type;

export const MenuItemId = prefixed("mi").pipe(Schema.brand("MenuItemId"));
export type MenuItemId = typeof MenuItemId.Type;

/** A role the organization's admins made, beside the default roles. */
export const CustomRoleId = prefixed("role").pipe(Schema.brand("CustomRoleId"));
export type CustomRoleId = typeof CustomRoleId.Type;

/** A request for a block the library doesn't have, for the platform team. */
export const BlockRequestId = prefixed("breq").pipe(Schema.brand("BlockRequestId"));
export type BlockRequestId = typeof BlockRequestId.Type;

/** An invitation for someone to join the organization. */
export const InvitationId = prefixed("inv").pipe(Schema.brand("InvitationId"));
export type InvitationId = typeof InvitationId.Type;

/** One entry a visitor sent with a site's form. */
export const EntryId = prefixed("ent").pipe(Schema.brand("EntryId"));
export type EntryId = typeof EntryId.Type;

/** A field in a form definition. */
export const FormFieldId = prefixed("ff").pipe(Schema.brand("FormFieldId"));
export type FormFieldId = typeof FormFieldId.Type;

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * A new random ID with this prefix, such as `b_4fT0x…`. Its 22 base-62 digits
 * carry about 130 random bits, so IDs made by different editors and the agent
 * never collide.
 */
export const randomId = <P extends string>(prefix: P): `${P}_${string}` => {
  const bytes = crypto.getRandomValues(new Uint8Array(22));
  return `${prefix}_${Array.from(bytes, (byte) => alphabet[byte % 62]).join("")}`;
};

/** A block type such as `hero` or `call-to-action`. */
export const BlockType = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u));
export type BlockType = typeof BlockType.Type;
