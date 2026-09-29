import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { BrandId, MediaId, ReleaseId, SiteId, SnapshotId } from "@repo/contracts/ids";
import { PageDocument, PagePath } from "@repo/contracts/page";
import { contentHash, MediaFile, SnapshotManifest } from "@repo/contracts/snapshot";
import { harbour } from "@repo/tokens";
import { Schema } from "effect";

const fixture = (path: string) => join(import.meta.dirname, "../../fixtures/sample-site", path);

const SampleSite = Schema.Struct({
  brand: Schema.Struct({ id: BrandId, name: Schema.String }),
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  snapshot: SnapshotId,
  release: ReleaseId,
  lockfile: SnapshotManifest.fields.lockfile,
  media: Schema.Record(MediaId, MediaFile),
  gone: Schema.Array(PagePath),
});

const readJson = <S extends Schema.Top & { readonly DecodingServices: never }>(
  path: string,
  schema: S,
) => readFile(fixture(path), "utf8").then(Schema.decodeUnknownSync(Schema.fromJsonString(schema)));

/**
 * The hand-written snapshot that non-production stages serve: two pages built
 * from block fixtures, the Harbour theme and one image. Pages are stored under
 * their content hash, as publishing will store them.
 */
export const sampleSite = async () => {
  const site = await readJson("site.json", SampleSite);
  const pages = await Promise.all(
    ["home.json", "programme.json"].map(async (file) => {
      const page = await readJson(`pages/${file}`, PageDocument);
      const json = Schema.encodeSync(PageDocument)(page);
      return { page, json, hash: await contentHash(json) };
    }),
  );
  const manifest = Schema.decodeSync(SnapshotManifest)({
    schema: "pakshi.snapshot/1",
    id: site.snapshot,
    site: site.site.id,
    settings: { name: site.site.name },
    lockfile: site.lockfile,
    theme: harbour,
    media: site.media,
    pages: pages.map(({ page, hash }) => ({
      id: page.id,
      path: page.path,
      type: page.type,
      object: hash,
    })),
    gone: site.gone,
  });
  const media = await Promise.all(
    Object.entries(site.media).map(async ([id, file]) => ({
      id: MediaId.make(id),
      contentType: file.contentType,
      bytes: await readFile(fixture(`media/${id}.jpg`)),
    })),
  );
  return { ...site, manifest, pages, media };
};
