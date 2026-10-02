import { placeholderTree, presentationOf } from "@repo/blocks";
import type { BlockType } from "@repo/contracts/ids";
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "@repo/ui/components/command";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
} from "@repo/ui/components/popover";
import { type ComponentProps, useMemo, useRef, useState } from "react";

import { insert } from "./commands.ts";
import { type InsertSpot, useEditorState, useEditorUi, useServices } from "./context.tsx";
import { BlockPreview } from "./preview.tsx";
import { type Origin, runCommand } from "./run-command.ts";
import { allowedTypes, slotOf } from "./structure.ts";

type Anchor = ComponentProps<typeof PopoverContent>["anchor"];

/**
 * Chooses a block to add at a spot. It lists only the blocks that can go
 * there, and previews the highlighted one with the placeholder content a new
 * one starts with.
 */
export function BlockPicker(props: {
  readonly spot: InsertSpot;
  readonly anchor: Anchor;
  readonly origin: Origin;
  readonly onClose: () => void;
}) {
  const { store, definitions } = useServices();
  const ui = useEditorUi();
  const page = useEditorState((state) => state.view.pages[state.page]);
  const [types] = useState(() =>
    page === undefined ? [] : allowedTypes(page, definitions, props.spot.list),
  );
  const [active, setActive] = useState<string>(types[0] ?? "");
  const chosen = useRef(false);
  const previews = useMemo(
    () => new Map(types.map((type) => [type, placeholderTree(definitions, type)])),
    [types, definitions],
  );

  const { list } = props.spot;
  const slot = page === undefined || list === "root" ? undefined : slotOf(page, definitions, list);
  const title = slot === undefined ? "Add a section" : `Add to ${slot.title}`;
  const activeType = types.find((type) => type === active);
  const activeContract = activeType === undefined ? undefined : definitions.get(activeType);
  const activePreview = activeType === undefined ? undefined : previews.get(activeType);

  const choose = (type: BlockType) => {
    chosen.current = true;
    runCommand({ store, ui }, insert, { ...props.spot, type }, props.origin);
    props.onClose();
  };

  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <PopoverContent
        anchor={props.anchor}
        side="bottom"
        className="w-[42rem] gap-0 p-0"
        finalFocus={() => !chosen.current}
      >
        <Command value={active} onValueChange={setActive} label={title}>
          <PopoverHeader className="px-3 pt-3 pb-2">
            <PopoverTitle>{title}</PopoverTitle>
            <PopoverDescription>Only blocks that fit here are shown.</PopoverDescription>
          </PopoverHeader>
          <CommandInput placeholder="Search blocks" />
          <div className="flex gap-3 p-2">
            <CommandList className="max-h-80 w-56 shrink-0">
              <CommandEmpty>No block fits that search.</CommandEmpty>
              {types.map((type) => (
                <CommandItem
                  key={type}
                  value={type}
                  keywords={[definitions.get(type)?.title ?? type]}
                  onSelect={() => choose(type)}
                >
                  {definitions.get(type)?.title}
                </CommandItem>
              ))}
            </CommandList>
            {activeContract !== undefined && activePreview !== undefined && (
              <figure className="flex min-w-0 flex-1 flex-col gap-2">
                <BlockPreview
                  key={activeContract.type}
                  tree={activePreview}
                  title={`Preview: ${activeContract.title}`}
                />
                <figcaption className="text-xs text-muted-foreground">
                  {presentationOf(activeContract.type).summary}
                </figcaption>
              </figure>
            )}
          </div>
          <p className="border-t px-3 py-2 text-xs text-muted-foreground">
            A new block starts with placeholder content. Replace it before you submit.
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
