import type { BlockDefinition } from "@repo/blocks";
import { fixtureSite } from "@repo/blocks/fixtures";
import type { Draft } from "@repo/contracts/draft";
import { type BlockType, MediaId, PageId } from "@repo/contracts/ids";
import type { MediaSummary } from "@repo/contracts/studio";
import { expect } from "vitest";
import { render } from "vitest-browser-react";
import { page } from "vitest/browser";

import {
  EditorCanvas,
  EditorOutline,
  EditorProvider,
  EditorSettings,
  useToolbarCommands,
} from "../../src/index.ts";
import type { Notice } from "../../src/notices.ts";
import { definitions, type FakeSiteDoc, fakeSiteDoc, fixtureDraft, meera } from "./site-doc.ts";

import siteCss from "@repo/blocks/site.css?url";

export const home = PageId.make("pg_home");

const presenceColors = ["teal", "purple", "chocolate", "green", "crimson", "slateblue"];

/** An image the library suggests no alt text for, as for a decorative pattern. */
export const pattern: MediaSummary = {
  id: MediaId.make("med_pattern"),
  contentType: "image/png",
  width: 1200,
  height: 800,
  alt: "",
};

const media: ReadonlyArray<MediaSummary> = [
  ...Object.entries(fixtureSite.media).map(([id, file]) => ({
    id: MediaId.make(id),
    ...file,
    alt: "Two sailing boats on a calm harbour at sunset",
  })),
  pattern,
];

/** A 1x1 image, so the canvas needs no media server. */
const pixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

/** Undo and redo, as Studio's toolbar shows them. */
function Toolbar() {
  return (
    <div role="toolbar" aria-label="Editor">
      {useToolbarCommands().map((command) => (
        <button key={command.title} type="button" disabled={command.disabled} onClick={command.run}>
          {command.title}
        </button>
      ))}
    </div>
  );
}

/**
 * The editor as Studio lays it out, for Meera, on a SiteDoc the test can
 * drive. The notices it shows are collected.
 */
export const openEditor = async (
  options: {
    readonly draft?: Draft;
    readonly page?: PageId;
    readonly definitions?: ReadonlyMap<BlockType, BlockDefinition>;
    readonly siteDoc?: FakeSiteDoc;
  } = {},
) => {
  const siteDoc =
    options.siteDoc ??
    (options.draft === undefined ? fakeSiteDoc() : fakeSiteDoc({ draft: options.draft }));
  const notices: Array<Notice> = [];
  await page.viewport(1440, 900);
  await render(
    <EditorProvider
      draft={options.draft ?? fixtureDraft}
      live={(options.draft ?? fixtureDraft).base}
      page={options.page ?? home}
      definitions={options.definitions ?? definitions}
      media={media}
      mediaSrc={() => pixel}
      suggestAltText={async () => "Boats moored in the harbour at sunset"}
      siteCss={siteCss}
      settings={fixtureSite.settings}
      scheme="light"
      person={meera}
      connection={siteDoc.connection(meera)}
      onNotice={(notice) => notices.push(notice)}
    >
      <Toolbar />
      <div style={{ display: "flex", height: 700 }}>
        <aside aria-label="Structure" style={{ width: 320, flexShrink: 0, overflowY: "auto" }}>
          <EditorOutline />
        </aside>
        <div style={{ flex: 1 }}>
          <EditorCanvas width={1024} accent="blue" presence={presenceColors} />
        </div>
        <aside aria-label="Settings" style={{ width: 360, flexShrink: 0, overflowY: "auto" }}>
          <EditorSettings />
        </aside>
      </div>
    </EditorProvider>,
  );
  await expect.element(page.getByTitle(/^Canvas:/)).toBeVisible();
  const canvas = () => {
    const content = document.querySelector("iframe")?.contentDocument;
    if (content === null || content === undefined) throw new Error("The canvas has no document.");
    return content;
  };
  await expect
    .poll(() => canvas().querySelectorAll("[data-pakshi-block]").length)
    .toBeGreaterThan(0);
  return { siteDoc, canvas, notices };
};
