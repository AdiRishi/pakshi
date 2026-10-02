import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test, type TestContext } from "node:test";

import { releasedBlockProblems } from "../src/check-released-blocks.ts";

const git = (root: string, ...args: ReadonlyArray<string>) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" });

const write = (root: string, path: string, text: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};

const hero = "packages/blocks/src/hero/v1/index.tsx";
const baseline =
  "infra/tests/blocks.integration.test.ts-snapshots/hero-v1-centered-light-darwin.png";
const log = "packages/blocks/src/rendering-changes.json";

/** A repository whose main branch has released hero v1 with a screenshot, on a branch off main. */
const repository = (context: TestContext) => {
  const root = mkdtempSync(join(tmpdir(), "released-blocks-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.email", "test@pakshi.test");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  write(root, hero, "export default 1;\n");
  write(root, "packages/blocks/src/hero/v1/fixtures/centered.json", "{}\n");
  write(root, baseline, "png 1");
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
