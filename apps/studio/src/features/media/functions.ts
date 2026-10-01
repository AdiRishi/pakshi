import { MediaId, SiteId } from "@repo/contracts/ids";
import { createServerFn } from "@tanstack/react-start";
import { Schema } from "effect";

import { studio } from "@/server/studio";

/** A site's image library and its brand's. */
export const getMediaLibrary = createServerFn({ method: "GET" })
  .validator(Schema.toStandardSchemaV1(Schema.Struct({ site: SiteId })))
  .handler(({ data }) => studio((client) => client.mediaLibrary(data)));

/** Sets the alt text an image suggests wherever it's placed next. */
export const saveAltText = createServerFn({ method: "POST" })
  .validator(
    Schema.toStandardSchemaV1(
      Schema.Struct({
        site: SiteId,
        media: MediaId,
        alt: Schema.String.check(Schema.isMaxLength(250)),
      }),
    ),
  )
  .handler(({ data }) => studio((client) => client.saveAltText(data)));
