import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";
import { crc32, deflateSync } from "node:zlib";

import { releasedBlockProblems } from "../src/check-released-blocks.ts";

const git = (root: string, ...args: ReadonlyArray<string>) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });

const write = (root: string, path: string, contents: string | Uint8Array) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), contents);
};

const hero = "packages/blocks/src/hero/v1/index.tsx";
const baseline =
  "infra/tests/blocks.integration.test.ts-snapshots/hero-v1-centered-light-darwin.png";
const log = "packages/blocks/src/rendering-changes.json";
const reshoots = "infra/tests/baseline-reshoots.json";

/** A repository whose main branch has released hero v1 with a screenshot, on a branch off main. */
const repository = (context: TestContext, screenshot: string | Uint8Array = "png 1") => {
  const root = mkdtempSync(join(tmpdir(), "released-blocks-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.email", "test@pakshi.test");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  write(root, hero, "export default 1;\n");
  write(root, "packages/blocks/src/hero/v1/fixtures/centered.json", "{}\n");
  write(root, baseline, screenshot);
  write(root, log, "[]\n");
  git(root, "add", ".");
  git(root, "commit", "--quiet", "-m", "Release hero v1");
  git(root, "checkout", "--quiet", "-b", "change");
  return root;
};

const commit = (root: string) => {
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "Change");
};

await test("an edit to a released block's folder is rejected", (context) => {
  const root = repository(context);
  write(root, hero, "export default 2;\n");
  commit(root);
  const problems = releasedBlockProblems(root, "main");
  assert.equal(problems.length, 1);
  assert.match(problems[0] ?? "", /hero v1 is released/);
});

await test("a fixture added to a released version is rejected too", (context) => {
  const root = repository(context);
  write(root, "packages/blocks/src/hero/v1/fixtures/wide.json", "{}\n");
  commit(root);
  assert.equal(releasedBlockProblems(root, "main").length, 1);
});

await test("a new version of a released block is allowed", (context) => {
  const root = repository(context);
  write(root, "packages/blocks/src/hero/v2/index.tsx", "export default 2;\n");
  commit(root);
  assert.deepEqual(releasedBlockProblems(root, "main"), []);
});

await test("removing a whole released version, with its screenshots, is allowed", (context) => {
  const root = repository(context);
  rmSync(join(root, "packages/blocks/src/hero/v1"), { recursive: true });
  rmSync(join(root, baseline));
  commit(root);
  assert.deepEqual(releasedBlockProblems(root, "main"), []);
});

await test("a kept version's screenshot can't be removed without an entry", (context) => {
  const root = repository(context);
  rmSync(join(root, baseline));
  commit(root);
  assert.equal(releasedBlockProblems(root, "main").length, 1);
});

await test("a released version's screenshot changes only with a rendering changes entry", (context) => {
  const root = repository(context);
  write(root, baseline, "png 2");
  commit(root);
  assert.equal(releasedBlockProblems(root, "main").length, 1);
  write(
    root,
    log,
    JSON.stringify([{ date: "2026-10-01", versions: ["hero@1"], change: "Tailwind 5" }]),
  );
  commit(root);
  assert.deepEqual(releasedBlockProblems(root, "main"), []);
});

await test("each later screenshot change of a version needs an entry of its own", (context) => {
  const root = repository(context);
  const entry = (change: string) => ({ date: "2026-10-01", versions: ["hero@1"], change });
  write(root, log, JSON.stringify([entry("Tailwind 5")]));
  commit(root);
  git(root, "checkout", "--quiet", "main");
  git(root, "merge", "--quiet", "change");
  git(root, "checkout", "--quiet", "-b", "later");
  write(root, baseline, "png 3");
  commit(root);
  assert.equal(releasedBlockProblems(root, "main").length, 1);
  write(root, log, JSON.stringify([entry("Tailwind 5"), entry("React 20")]));
  commit(root);
  assert.deepEqual(releasedBlockProblems(root, "main"), []);
});

/** A picture as rows of grey levels, one per pixel. */
type Picture = ReadonlyArray<ReadonlyArray<number>>;

