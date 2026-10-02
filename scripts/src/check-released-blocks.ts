/*
 * Keeps released block versions as they were released. A block version is
 * released once its folder is on the base branch. Compared with the base:
 *
 * - No file in a released version's folder may change, be added or be
 *   removed, unless the whole folder goes, which is how the platform team
 *   removes a version nothing uses any more.
 * - A released version's baseline screenshots may change only with a new
 *   entry in the rendering changes log that names the version, because that
 *   changes what live sites show. They go without one when the version's
 *   whole folder goes.
 * - A change to how the browser suite takes screenshots re-shoots baselines
 *   without changing what sites show. A new entry in the re-shoots log that
 *   names the version lets its baselines change, but only to the same
 *   picture: as wide, at most a row taller or shorter, and inside their edge
 *   rows a match for the earlier screenshot by the baseline test's own
 *   comparison. Sites never see this log.
 *
 * Usage: node scripts/src/check-released-blocks.ts <base ref>
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Schema } from "effect";

import { reshootDifference } from "./reshot-baseline.ts";

const blocksSource = "packages/blocks/src/";
const renderingLog = "packages/blocks/src/rendering-changes.json";
const reshootLog = "infra/tests/baseline-reshoots.json";
const baselines = "infra/tests/blocks.integration.test.ts-snapshots/";

const versionFolder = /^packages\/blocks\/src\/([a-z][a-z0-9-]*)\/v(\d+)\//;
const baselineFile =
  /^infra\/tests\/blocks\.integration\.test\.ts-snapshots\/([a-z][a-z0-9-]*)-v(\d+)-/;

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

/** The baseline re-shoots log. */
const ReshootLog = Schema.fromJsonString(
  Schema.Array(
    Schema.Struct({
      date: Schema.String,
      versions: Schema.Array(Schema.String),
      reason: Schema.String,
    }),
  ),
);

/** The versions named by entries in `now` that `before` doesn't have, as `hero@1`. */
const newlyLoggedVersions = (
  decode: (text: string) => ReadonlyArray<{ readonly versions: ReadonlyArray<string> }>,
  before: string,
  now: string,
) => {
  const earlier = new Set(decode(before).map((entry) => JSON.stringify(entry)));
  return new Set(
    decode(now)
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
    git(root, [
      "ls-tree",
      "-r",
      "--name-only",
      mergeBase,
      "--",
      blocksSource,
      baselines,
      reshootLog,
    ])
      .split("\n")
      .filter((path) => path.length > 0),
  );
  const released = (type: string, version: string) =>
    Array.from(atBase).some((path) => path.startsWith(`${blocksSource}${type}/v${version}/`));
  const logged = (path: string) =>
    [
      atBase.has(path) ? git(root, ["show", `${mergeBase}:${path}`]) : "[]",
      existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : "[]",
    ] as const;
  const newlyLogged = newlyLoggedVersions(Schema.decodeSync(RenderingLog), ...logged(renderingLog));
  const newlyReshot = newlyLoggedVersions(Schema.decodeSync(ReshootLog), ...logged(reshootLog));

  const removedWhole = (type: string, version: string) =>
    !existsSync(join(root, blocksSource, type, `v${version}`));

  const problems: Array<string> = [];
  for (const path of changed) {
    const folder = versionFolder.exec(path);
    if (folder !== null) {
      const [, type = "", version = ""] = folder;
      if (released(type, version) && !removedWhole(type, version))
        problems.push(
          `${path}: ${type} v${version} is released, so its folder can't change. Make a new version instead.`,
        );
      continue;
    }
    const baseline = baselineFile.exec(path);
    if (baseline !== null && atBase.has(path)) {
      const [, type = "", version = ""] = baseline;
      const removedWithVersion = removedWhole(type, version) && !existsSync(join(root, path));
      if (removedWithVersion || newlyLogged.has(`${type}@${version}`)) continue;
      if (!newlyReshot.has(`${type}@${version}`) || !existsSync(join(root, path))) {
        problems.push(
          `${path}: ${type} v${version} is released, so its screenshots change only with an entry for ${type}@${version} in ${renderingLog}.`,
        );
        continue;
      }
      const difference = reshootDifference(
        execFileSync("git", ["show", `${mergeBase}:${path}`], {
          cwd: root,
          maxBuffer: 64 * 1024 * 1024,
        }),
        readFileSync(join(root, path)),
      );
      if (difference !== null)
        problems.push(
          `${path}: ${reshootLog} re-shoots ${type}@${version}, so it must still match its earlier screenshot as the baseline test would, but ${difference}`,
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
