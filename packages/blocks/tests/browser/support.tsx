import { noIdentity } from "@repo/contracts/brand";
import { BlockType, MediaId } from "@repo/contracts/ids";
import type { BlockTree } from "@repo/contracts/ops";
import { listingsOf } from "@repo/contracts/snapshot";
import axe from "axe-core";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { onTestFinished } from "vitest";
import { render } from "vitest-browser-react";

import {
  type FieldEditing,
  FieldEditingProvider,
  type SiteData,
  SiteDataProvider,
} from "../../src/components.tsx";
import { blockFixtures, fixtureSite, fixtureTree } from "../../src/fixtures.ts";
import { latestLockfile, loadBlocks, renderTree } from "../../src/render.tsx";
import { sampleMedia } from "../../src/sample-media.ts";
import { siteData } from "../../src/site-data.ts";

/*
 * Blocks as a visitor's browser shows them: the newest versions, on the
 * fixture site, in the default theme, with sample images.
 */

const site = siteData({
  ...fixtureSite,
  pages: listingsOf(fixtureSite.pages),
  identity: noIdentity,
  media: (id) => sampleMedia.get(MediaId.make(id)),
});

/** A block's fixture by its file name, such as `faq`'s `accordion`, as a placed block. */
export const fixture = (type: string, name: string): BlockTree => {
  const entry = blockFixtures.find(
    (candidate) =>
      candidate.type === BlockType.make(type) &&
      candidate.version === latestLockfile[type] &&
      candidate.name === name,
  );
  if (entry === undefined) throw new Error(`${type} has no fixture named ${name}.`);
  return fixtureTree(entry);
};

/**
 * Shows a block on a page, as a site renders it, with the site's data changed
 * by `data`. An item shows in a list, as its section's slot holds it.
 */
export const show = async (tree: BlockTree, data: Partial<SiteData> = {}) => {
  const definitions = await loadBlocks(latestLockfile);
  const block = renderTree(definitions, tree);
  return render(
    <SiteDataProvider value={{ ...site, ...data }}>
      <main>{definitions.get(tree.type)?.placement === "item" ? <ul>{block}</ul> : block}</main>
    </SiteDataProvider>,
  );
};

/**
 * Plain stand-ins for the editor's field components, each marking its
 * element with the field it edits, as the canvas's do.
 */
const editing: FieldEditing = {
  Root: ({ element: Element, surface, className, children }) => (
    <Element data-surface={surface} className={className}>
      {children}
    </Element>
  ),
  Text: ({ as: Element, path, value, className }) => (
    <Element data-field={path.join(".")} className={className}>
      {value}
    </Element>
  ),
  RichText: ({ path, className }) => <div data-field={path.join(".")} className={className} />,
  Media: ({ path, file, value, className }) => (
    <img data-field={path.join(".")} src={file.src} alt={value.alt ?? ""} className={className} />
  ),
  Cta: ({ path, href, value, className }) => (
    <a data-field={path.join(".")} href={href} className={className}>
      {value.label}
    </a>
  ),
  Slot: ({ as: Element = "div", className, children }) => (
    <Element className={className}>{children}</Element>
  ),
  Form: ({ render: form }) => form({}),
};

/** Shows a block as the editor canvas renders it, with its fields editable. */
export const showEditing = async (tree: BlockTree) => {
  const definitions = await loadBlocks(latestLockfile);
  const block = renderTree(definitions, tree);
  return render(
    <FieldEditingProvider value={editing}>
      <SiteDataProvider value={site}>
        <main>{definitions.get(tree.type)?.placement === "item" ? <ul>{block}</ul> : block}</main>
      </SiteDataProvider>
    </FieldEditingProvider>,
  );
};

/**
 * Puts a block's server HTML on the page, as a site sends it, for a visitor
 * to use before `hydrate` lets React take it over.
 */
export const serverRendered = async (tree: BlockTree) => {
  const definitions = await loadBlocks(latestLockfile);
  const page = (
    <SiteDataProvider value={site}>
      <main>{renderTree(definitions, tree)}</main>
    </SiteDataProvider>
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(page);
  document.body.append(container);
  onTestFinished(() => container.remove());
  return {
    hydrate: () => {
      const root = hydrateRoot(container, page);
      onTestFinished(() => root.unmount());
    },
  };
};

/** What axe finds against WCAG 2.2 AA in an element. */
export const accessibilityViolations = async (element: Element) =>
  (
    await axe.run(element, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
    })
  ).violations.map((violation) => `${violation.id}: ${violation.help}`);
