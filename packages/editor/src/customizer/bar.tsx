import { type BlockDefinition, layoutOf, presentationOf } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId } from "@repo/contracts/ids";
import type { Target } from "@repo/contracts/ops";
import type { BlockInstance } from "@repo/contracts/page";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { cn } from "cn";
import { MonitorIcon, SmartphoneIcon } from "lucide-react";
import { type ReactNode, useMemo } from "react";

import { useDraftSiteData } from "../canvas/page-view.tsx";
import { useEditorState, useServices, useStore } from "../context.tsx";
import { chooseLayout } from "../layouts.ts";
import { surfaceNames } from "../naming.ts";
import { ScaledBlockPreview } from "../preview.tsx";
import { useSettled, useTree } from "../settings/appearance.tsx";
import type { Screen } from "./stage.tsx";

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

/** The page width layout previews lay the block out at, the stage's computer width. */
const previewWidth = 1024;
/** The most of the block a layout preview shows, in its own pixels: a 16:10 window onto it. */
const previewHeight = 640;

function Group(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2.5 text-sm font-medium text-secondary-foreground">
        {props.title}
      </legend>
      {props.children}
    </fieldset>
  );
}

/** Each layout drawn small, with the block's own words, and what the chosen one does. */
function Layouts(props: {
  readonly target: Target;
  readonly block: BlockId;
  readonly instance: BlockInstance;
  readonly contract: BlockDefinition;
}) {
  const store = useStore();
  const { definitions, siteCss, scheme, examples } = useServices();
  const theme = useEditorState((state) => state.view.brand.theme);
  const data = useDraftSiteData();
  const tree = useSettled(useTree(props.target, props.block, props.instance));
  const { type } = props.contract;
  // In the order the block's presentation lists them, which starts with the one to try first.
  const variants = useMemo(
    () =>
      Object.keys(presentationOf(type).variants).filter((variant) =>
        props.contract.variants.includes(variant),
      ),
    [type, props.contract.variants],
  );
  const trees = useMemo(
    () => new Map(variants.map((variant) => [variant, { ...tree, variant }])),
    [tree, variants],
  );
  const chosen = layoutOf(type, props.instance.variant);
  return (
    <Group title="Layout">
      <div className="flex flex-wrap gap-3">
        {variants.map((variant) => {
          const layout = layoutOf(type, variant);
          const pressed = variant === props.instance.variant;
          return (
            <button
              key={variant}
              type="button"
              aria-pressed={pressed}
              className="group flex w-36 flex-col gap-1.5 rounded-lg text-left outline-none"
              onClick={() =>
                store.run(
                  chooseLayout({
                    contract: props.contract,
                    target: props.target,
                    block: props.block,
                    instance: props.instance,
                    variant,
                    source: examples,
                  }),
                )
              }
            >
              <span
                className={cn(
                  "block aspect-[16/10] w-full overflow-hidden rounded-md bg-card ring-1 ring-border transition-shadow group-hover:ring-ring/60 group-focus-visible:ring-2 group-focus-visible:ring-ring",
                  pressed && "ring-2 ring-foreground group-hover:ring-foreground",
                )}
              >
                <ScaledBlockPreview
                  title={`${layout.label}, drawn small`}
                  siteCss={siteCss}
                  theme={theme}
                  scheme={scheme}
                  data={data}
                  definitions={definitions}
                  tree={trees.get(variant) ?? tree}
                  width={previewWidth}
                  maxHeight={previewHeight}
                  loading={<Skeleton className="absolute inset-0 rounded-none" />}
                />
              </span>
              <span
                className={cn(
                  "text-sm",
                  pressed ? "font-semibold text-foreground" : "text-secondary-foreground",
                )}
              >
                {layout.label}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-2.5 text-sm text-secondary-foreground">{chosen.description}</p>
    </Group>
  );
}

/** The block's background, from the same four on every block, in the brand's colors. */
function Backgrounds(props: {
  readonly target: Target;
  readonly block: BlockId;
  readonly instance: BlockInstance;
  readonly contract: BlockDefinition;
}) {
  const store = useStore();
  const { scheme } = useServices();
  const colors = useEditorState((state) => state.view.brand.theme.colors[scheme]);
  if (props.contract.placement === "item") return null;
  const current = props.instance.surface ?? "default";
  return (
    <Group title="Background">
      <div className="flex gap-2">
        {props.contract.surfaces.map((surface) => (
          <button
            key={surface}
            type="button"
            aria-pressed={surface === current}
            className="group flex min-w-14 flex-col items-center gap-1.5 rounded-lg text-sm text-secondary-foreground outline-none aria-pressed:font-semibold aria-pressed:text-foreground"
            onClick={() =>
              store.run([{ op: "setSurface", target: props.target, block: props.block, surface }])
            }
          >
            <span
              aria-hidden
              className="size-10 rounded-lg ring-1 ring-foreground/15 transition-shadow ring-inset group-hover:ring-ring/60 group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-ring group-aria-pressed:ring-2 group-aria-pressed:ring-foreground group-aria-pressed:ring-offset-2 group-aria-pressed:ring-offset-card"
              style={{ background: colors[surface].background }}
            />
            {surfaceNames[surface]}
          </button>
        ))}
      </div>
    </Group>
  );
}

/**
 * The choices above the block, the same on every block: its layout, when it
 * has more than one, its background, and the screen it's shown on.
 */
export function CustomizerBar(props: {
  readonly target: Target;
  readonly block: BlockId;
  /** Whether the layouts are the block's own, rather than an item's inside it, which has one. */
  readonly layouts: boolean;
  readonly screen: Screen;
  readonly onScreen: (screen: Screen) => void;
}) {
  const { definitions } = useServices();
  const instance = useEditorState(
    (state) => holderOf(state.view, props.target)?.blocks[props.block],
  );
  const contract = instance === undefined ? undefined : definitions.get(instance.type);
  if (instance === undefined || contract === undefined) return null;
  const placed = { target: props.target, block: props.block, instance, contract };
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-6 rounded-xl border bg-card p-5 [&>*+*]:border-l [&>*+*]:pl-8">
      {props.layouts && contract.variants.length > 1 && <Layouts {...placed} />}
      <Backgrounds {...placed} />
      <Group title="Screen">
        <ToggleGroup
          aria-label="Screen"
          value={[props.screen]}
          spacing={1}
          className="rounded-lg bg-muted p-1"
          onValueChange={(values) => {
            const screen = (["computer", "phone"] as const).find((value) => values.includes(value));
            if (screen !== undefined) props.onScreen(screen);
          }}
        >
          <ToggleGroupItem
            value="computer"
            className="rounded-md px-3 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm"
          >
            <MonitorIcon />
            Computer
          </ToggleGroupItem>
          <ToggleGroupItem
            value="phone"
            className="rounded-md px-3 aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm"
          >
            <SmartphoneIcon />
            Phone
          </ToggleGroupItem>
        </ToggleGroup>
      </Group>
    </div>
  );
}
