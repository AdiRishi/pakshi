import { expect, it } from "@effect/vitest";
import { MediaId } from "@repo/contracts/ids";
import { mediaUploadPath, MediaSummary, siteMediaBasePath } from "@repo/contracts/studio";
import { exports } from "cloudflare:workers";
import { Effect, Schema } from "effect";

import { edit, newSite } from "./support/sites.ts";
import { join, setUp, studio, studioOrigin } from "./support/studio.ts";

const admin = Effect.cached(
  setUp({
    organization: "Riverton Council",
    name: "Priya Shah",
    email: "priya@riverton.test",
    password: "priya-password",
  }),
).pipe(Effect.runSync);

/** The first bytes of a PNG image this many pixels across and down, which is all a library reads. */
const png = (width: number, height: number) => {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
  bytes.set(new TextEncoder().encode("IHDR"), 12);
  const data = new DataView(bytes.buffer);
  data.setUint32(16, width);
  data.setUint32(20, height);
  return bytes;
};

/** Uploads a file to a library as Studio forwards a browser's upload. */
const upload = (session: string, library: string, name: string, body: Uint8Array<ArrayBuffer>) =>
  Effect.promise(() =>
    exports.default.fetch(
      new Request(`${studioOrigin}${mediaUploadPath}?${library}&name=${name}`, {
        method: "POST",
        headers: { origin: studioOrigin, cookie: session, "content-type": "image/png" },
        body,
      }),
    ),
  );

it.live(
  "an image uploaded to a site's library shows where it's used, and its alt text is kept for next time",
  () =>
    Effect.gen(function* () {
      const session = yield* admin;
      const priya = yield* studio(session);
      const site = yield* newSite(priya, "Northbank Libraries", "northbank");

      const uploaded = yield* upload(
        session,
        `site=${site.site}`,
        "reading-room.png",
        png(1200, 800),
      );
      expect(uploaded.status).toBe(201);
      const image = yield* Schema.decodeUnknownEffect(MediaSummary)(
        yield* Effect.promise(() => uploaded.json()),
      );
      expect(image).toMatchObject({ contentType: "image/png", width: 1200, height: 800 });
      const served = yield* Effect.promise(() =>
        exports.default.fetch(
          new Request(`${studioOrigin}${siteMediaBasePath}/${site.site}/${image.id}`, {
            headers: { cookie: session },
          }),
        ),
      );
      expect(served.status).toBe(200);

      yield* edit(priya, site.site, site.draft, [
        { op: "setMeta", page: site.home, field: "image", value: { $ref: "media", id: image.id } },
      ]);
      yield* priya.saveAltText({ site: site.site, media: image.id, alt: "The reading room" });
      const { siteImages } = yield* priya.mediaLibrary({ site: site.site });
      expect(siteImages).toMatchObject([
        {
          id: image.id,
          name: "reading-room.png",
          alt: "The reading room",
          uploadedBy: "Priya Shah",
          usedOn: ["Northbank Libraries"],
        },
      ]);
    }),
);

it.live("a library takes only images, and only from people who may add to it", () =>
  Effect.gen(function* () {
    const session = yield* admin;
    const priya = yield* studio(session);
    const site = yield* newSite(priya, "Riverside Parks", "parks");
    const notImage = yield* upload(
      session,
      `site=${site.site}`,
      "notes.png",
      new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"),
    );
    expect(notImage.status).toBe(415);

    const sam = yield* join(priya, { name: "Sam Okafor", email: "sam@riverton.test" }, "editor", {
      kind: "site",
      id: site.site,
    });
    expect((yield* upload(sam, `site=${site.site}`, "map.png", png(800, 600))).status).toBe(201);
    expect((yield* upload(sam, `brand=${site.brand}`, "logo.png", png(400, 100))).status).toBe(403);
    const refused = yield* Effect.flip(
      (yield* studio(sam)).saveAltText({
        site: site.site,
        media: MediaId.make("med_nowhere"),
        alt: "Nothing",
      }),
    );
    expect(refused._tag).toBe("ImageNotFound");
  }),
);
