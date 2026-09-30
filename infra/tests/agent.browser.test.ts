import { type BrowserContext, expect, test } from "@playwright/test";
import WebSocket from "ws";

import {
  draftIdOf,
  heading,
  newDraft,
  openInEditor,
  signedIn,
  studioUrl,
} from "./support/studio.ts";

/** The session cookie a signed-in browser sends Studio. */
const cookieOf = async (context: BrowserContext) =>
  (await context.cookies(studioUrl)).map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");

/**
 * Opens a conversation's WebSocket from outside a browser, where a client
 * can set any header, and returns the first message the agent sends.
 */
const firstMessage = (address: string, headers: Record<string, string>) =>
  new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(address, { headers });
    socket.on("open", () => socket.send(JSON.stringify({ _tag: "Sync" })));
    socket.on("message", (data) => {
      resolve(Buffer.concat(Array.isArray(data) ? data : [Buffer.from(data)]).toString("utf8"));
      socket.close();
    });
    socket.on("error", reject);
  });

test("the agent route reaches only the signed-in person's own conversation", async ({
  browser,
}) => {
  const meera = await signedIn(browser, "Meera Kapoor");
  const draftUrl = await newDraft(meera, "site_harbour", "Agent route");
  const draft = draftIdOf(draftUrl);
  const origin = new URL(studioUrl).origin;
  const agent = `${studioUrl}/api/agent/site_harbour/${draft}`;

  // A path aimed at another Durable Object, or from another origin, goes nowhere.
  const aimed = await meera.request.get(`${studioUrl}/api/agent/site-doc/site_harbour`, {
    headers: { origin },
  });
  expect(aimed.status()).toBe(404);
  const elsewhere = await meera.request.get(agent, {
    headers: { origin: "https://elsewhere.example" },
  });
  expect(elsewhere.status()).toBe(403);
  // A draft that doesn't exist has no conversation to open, even for someone who edits the site.
  const madeUp = await meera.request.post(`${studioUrl}/api/agent/site_harbour/dr_madeup/sources`, {
    headers: { origin },
    multipart: { file: { name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("Hi") } },
  });
  expect(madeUp.status()).toBe(404);

  // Meera attaches a document to her conversation.
  const attached = await meera.request.post(`${agent}/sources`, {
    headers: { origin },
    multipart: {
      file: {
        name: "notes.md",
        mimeType: "text/markdown",
        buffer: Buffer.from("# Notes\n\nFive days."),
      },
    },
  });
  expect(attached.ok()).toBe(true);

  // Sam claims to be Meera in the header studio-api sets, and still reaches only his own.
  const sam = await signedIn(browser, "Sam Okafor");
  const forged = JSON.stringify({
    person: { id: "user_meera", name: "Meera Kapoor", email: "meera.kapoor@pakshi.test" },
    site: "site_harbour",
    brand: "brand_harbour",
    draft,
    permissions: ["page.edit"],
    editsSite: true,
    studio: origin,
  });
  const synced = JSON.parse(
    await firstMessage(agent.replace(/^http/, "ws"), {
      cookie: await cookieOf(sam.context()),
      origin,
      "x-pakshi-agent": forged,
    }),
  );
  expect(synced).toMatchObject({ _tag: "Synced", turns: [], sources: [] });
  const own = JSON.parse(
    await firstMessage(agent.replace(/^http/, "ws"), {
      cookie: await cookieOf(meera.context()),
      origin,
    }),
  );
  expect(own).toMatchObject({ _tag: "Synced", sources: [{ name: "notes.md" }] });
});

// These tests call the real model, which costs money, so they run only when asked for.
test.describe("with the real model", () => {
  test.skip(
    process.env["PAKSHI_AGENT_TESTS"] !== "1",
    "Set PAKSHI_AGENT_TESTS=1 to run tests that call the model.",
  );

  test("the agent edits a draft for its person while someone else watches, and a turn undoes whole", async ({
    browser,
  }) => {
    const meera = await signedIn(browser, "Meera Kapoor", { width: 1440, height: 1000 });
    const draftUrl = await newDraft(meera, "site_harbour", "Agent edit");
    const canvas = await openInEditor(meera, draftUrl, "pg_home");
    const sam = await signedIn(browser, "Sam Okafor", { width: 1440, height: 1000 });
    const watching = await openInEditor(sam, draftUrl, "pg_home");
    const before = await heading(canvas, "b_hero").textContent();

    await meera
      .getByLabel("Message Pakshi")
      .fill("Change the hero heading to 'Build a boat in five days'.");
    await meera.getByLabel("Message Pakshi").press("Enter");

    // The change reaches both canvases, and Sam sees who made it.
    await expect(heading(watching, "b_hero")).toHaveText("Build a boat in five days", {
      timeout: 120_000,
    });
    await expect(heading(canvas, "b_hero")).toHaveText("Build a boat in five days");
    const changes = meera.getByRole("region", { name: "Changes" });
    await expect(changes).toContainText("1 change to the draft", { timeout: 120_000 });

    await changes.getByRole("button", { name: "Undo" }).click();
    await expect(heading(watching, "b_hero")).toHaveText(before ?? "");
    await expect(changes.getByText("Undone")).toBeVisible();
  });
});
