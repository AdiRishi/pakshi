import type { BlockDefinition } from "@repo/blocks";
import type { BlockId } from "@repo/contracts/ids";
import type { BlockTree, Op, Target } from "@repo/contracts/ops";
import type { BlockInstance } from "@repo/contracts/page";
import type { Surface } from "@repo/tokens";
import { Field, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@repo/ui/components/field";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import { useEffect, useId, useMemo, useState } from "react";

import { useEditorState, useServices, useStore } from "../context.tsx";
import { BlockPreview } from "../preview.tsx";

/** "split-image" as "Split image". */
export const humanize = (name: string) => {
  const words = name.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const surfaceNames: Readonly<Record<Surface, string>> = {
  default: "Page background",
  muted: "Muted",
  brand: "Brand color",
  inverse: "Inverse",
};

/** A placed block and its items as one tree, which a preview renders on its own. */
const useTree = (target: Target, block: BlockId, instance: BlockInstance): BlockTree => {
  const holder = useEditorState((state) =>
    target === "site" ? state.view.parts : state.view.pages[target],
  );
  return useMemo(() => {
    const { slots, ...rest } = instance;
    return {
      ...rest,
      id: block,
      ...(slots !== undefined && {
        slots: Object.fromEntries(
          Object.entries(slots).map(([slot, items]) => [
            slot,
            items.flatMap((item) => {
              const placed = holder?.blocks[item];
              return placed === undefined ? [] : [{ ...placed, id: item }];
            }),
          ]),
        ),
      }),
    };
  }, [holder, block, instance]);
};

/** How long previews wait after the last change before they show it, so typing never renders them. */
const previewDelay = 400;

/** A value that follows `value` once it has stopped changing for a moment. */
const useSettled = <T,>(value: T) => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), previewDelay);
    return () => clearTimeout(timer);
  }, [value]);
  return settled;
};

/**
 * The block's layout and background, each chosen from how it would look: the
 * block's own content in every layout, and a swatch of every background in
 * the draft's theme.
 */
export function Appearance(props: {
  readonly target: Target;
  readonly block: BlockId;
  readonly instance: BlockInstance;
  readonly contract: BlockDefinition;
}) {
  const store = useStore();
  const { scheme } = useServices();
  const colors = useEditorState((state) => state.view.theme.colors[scheme]);
  const tree = useSettled(useTree(props.target, props.block, props.instance));
  const { variants } = props.contract;
  const variantTrees = useMemo(
    () => new Map(variants.map((variant) => [variant, { ...tree, variant }])),
    [tree, variants],
  );
  const idPrefix = useId();
  const surfaces = props.contract.placement === "item" ? [] : props.contract.surfaces;
  const run = (op: Op) => store.run([op]);
  const { target, block } = props;

  return (
    <>
      {props.contract.variants.length > 1 && (
        <FieldSet>
          <FieldLegend variant="label">Layout</FieldLegend>
          <RadioGroup
            value={props.instance.variant}
            onValueChange={(value) => {
              const variant = props.contract.variants.find((candidate) => candidate === value);
              if (variant !== undefined) run({ op: "setVariant", target, block, variant });
            }}
          >
            {props.contract.variants.map((variant) => (
              <FieldLabel key={variant} htmlFor={`${idPrefix}-variant-${variant}`}>
                <Field className="gap-2">
                  <BlockPreview
                    tree={variantTrees.get(variant) ?? tree}
                    title={`${props.contract.title} as ${humanize(variant)}`}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <FieldTitle>{humanize(variant)}</FieldTitle>
                    <RadioGroupItem value={variant} id={`${idPrefix}-variant-${variant}`} />
                  </div>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        </FieldSet>
      )}
      {surfaces.length > 1 && props.instance.surface !== undefined && (
        <FieldSet>
          <FieldLegend variant="label">Background</FieldLegend>
          <RadioGroup
            value={props.instance.surface}
            onValueChange={(value) => {
              const surface = surfaces.find((candidate) => candidate === value);
              if (surface !== undefined) run({ op: "setSurface", target, block, surface });
            }}
            className="grid-cols-2"
          >
            {surfaces.map((surface) => (
              <FieldLabel key={surface} htmlFor={`${idPrefix}-surface-${surface}`}>
                <Field className="gap-2">
                  <div
                    aria-hidden
                    className="flex h-12 items-center justify-between rounded-md border px-3 font-semibold"
                    style={{
                      background: colors[surface].background,
                      color: colors[surface].foreground,
                    }}
                  >
                    Aa
                    <span
                      className="size-4 rounded-full"
                      style={{ background: colors[surface].primary }}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <FieldTitle>{surfaceNames[surface]}</FieldTitle>
                    <RadioGroupItem value={surface} id={`${idPrefix}-surface-${surface}`} />
                  </div>
                </Field>
              </FieldLabel>
            ))}
          </RadioGroup>
        </FieldSet>
      )}
    </>
  );
}