/** Draws `level` over the pixels of `picture` that `where` picks. */
const paint = (picture: Picture, level: number, where: (x: number, y: number) => boolean) =>
  picture.map((row, y) => row.map((old, x) => (where(x, y) ? level : old)));

/** A dark bar across a light block, 40 pixels by 30. */
const picture: Picture = paint(
  Array.from({ length: 30 }, () => Array.from({ length: 40 }, () => 230)),
  40,
  (x, y) => x >= 5 && x < 35 && y >= 10 && y < 14,
);

/**
 * An RGB PNG of `rows`, each row filtered with `filter`: 0 stores bytes as
 * they are, 1 as the difference from the pixel to the left, 2 from the pixel above.
 */
const png = (rows: Picture, filter: 0 | 1 | 2 = 0) => {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const framed = Buffer.alloc(body.length + 8);
    framed.writeUInt32BE(data.length, 0);
    body.copy(framed, 4);
    framed.writeUInt32BE(crc32(body), body.length + 4);
    return framed;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(rows[0]?.length ?? 0, 0);
  header.writeUInt32BE(rows.length, 4);
  header.set([8, 2], 8);
  const bytes = rows.map((row) => row.flatMap((level) => [level, level, level]));
  const filtered = bytes.map((row, y) => [
    filter,
    ...row.map((value, x) => {
      const reference =
        filter === 1 ? (row[x - 3] ?? 0) : filter === 2 ? (bytes[y - 1]?.[x] ?? 0) : 0;
      return (value - reference) & 0xff;
    }),
  ]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.from(filtered.flat()))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

const reshootOfHero = JSON.stringify([
  { date: "2026-10-02", versions: ["hero@1"], reason: "Each fixture alone on the page" },
]);

/** The problems with a re-shoot of hero v1 that replaces `picture` with `reshot`. */
const reshootProblems = (context: TestContext, reshot: Buffer) => {
  const root = repository(context, png(picture));
  write(root, baseline, reshot);
  write(root, reshoots, reshootOfHero);
  commit(root);
  return releasedBlockProblems(root, "main");
};

await test("a re-shoot lets a released screenshot change in its edge rows", (context) => {
  // A row lost at the top, and a bottom row the block's edge now crosses elsewhere.
  const reshot = [...picture.slice(1, -1), Array.from({ length: 40 }, () => 0)];
  assert.deepEqual(reshootProblems(context, png(reshot)), []);
});

await test("a re-shoot compares pixels, not how the file stores them", (context) => {
  assert.deepEqual(reshootProblems(context, png(picture, 1)), []);
  assert.deepEqual(reshootProblems(context, png(picture, 2)), []);
});

await test("a re-shoot accepts the noise the baseline test tolerates", (context) => {
  // Text drawn at another sub-pixel offset: faint shading everywhere, and a few stronger pixels.
  const shaded = paint(
    picture.map((row) => row.map((level) => level - 6)),
    120,
    (x, y) => y === 14 && x >= 5 && x < 10,
  );
  assert.deepEqual(reshootProblems(context, png(shaded)), []);
});

await test("a re-shoot refuses a change inside the edges the baseline test would fail", (context) => {
  // A second bar, 60 of the 1,120 pixels inside the edge rows.
  const problems = reshootProblems(
    context,
    png(paint(picture, 40, (x, y) => x >= 5 && x < 35 && y >= 20 && y < 22)),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0] ?? "", /hero-v1-centered-light-darwin\.png: .*60 pixels .* different/);
});

await test("a re-shot screenshot two rows shorter is refused", (context) => {
  const problems = reshootProblems(context, png(picture.slice(1, -1)));
  assert.match(problems[0] ?? "", /28px tall, where it was 30px/);
});

await test("a re-shoot record covers only the change that adds it", (context) => {
  const root = repository(context, png(picture));
  write(root, reshoots, reshootOfHero);
  commit(root);
  git(root, "checkout", "--quiet", "main");
  git(root, "merge", "--quiet", "change");
  git(root, "checkout", "--quiet", "-b", "later");
  write(root, baseline, png(picture.slice(1)));
  commit(root);
  assert.match(releasedBlockProblems(root, "main")[0] ?? "", /hero v1 is released/);
});
