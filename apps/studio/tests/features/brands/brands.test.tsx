import { expect, test } from "vitest";
import { page, userEvent } from "vitest/browser";

import { brands, renderBrands } from "./harness";

/** The families of the fonts the page has loaded. */
const loadedFonts = () =>
  new Set(
    Array.from(document.fonts)
      .filter((face) => face.status === "loaded")
      .map((face) => face.family.replaceAll("'", "").replaceAll('"', "")),
  );

test("each brand's name is set in its own heading font, and every font its card shows loads", async () => {
  await renderBrands({ list: brands });
  for (const [name, family] of [
    ["Abhyas School of Yoga", "Fraunces"],
    ["City Parks", "Bricolage Grotesque"],
    ["Harbour Museums", "Source Serif 4"],
  ] as const) {
    const heading = page.getByRole("heading", { name, level: 2 }).element();
    expect(getComputedStyle(heading).fontFamily).toMatch(new RegExp(`^['"]?${family}`));
  }
  const families = ["Fraunces", "Source Sans 3", "Bricolage Grotesque", "Onest", "Source Serif 4"];
  await expect.poll(() => families.filter((family) => !loadedFonts().has(family))).toEqual([]);
});

test("a card opens its brand from anywhere on it", async () => {
  await renderBrands({ list: brands });
  await userEvent.click(page.getByText("Trails"), { force: true });
  await expect.element(page.getByRole("heading", { name: "Opened brand_parks" })).toBeVisible();
});

test("a card shows the brand's logo in light and dark, its voice and its sites", async () => {
  await renderBrands({ list: brands });
  const logos = Array.from(document.querySelectorAll("li:first-child img"), (logo) =>
    logo.getAttribute("src"),
  );
  expect(logos).toEqual([
    "/brand-media/brand_yoga/med_yogaLogo",
    "/brand-media/brand_yoga/med_yogaLogoDark",
  ]);
  await expect.element(page.getByText(/^Calm and encouraging/)).toBeVisible();
  await expect.element(page.getByText("Teacher Training")).toBeVisible();
  expect(page.getByText("None yet").elements()).toHaveLength(1);
});

test("someone who may make brands starts from an empty page with one way to make one", async () => {
  await renderBrands({ list: [] });
  await expect.element(page.getByRole("heading", { name: "Make your first brand" })).toBeVisible();
  const create = page.getByRole("button", { name: "New brand" });
  expect(create.elements()).toHaveLength(1);
  await create.click();
  await expect.element(page.getByRole("dialog", { name: "New brand" })).toBeVisible();
});

test("someone who may not make brands is told where brands come from", async () => {
  await renderBrands({ list: [], createBrand: false });
  await expect.element(page.getByText("No brands to show")).toBeVisible();
  expect(page.getByRole("button", { name: "New brand" }).query()).toBeNull();
});

test("a new brand shows as it will start, and can't take a color too light to read", async () => {
  await renderBrands({ list: brands });
  await page.getByRole("button", { name: "New brand" }).click();
  const dialog = page.getByRole("dialog", { name: "New brand" });
  await dialog.getByLabelText("Name", { exact: true }).fill("Harbour Festival");
  await expect.element(dialog.getByText("Harbour Festival")).toBeVisible();

  const color = dialog.getByLabelText("Brand color", { exact: true });
  await color.fill("#ffe14d");
  await expect.element(dialog.getByText(/too light to read/)).toBeVisible();
  await expect.element(dialog.getByRole("button", { name: "Create brand" })).toBeDisabled();

  await color.fill("#0e4d64");
  expect(dialog.getByText(/too light to read/).query()).toBeNull();
  await dialog.getByRole("button", { name: "Create brand" }).click();
  await expect.element(page.getByRole("heading", { name: "Opened brand_new" })).toBeVisible();
});
