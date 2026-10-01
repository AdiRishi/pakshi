import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { BrandIdentity } from "@repo/contracts/brand";
import { FormDefinition } from "@repo/contracts/form";
import { BrandId, MediaId, ReleaseId, SiteId, SnapshotId } from "@repo/contracts/ids";
import { FormId } from "@repo/contracts/ids";
import { PageDocument, PagePath } from "@repo/contracts/page";
import { SiteParts } from "@repo/contracts/site";
import { contentHash, MediaFile, SnapshotManifest } from "@repo/contracts/snapshot";
import { BrandTheme, resolveTheme } from "@repo/tokens";
import { Schema } from "effect";

const extensions = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
} as const satisfies Record<MediaFile["contentType"], string>;

const fixture = (path: string) => join(import.meta.dirname, "../../fixtures/sample-site", path);

const SampleSite = Schema.Struct({
  brand: Schema.Struct({
    id: BrandId,
    name: Schema.String,
    theme: BrandTheme,
    identity: BrandIdentity,
  }),
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  snapshot: SnapshotId,
  release: ReleaseId,
  lockfile: SnapshotManifest.fields.lockfile,
  parts: SiteParts,
  forms: Schema.Record(FormId, FormDefinition),
  /** The site's library, with the alt text it suggests for each image. */
  media: Schema.Record(MediaId, Schema.Struct({ ...MediaFile.fields, alt: Schema.String })),
  gone: Schema.Array(PagePath),
});

const readJson = <S extends Schema.Top & { readonly DecodingServices: never }>(
  path: string,
  schema: S,
) => readFile(fixture(path), "utf8").then(Schema.decodeUnknownSync(Schema.fromJsonString(schema)));

/**
 * The hand-written snapshot that non-production stages serve: two pages built
 * from block fixtures, a header and footer with menus, the Harbour brand's
 * first revision with its logos and icon, and one photo. Pages are stored under their content hash, as
 * publishing will store them.
 */
export const sampleSite = async () => {
  const site = await readJson("site.json", SampleSite);
  const revision = {
    brand: site.brand.id,
    number: 1,
    theme: resolveTheme(site.brand.theme).theme,
    identity: site.brand.identity,
  };
  const pages = await Promise.all(
    ["home.json", "programme.json"].map(async (file) => {
      const page = await readJson(`pages/${file}`, PageDocument);
      const json = Schema.encodeSync(PageDocument)(page);
      return { page, json, hash: await contentHash(json) };
    }),
  );
  const manifest = Schema.decodeUnknownSync(SnapshotManifest)({
    schema: "pakshi.snapshot/1",
    id: site.snapshot,
    site: site.site.id,
    settings: { name: site.site.name, sharingImage: null },
    parts: site.parts,
    forms: site.forms,
    redirects: {},
    lockfile: site.lockfile,
    brand: revision,
    media: Object.fromEntries(
      Object.entries(site.media).map(([id, file]) => [
        id,
        { contentType: file.contentType, width: file.width, height: file.height },
      ]),
    ),
    pages: pages.map(({ page, hash }) => ({
      id: page.id,
      path: page.path,
      type: page.type,
      meta: page.meta,
      object: hash,
    })),
    unpublished: [],
    gone: site.gone,
  });
  const media = await Promise.all(
    Object.entries(site.media).map(async ([id, file]) => ({
      id: MediaId.make(id),
      ...file,
      bytes: await readFile(fixture(`media/${id}.${extensions[file.contentType]}`)),
    })),
  );
  return { ...site, revision, manifest, pages, media };
};
