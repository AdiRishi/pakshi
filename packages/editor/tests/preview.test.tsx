import { latestLockfile, loadBlocks } from "@repo/blocks";
import { blockShowcase } from "@repo/blocks/fixtures";
import { expect, test } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import { ScaledBlockPreview } from "../src/index.ts";

import siteCss from "@repo/blocks/site.css?url";

const definitions = await loadBlocks(latestLockfile);
const showcase = blockShowcase(definitions, "faq");

const Preview = (props: { readonly title: string }) => (
  <ScaledBlockPreview
    title={props.title}
    siteCss={siteCss}
    theme={showcase.draft.brand.theme}
    scheme="light"
    data={showcase.data}
    definitions={definitions}
    tree={showcase.tree}
  />
);

const frameText = (title: string) =>
  document.querySelector<HTMLIFrameElement>(`iframe[title="${title}"]`)?.contentDocument?.body
    .textContent ?? null;

test("shows a block laid out at desktop width, scaled down to fit its container", async () => {
  await page.viewport(1000, 800);
  await render(
    <div style={{ width: 640 }}>
      <Preview title="Questions" />
    </div>,
  );
  await expect.poll(() => frameText("Questions")).toContain("Questions from parents");
  const frame = document.querySelector<HTMLIFrameElement>('iframe[title="Questions"]');
  expect(frame?.getBoundingClientRect().width).toBe(640);
  expect(frame?.inert).toBe(true);
  const box = frame?.parentElement;
  const content = frame?.contentDocument?.querySelector("[data-pakshi-canvas]");
  await expect
    .poll(() => box?.getBoundingClientRect().height)
    .toBeCloseTo((content?.scrollHeight ?? 0) / 2, 0);
});

test("renders only once it comes near the viewport", async () => {
  await page.viewport(1000, 800);
  await render(
    <div style={{ width: 640 }}>
      <div style={{ height: 4000 }} />
      <div data-testid="far">
        <Preview title="Far down" />
      </div>
    </div>,
  );
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(document.querySelector('iframe[title="Far down"]')).toBeNull();
  document.querySelector('[data-testid="far"]')?.scrollIntoView();
  await expect.poll(() => frameText("Far down")).toContain("Questions from parents");
});
