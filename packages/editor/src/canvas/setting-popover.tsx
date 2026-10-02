import { fieldAt } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { Target } from "@repo/contracts/ops";
import { Popover, PopoverContent } from "@repo/ui/components/popover";

import { type FieldTarget, useEditorState, useServices } from "../context.tsx";
import { FieldControl, valueAt } from "../settings/controls.tsx";
import { DoneButton } from "./done.tsx";

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

/** A setting the page doesn't draw, such as which blog a list shows, in a popover from the row naming it. */
export function SettingPopover(props: {
  readonly field: FieldTarget;
  readonly anchor: Element;
  readonly onClose: () => void;
}) {
  const { definitions } = useServices();
  const block = useEditorState(
    (state) => holderOf(state.view, props.field.target)?.blocks[props.field.block],
  );
  const contract = block === undefined ? undefined : definitions.get(block.type);
  const definition =
    contract === undefined ? undefined : fieldAt(contract.fields, props.field.path);
  if (block === undefined || definition === undefined) return null;
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <PopoverContent anchor={props.anchor} side="bottom" align="start" className="w-80">
        <FieldControl
          field={props.field}
          definition={definition}
          value={valueAt(block.props, props.field.path)}
        />
        <div className="flex justify-end">
          <DoneButton onClick={props.onClose} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
