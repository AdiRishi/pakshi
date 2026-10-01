import { expect, test } from "@playwright/test";

import { admin, adminState, studioUrl } from "./support/studio.ts";

test("the first person to open Pakshi sets it up and becomes its admin", async ({ page }) => {
  await page.goto(studioUrl);
  await expect(page).toHaveURL(/\/set-up$/);
  await page.getByLabel("Organization").fill(admin.organization);
  await page.getByLabel("Your name").fill(admin.name);
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Set up Pakshi" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Priya" })).toBeVisible();
  await expect(page.getByText(`Org admin, ${admin.organization}`)).toBeVisible();
  const home = await page.request.get(studioUrl);
  expect(home.headers()["cache-control"]).toBe("private, no-store");

  // Signing out and back in works with the password chosen.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  // A sign-in form another site posts signs no one in.
  const forged = await page.request.post(`${studioUrl}/sign-in`, {
    form: { email: admin.email, password: admin.password, redirect: "/" },
    headers: { origin: "https://elsewhere.example" },
    maxRedirects: 0,
  });
  expect(forged.headers()["set-cookie"]).toBeUndefined();
  await page.getByLabel("Email").fill(admin.email);
  await page.getByLabel("Password").fill(admin.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Priya" })).toBeVisible();
  await page.context().storageState({ path: adminState });
});
