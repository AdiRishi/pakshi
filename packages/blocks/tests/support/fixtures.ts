import { readdir, readFile } from "node:fs/promises";

import { MediaId, PageId } from "@repo/contracts/ids";
import { BlockInstance } from "@repo/contracts/page";
import { Schema } from "effect";

import type { References } from "../../src/components.tsx";

const source = new URL("../../src/", import.meta.url);
const Fixture = BlockInstance.mapFields(({ type: _type, slots: _slots, ...fields }) => fields);

/** Every fixture of every block version, as `[type, version, name, fixture]`. */
export const blockFixtures = async () => {
  const found: Array<readonly [string, number, string, typeof Fixture.Type]> = [];
  for (const type of await readdir(source, { withFileTypes: true })) {
    if (!type.isDirectory()) continue;
    for (const version of await readdir(new URL(`${type.name}/`, source))) {
      const folder = new URL(`${type.name}/${version}/fixtures/`, source);
      for (const file of await readdir(folder)) {
        const fixture = Schema.decodeSync(Schema.fromJsonString(Fixture))(
          await readFile(new URL(file, folder), "utf8"),
        );
        found.push([type.name, Number(version.slice(1)), file.replace(/\.json$/, ""), fixture]);
      }
    }
  }
  return found;
};

export const fixtureReferences: References = {
  media: (id) =>
    id === MediaId.make("med_harbour")
      ? {
          src: "/_media/med_harbour",
          width: 1600,
          height: 1067,
          alt: "Boats moored in a calm harbour",
        }
      : undefined,
  pagePath: (id) =>
    new Map([
      [PageId.make("pg_programme"), "/programme"],
      [PageId.make("pg_visit"), "/visit"],
    ]).get(id),
};
