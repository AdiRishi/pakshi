import { fieldAt } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { Target } from "@repo/contracts/ops";
import { FormRef } from "@repo/contracts/references";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle } from "@repo/ui/components/popover";
import { RadioGroup, RadioGroupItem } from "@repo/ui/components/radio-group";
import { Option, Schema } from "effect";
import { LayersIcon } from "lucide-react";
import { useId } from "react";

import { type FieldTarget, useEditorState, useServices, useStore } from "../context.tsx";
import { valueAt } from "../settings/controls.tsx";
import { screenRect } from "./anchor.tsx";
import { DoneButton } from "./done.tsx";

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

const decodeForm = Schema.decodeUnknownOption(FormRef);

/**
 * Chooses which of the site's forms a block shows. A form's questions belong
 * to the site and every page that shows it, so they're changed elsewhere,
 * which the popover says.
 */
export function FormPopover(props: {
  readonly field: FieldTarget;
  readonly anchor: Element;
  readonly onClose: () => void;
}) {
  const store = useStore();
  const { definitions } = useServices();
  const id = useId();
  const forms = useEditorState((state) => state.view.forms);
  const block = useEditorState(
    (state) => holderOf(state.view, props.field.target)?.blocks[props.field.block],
  );
  const contract = block === undefined ? undefined : definitions.get(block.type);
  const field = contract === undefined ? undefined : fieldAt(contract.fields, props.field.path);
  if (block === undefined || field?.kind !== "form") return null;
  const chosen = Option.getOrUndefined(decodeForm(valueAt(block.props, props.field.path)))?.id;
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
        sideOffset={8}
        className="w-80"
      >
        <PopoverHeader>
          <PopoverTitle id={id} className="font-semibold">
            Which form?
          </PopoverTitle>
        </PopoverHeader>
        <RadioGroup
          aria-labelledby={id}
          value={chosen ?? ""}
          onValueChange={(value) => {
            const form = Object.values(forms).find((candidate) => candidate.id === value);
            if (form !== undefined)
              store.run([{ op: "setProp", ...props.field, value: { $ref: "form", id: form.id } }]);
          }}
          className="gap-2"
        >
          {Object.values(forms).map((form) => (
            <label
              key={form.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 font-medium has-data-checked:border-foreground has-data-checked:ring-1 has-data-checked:ring-foreground"
            >
              <RadioGroupItem value={form.id} />
              {form.name}
            </label>
          ))}
        </RadioGroup>
        <p className="flex gap-2.5 rounded-lg bg-warning p-3 text-warning-foreground">
          <LayersIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          Forms are shared between pages. To change this form's questions, go to Site settings, then
          Forms. Every page that uses it changes too.
        </p>
        <div className="flex justify-end">
          <DoneButton onClick={props.onClose} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
