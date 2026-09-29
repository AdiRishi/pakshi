import { expect, test } from "@playwright/test";

const studioUrl = process.env.STUDIO_URL ?? "";
const sitesUrl = process.env.SITES_URL ?? "";

test("a test user signs in to Studio through the test identity provider", async ({ page }) => {
  await page.goto(studioUrl);
  await page.getByRole("link", { name: /^Continue with .* account$/ }).click();
  await page.getByRole("button", { name: "Sam Okafor" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Sam" })).toBeVisible();
  const home = await page.request.get(studioUrl);
  expect(home.headers()["cache-control"]).toBe("private, no-store");
  const sites = page.getByRole("region", { name: "Your sites" });
  await expect(sites.getByText("Harbour Summer School")).toBeVisible();
  await expect(page.getByText("Editor, Harbour Summer School")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`the served page matches its fixture screenshot in ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await page.goto(sitesUrl);
    await expect(page.getByRole("img", { name: /sailing boats/ })).toBeVisible();
    await expect(page).toHaveScreenshot(`sample-home-${colorScheme}.png`, {
      fullPage: true,
      animations: "disabled",
    });
  });
}
