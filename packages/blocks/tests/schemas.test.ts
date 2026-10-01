import { Schema } from "effect";
import { expect, test } from "vitest";

import { propsSchema } from "../src/fields.ts";
import { loadBlock, registeredVersions } from "../src/render.tsx";

/*
 * Golden files pin what each released block version accepts: its placement,
 * variants, surfaces and slots, and the JSON Schema of its props as drafts
 * and as published. A version is frozen, so a difference here means shared
 * code or a dependency changed what an existing site may store. The files
 * change only with a new version, or in a reviewed change that says why.
 */

test.each(registeredVersions.map(({ type, version }) => [`${type}@${version}`, type, version]))(
  "%s accepts what it was released with",
  async (key, type, version) => {
    const block = await loadBlock(type, { [type]: version });
    const contract = {
      title: block.title,
      placement: block.placement,
      variants: block.variants,
      ...(block.placement === "section" && {
        surfaces: block.surfaces,
        slots: block.slots,
        interactive: block.interactive,
      }),
      ...((block.placement === "header" || block.placement === "footer") && {
        surfaces: block.surfaces,
      }),
      draft: Schema.toJsonSchemaDocument(propsSchema(block.fields, "draft")),
      complete: Schema.toJsonSchemaDocument(propsSchema(block.fields, "complete")),
    };
    await expect(`${JSON.stringify(contract, null, 2)}\n`).toMatchFileSnapshot(
      `./schemas/${key}.json`,
    );
  },
);
