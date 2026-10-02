import type { BlockDefinition } from "@repo/blocks";
import { blockShowcase, showcaseMediaSrc } from "@repo/blocks/fixtures";
import { type BlockType, PageId } from "@repo/contracts/ids";
import { useMemo, useState } from "react";

import type { CanvasColors } from "../canvas/frame.tsx";
import type { SiteContent } from "../canvas/site-content.ts";
import { redo, undo } from "../commands.ts";
import { EditorRoot } from "../editor.tsx";
import { type Connection, EditorStore } from "../store.ts";
import { CustomizerBar } from "./bar.tsx";
import { PartsPanel } from "./parts.tsx";
import { ShowcaseProvider } from "./showcase.tsx";
import { type Screen, Stage } from "./stage.tsx";

/** A connection that never opens: the customizer's changes stay in the browser and are never saved. */
const nowhere: Connection = { open: () => ({ send: () => undefined, close: () => undefined }) };

/** Undo and redo are the only shortcuts, since the block is the only thing on the page. */
const keys = [undo, redo];

/**
 * One block type, shown with its example content and changed right on the
 * block, with every pattern the site editor uses: words typed in place, a
 * photo's popover, a button's destination, lists of items, parts left out
 * and added back. Above it are its layouts, backgrounds and screens; beside
 * it, everything it holds. Every block gets the same page from its
 * definition and presentation. Nothing is saved: the changes live only
 * until the page closes, or `key` changes to start over.
 */
export function BlockCustomizer(props: {
  readonly type: BlockType;
  /** The newest version of every block type, by type. */
  readonly definitions: ReadonlyMap<BlockType, BlockDefinition>;
  /** The address of the stylesheet `sites` renders pages with. */
  readonly siteCss: string;
  readonly colors: CanvasColors;
}) {
  const showcase = useMemo(
    () => blockShowcase(props.definitions, props.type),
    [props.definitions, props.type],
  );
  const contract = props.definitions.get(props.type);
  const item = contract?.placement === "item" ? props.type : null;
  const [store] = useState(() => {
    const created = new EditorStore({
      draft: showcase.draft,
      live: showcase.draft.base,
      page: showcase.target === "site" ? PageId.make("pg_home") : showcase.target,
      contracts: props.definitions,
      person: { id: "user_showcase", name: "You" },
      connection: nowhere,
      onNotice: () => undefined,
    });
    // An item's page starts on the first one, inside the section that holds it.
    const first = Object.values(showcase.tree.slots ?? {})
      .flat()
      .find((placed) => placed.type === item);
    if (first !== undefined)
      created.select({ kind: "block", target: showcase.target, block: first.id });
    return created;
  });
  const [screen, setScreen] = useState<Screen>("computer");
  const [siteContent, setSiteContent] = useState<SiteContent | null>(null);
  const [explaining, explain] = useState<Element | null>(null);
  const context = useMemo(
    () => ({
      type: props.type,
      target: showcase.target,
      shown: showcase.tree.id,
      siteContent,
      setSiteContent,
      explaining,
      explain,
    }),
    [props.type, showcase, siteContent, explaining],
  );

  return (
    <EditorRoot
      store={store}
      definitions={props.definitions}
      media={showcase.media}
      mediaSrc={showcaseMediaSrc}
      suggestAltText={null}
      uploadImage={null}
      examples="sample"
      siteCss={props.siteCss}
      settings={showcase.settings}
      scheme="light"
      keys={keys}
      forms="popover"
    >
      <ShowcaseProvider value={context}>
        <div className="flex flex-col gap-5">
          <CustomizerBar
            target={showcase.target}
            block={showcase.tree.id}
            layouts={item === null}
            screen={screen}
            onScreen={setScreen}
          />
          <div className="flex flex-col items-start gap-5 lg:flex-row">
            <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
              <div className="rounded-xl border bg-[radial-gradient(var(--color-border)_1px,transparent_1px)] bg-size-[--spacing(4)_--spacing(4)] p-6 sm:p-8">
                <Stage
                  target={showcase.target}
                  block={showcase.tree.id}
                  screen={screen}
                  colors={props.colors}
                />
              </div>
              <p className="px-1 text-sm text-secondary-foreground">
                Click any words to change them, or anything else to see its options. Nothing you
                change here is saved.
              </p>
            </div>
            <div className="w-full lg:sticky lg:top-6 lg:w-80 lg:shrink-0">
              <PartsPanel target={showcase.target} block={showcase.tree.id} item={item} />
            </div>
          </div>
        </div>
      </ShowcaseProvider>
    </EditorRoot>
  );
}
