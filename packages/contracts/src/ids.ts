import { Schema } from "effect";

const prefixed = (prefix: string) =>
  Schema.String.check(Schema.isPattern(new RegExp(`^${prefix}_[A-Za-z0-9]{1,64}$`)));

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

/** A block type such as `hero` or `call-to-action`. */
export const BlockType = Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/));
export type BlockType = typeof BlockType.Type;
