import { fieldAt } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { Target } from "@repo/contracts/ops";
import { Button } from "@repo/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import { Schema } from "effect";
import { UploadIcon } from "lucide-react";
import { useRef, useState } from "react";

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
  const { definitions, uploadImage } = useServices();
  const fileInput = useRef<HTMLInputElement>(null);
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
        {uploadImage !== null && (
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
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              disabled={uploading}
              onClick={() => fileInput.current?.click()}
            >
              <UploadIcon />
              {uploading ? "Uploading" : "Upload an image"}
            </Button>
            {problem !== null && <p className="text-sm text-destructive">{problem}</p>}
          </>
        )}
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
