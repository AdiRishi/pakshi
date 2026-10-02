import { fieldAt } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { Target } from "@repo/contracts/ops";
import { Button } from "@repo/ui/components/button";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle } from "@repo/ui/components/popover";
import { Schema } from "effect";
import { PlusIcon } from "lucide-react";
import { useId, useRef, useState } from "react";

import { burstKey, type FieldTarget, useEditorState, useServices, useStore } from "../context.tsx";
import { neededParts } from "../layouts.ts";
import { LibraryPicker } from "../library-picker.tsx";
import { AltTextSuggestion } from "../settings/alt-text-suggestion.tsx";
import { valueAt } from "../settings/controls.tsx";
import { FieldInput } from "../settings/field-text.tsx";
import { screenRect } from "./anchor.tsx";
import { DoneButton } from "./done.tsx";

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

/** How tall an image must be drawn before its popover opens on top of it rather than under it. */
const coveredHeight = 240;

/**
 * Changes an image: another from the library, or one uploaded where uploads
 * are allowed, and the words that describe it for people who can't see it,
 * which belong to this placement. It renders in Studio, on the image itself.
 */
export function MediaPopover(props: {
  readonly field: FieldTarget;
  readonly anchor: Element;
  readonly onClose: () => void;
}) {
  const store = useStore();
  const { definitions, uploadImage, suggestAltText } = useServices();
  const fileInput = useRef<HTMLInputElement>(null);
  const altId = useId();
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Adds the chosen file to the library and places it here. */
  const upload = async (input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = "";
    if (file === undefined || uploadImage === null) return;
    setUploading(true);
    setProblem(null);
    try {
      const image = await uploadImage(file);
      // A new image has no alt text yet, so it's left for someone to write before submitting.
      store.run([{ op: "setProp", ...props.field, value: { $ref: "media", id: image.id } }]);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setUploading(false);
    }
  };
  const block = useEditorState(
    (state) => holderOf(state.view, props.field.target)?.blocks[props.field.block],
  );
  const definition = block === undefined ? undefined : definitions.get(block.type);
  const field = definition === undefined ? undefined : fieldAt(definition.fields, props.field.path);
  if (block === undefined || definition === undefined || field?.kind !== "media") return null;
  const value = valueAt(block.props, props.field.path);
  const chosen = value === undefined ? undefined : Schema.decodeSync(field.draft)(value);
  const [name] = props.field.path;
  const removable =
    field.optional &&
    chosen !== undefined &&
    !(
      props.field.path.length === 1 &&
      name !== undefined &&
      neededParts(definition, block.variant).has(name)
    );
  const altField = { ...props.field, path: [...props.field.path, "alt"] };
  const drawn = screenRect(props.anchor);
  const covers = drawn !== null && drawn.height > coveredHeight;

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <PopoverContent
        anchor={{ getBoundingClientRect: () => screenRect(props.anchor) ?? new DOMRect() }}
        side="bottom"
        align="start"
        // A big image takes the popover on itself, so it opens where the image is.
        sideOffset={covers && drawn !== null ? 24 - drawn.height : 8}
        alignOffset={covers ? 24 : 0}
        className="w-96 gap-5"
      >
        <PopoverHeader>
          <PopoverTitle className="font-semibold">Change {field.title.toLowerCase()}</PopoverTitle>
        </PopoverHeader>
        <div className="-mx-1 max-h-64 overflow-y-auto p-1">
          <LibraryPicker
            label={`Photos to choose from for the ${field.title.toLowerCase()}`}
            chosen={chosen?.id}
            onChoose={(image) => store.run([{ op: "setProp", ...props.field, value: image }])}
            add={
              uploadImage === null ? undefined : (
                <>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(event) => void upload(event.target)}
                  />
                  <button
                    type="button"
                    disabled={uploading}
                    className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ring/40 bg-accent text-xs font-medium text-link hover:border-ring focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60"
                    onClick={() => fileInput.current?.click()}
                  >
                    <PlusIcon className="size-4" />
                    {uploading ? "Uploading" : "Upload"}
                  </button>
                </>
              )
            }
          />
        </div>
        {problem !== null && <p className="text-sm text-destructive">{problem}</p>}
        <Field>
          <FieldLabel htmlFor={altId}>Describe it for people who can't see it</FieldLabel>
          <FieldInput
            id={altId}
            value={chosen?.alt ?? ""}
            maxLength={field.parts.alt.max}
            onValue={(alt) =>
              store.run([{ op: "setProp", ...altField, value: alt }], burstKey(altField))
            }
            onBlur={() => store.endBurst()}
          />
          <FieldDescription>
            Leave it empty if the photo is only there to look nice.
          </FieldDescription>
        </Field>
        {chosen !== undefined && suggestAltText !== null && (
          <AltTextSuggestion field={props.field} media={chosen.id} />
        )}
        <div className="flex items-center justify-between gap-2">
          {removable ? (
            <Button
              variant="link"
              size="sm"
              className="px-0 text-destructive"
              onClick={() => {
                store.run([{ op: "setProp", ...props.field }]);
                props.onClose();
              }}
            >
              Remove
            </Button>
          ) : (
            <span />
          )}
          <DoneButton onClick={props.onClose} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
