import { fieldAt } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { Target } from "@repo/contracts/ops";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import { Schema } from "effect";

import { type FieldTarget, useEditorState, useServices, useStore } from "../context.tsx";
import { LibraryPicker } from "../library-picker.tsx";
import { AltTextSuggestion } from "../settings/alt-text-suggestion.tsx";
import { FieldControl, valueAt } from "../settings/controls.tsx";
import { useCanvasRect } from "./anchor.tsx";

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

/**
 * Replaces an image with one from the library and edits its alt text. It
 * renders in Studio, anchored to the image's place in the canvas.
 */
export function MediaPopover(props: {
  readonly field: FieldTarget;
  readonly anchor: HTMLElement;
  readonly container: HTMLElement;
  readonly onClose: () => void;
}) {
  const store = useStore();
  const { definitions } = useServices();
  const rect = useCanvasRect(props.anchor, props.container);
  const block = useEditorState(
    (state) => holderOf(state.view, props.field.target)?.blocks[props.field.block],
  );
  const definition = block === undefined ? undefined : definitions.get(block.type);
  const field = definition === undefined ? undefined : fieldAt(definition.fields, props.field.path);
  if (block === undefined || field?.kind !== "media") return null;
  const value = valueAt(block.props, props.field.path);
  const chosen = value === undefined ? undefined : Schema.decodeSync(field.draft)(value);

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <PopoverTrigger
        nativeButton={false}
        render={
          <span
            aria-hidden
            className="pointer-events-none absolute"
            style={
              rect === null
                ? { display: "none" }
                : { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
            }
          />
        }
      />
      <PopoverContent side="right" align="start" className="w-96">
        <PopoverHeader>
          <PopoverTitle>{field.title}</PopoverTitle>
          <PopoverDescription>Choose an image from the site's library.</PopoverDescription>
        </PopoverHeader>
        <LibraryPicker
          label="Library"
          chosen={chosen?.id}
          onChoose={(image) => store.run([{ op: "setProp", ...props.field, value: image }])}
        />
        <FieldControl
          field={{ ...props.field, path: [...props.field.path, "alt"] }}
          definition={field.parts.alt}
          value={chosen?.alt ?? ""}
        />
        {chosen !== undefined && <AltTextSuggestion field={props.field} media={chosen.id} />}
        <p className="text-xs text-muted-foreground">
          Say what the image shows for people who can't see it. Leave it empty if the image is only
          decoration.
        </p>
      </PopoverContent>
    </Popover>
  );
}
