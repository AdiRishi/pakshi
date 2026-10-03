import { noIdentity } from "@repo/contracts/brand";
import { BlockId, BlockType, MediaId } from "@repo/contracts/ids";
import type { BlockTree } from "@repo/contracts/ops";
import { listingsOf } from "@repo/contracts/snapshot";
import { type ColorScheme, defaultTheme, resolveTheme, themeCss } from "@repo/tokens";
import { type ReactElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { SiteDataProvider } from "../src/components.tsx";
import { blockFixtures, fixtureSite, fixtureTree } from "../src/fixtures.ts";
import { latestLockfile, loadBlocks, renderTree } from "../src/render.tsx";
import { sampleMedia } from "../src/sample-media.ts";
import { siteData } from "../src/site-data.ts";
import { labMedia } from "./media.ts";
import { type Scene, type SceneBlock, scenes } from "./scenes/index.ts";
import { themes } from "./scenes/themes.ts";

const params = new URLSearchParams(location.search);
const scheme: ColorScheme = params.get("scheme") === "dark" ? "dark" : "light";
const definitions = await loadBlocks(latestLockfile);

let counter = 0;
const tree = (block: SceneBlock): BlockTree => {
  counter += 1;
  const id = BlockId.make(`b_lab${counter}`);
  return {
    type: BlockType.make(block.type),
    variant: block.variant,
    ...(block.surface !== undefined && { surface: block.surface }),
    props: block.props,
    id,
    ...(block.slots !== undefined && {
      slots: Object.fromEntries(
        Object.entries(block.slots).map(([slot, items]) => [
          slot,
          items.map((item, index) => ({
            type: BlockType.make(item.type),
            variant: item.variant,
            props: item.props,
            id: BlockId.make(`${id}${slot}${index}`),
          })),
        ]),
      ),
    }),
  };
};

const themeName = params.get("theme");
const preset = Object.entries(themes).find(([name]) => name === themeName)?.[1] ?? defaultTheme;
// Asking for a scheme shows the theme in it, whatever color mode the theme fixes.
const theme = params.has("scheme") ? { ...preset, colorMode: "system" as const } : preset;

const data = (scene: Scene | undefined) => ({
  ...siteData({
    settings: { ...fixtureSite.settings, name: scene?.siteName ?? fixtureSite.settings.name },
    identity: noIdentity,
    menus: scene?.menus ?? fixtureSite.menus,
    pages: listingsOf(fixtureSite.pages),
    forms: fixtureSite.forms,
    media: (id) => labMedia.get(id) ?? sampleMedia.get(MediaId.make(id)),
  }),
  motion: resolveTheme(theme).theme.motion,
});

const render = (block: BlockTree): ReactElement => renderTree(definitions, block);

const Page = ({ scene }: { readonly scene: Scene }) => (
  <>
    <style>{themeCss(resolveTheme(theme).theme, scheme)}</style>
    <SiteDataProvider value={data(scene)}>
      {render(tree(scene.header))}
      <main>{scene.sections.map((section) => render(tree(section)))}</main>
      {render(tree(scene.footer))}
    </SiteDataProvider>
  </>
);

/** Every fixture of the newest version of every block, under a label. */
const Fixtures = ({ only }: { readonly only: string | null }) => {
  const entries = blockFixtures.filter(
    (entry) =>
      latestLockfile[entry.type] === entry.version && (only === null || entry.type === only),
  );
  const site = data(undefined);
  return (
    <>
      <style>{themeCss(resolveTheme(defaultTheme).theme, scheme)}</style>
      <SiteDataProvider value={site}>
        <main>
          {entries.map((entry) => (
            <div key={`${entry.type}${entry.name}`} data-fixture={`${entry.type}-${entry.name}`}>
              <p
                style={{
                  font: "12px monospace",
                  padding: "4px 8px",
                  background: "#ff0",
                  color: "#000",
                }}
              >
                {entry.type}@{entry.version} {entry.name}
              </p>
              {render(fixtureTree(entry))}
            </div>
          ))}
        </main>
      </SiteDataProvider>
    </>
  );
};

const name = params.get("scene");
const scene = scenes.find((candidate) => candidate.name === name);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {scene !== undefined ? (
      <Page scene={scene} />
    ) : name === null ? (
      <Fixtures only={params.get("type")} />
    ) : (
      <p>
        No scene named {name}. Scenes: {scenes.map((s) => s.name).join(", ")}
      </p>
    )}
  </StrictMode>,
);
