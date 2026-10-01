/*
 * Keeps released block versions as they were released. A block version is
 * released once its folder is on the base branch. Compared with the base:
 *
 * - No file in a released version's folder may change, be added or be
 *   removed, unless the whole folder goes, which is how the platform team
 *   removes a version nothing uses any more.
 * - A released version's baseline screenshots may change only with a new
 *   entry in the rendering changes log that names the version, because that
 *   changes what live sites show.
 *
 * Usage: node scripts/src/check-released-blocks.ts <base ref>
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Schema } from "effect";

const blocksSource = "packages/blocks/src/";
const renderingLog = "packages/blocks/src/rendering-changes.json";
const baselines = "infra/tests/blocks.browser.test.ts-snapshots/";

const versionFolder = /^packages\/blocks\/src\/([a-z][a-z0-9-]*)\/v(\d+)\//;
const baselineFile =
  /^infra\/tests\/blocks\.browser\.test\.ts-snapshots\/([a-z][a-z0-9-]*)-v(\d+)-/;

const git = (root: string, args: ReadonlyArray<string>) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });

/** The rendering changes log, as far as this check reads it. */
const RenderingLog = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      date: Schema.String,
      versions: Schema.Array(Schema.String),
      change: Schema.String,
    }),
  ),
);

const decodeLog = Schema.decodeSync(RenderingLog);

/** The versions named by entries in `now` that `before` doesn't have, as `hero@1`. */
const newlyLoggedVersions = (before: string, now: string) => {
  const earlier = new Set(decodeLog(before).map((entry) => JSON.stringify(entry)));
  return new Set(
    decodeLog(now)
      .filter((entry) => !earlier.has(JSON.stringify(entry)))
      .flatMap((entry) => entry.versions),
  );
};

/** Every problem with the changes since `base`, in the repository at `root`. */
export const releasedBlockProblems = (root: string, base: string) => {
  const mergeBase = git(root, ["merge-base", base, "HEAD"]).trim();
  const changed = git(root, ["diff", "--name-only", "--no-renames", mergeBase])
    .split("\n")
    .filter((path) => path.length > 0);
  const atBase = new Set(
    git(root, ["ls-tree", "-r", "--name-only", mergeBase, "--", blocksSource, baselines])
      .split("\n")
      .filter((path) => path.length > 0),
  );
  const released = (type: string, version: string) =>
    Array.from(atBase).some((path) => path.startsWith(`${blocksSource}${type}/v${version}/`));
  const newlyLogged = newlyLoggedVersions(
    atBase.has(renderingLog) ? git(root, ["show", `${mergeBase}:${renderingLog}`]) : "[]",
    existsSync(join(root, renderingLog)) ? readFileSync(join(root, renderingLog), "utf8") : "[]",
  );

  const problems: Array<string> = [];
  for (const path of changed) {
    const folder = versionFolder.exec(path);
    if (folder !== null) {
      const [, type = "", version = ""] = folder;
      const removedWhole = !existsSync(join(root, blocksSource, type, `v${version}`));
      if (released(type, version) && !removedWhole)
        problems.push(
          `${path}: ${type} v${version} is released, so its folder can't change. Make a new version instead.`,
        );
      continue;
    }
    const baseline = baselineFile.exec(path);
    if (baseline !== null && atBase.has(path)) {
      const [, type = "", version = ""] = baseline;
      if (!newlyLogged.has(`${type}@${version}`))
        problems.push(
          `${path}: ${type} v${version} is released, so its screenshots change only with an entry for ${type}@${version} in ${renderingLog}.`,
        );
    }
  }
  return problems;
};

if (import.meta.main) {
  const [base] = process.argv.slice(2);
  if (base === undefined) {
    console.error("Usage: node scripts/src/check-released-blocks.ts <base ref>");
    process.exit(2);
  }
  const problems = releasedBlockProblems(process.cwd(), base);
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log("Released block versions are unchanged.");
}
