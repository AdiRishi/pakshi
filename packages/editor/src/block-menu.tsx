import type { BlockId, PageId } from "@repo/contracts/ids";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import type { ReactElement } from "react";

import { addInto, blockMenuGroups, type Command, moveTo, remove } from "./commands.ts";
import { useEditorState, useEditorUi, useServices, useStore } from "./context.tsx";
import { type Origin, runCommand } from "./run-command.ts";
import { ariaShortcuts, formatShortcut } from "./shortcuts.ts";
import { blockLabel, moveDestinations } from "./structure.ts";

interface MenuProps {
  readonly page: PageId;
  readonly block: BlockId;
  readonly origin: Origin;
}

/** The menu's items. They read the page, so they render only while the menu is open. */
function BlockMenuItems(props: MenuProps) {
  const { store, definitions } = useServices();
  const ui = useEditorUi();
  const state = useEditorState((current) => current);
  const document = state.view.pages[props.page];
  const instance = document?.blocks[props.block];
  const contract = instance === undefined ? undefined : definitions.get(instance.type);
  if (document === undefined || instance === undefined || contract === undefined) return null;
  const context = { state, contracts: store.contracts };
  const chosen = state.selection?.kind === "block" && state.selection.block === props.block;

  const run = <Args,>(command: Command<Args>, args: Args) =>
    runCommand({ store, ui }, command, args, props.origin);
  const item = (command: Command) => (
    <DropdownMenuItem
      key={command.title}
      disabled={!chosen || command.plan(context) === undefined}
      variant={command === remove ? "destructive" : "default"}
      onClick={() => run(command, undefined)}
      aria-keyshortcuts={
        command.keys === undefined ? undefined : ariaShortcuts(command.keys.shortcuts)
      }
    >
      {command.icon !== undefined && <command.icon />}
      {command.title}
      {command.keys !== undefined && (
        <DropdownMenuShortcut>{formatShortcut(command.keys.shortcuts[0])}</DropdownMenuShortcut>
      )}
    </DropdownMenuItem>
  );
  const destinations = moveDestinations(document, definitions, props.block);
  const slots = contract.placement === "section" ? Object.entries(contract.slots) : [];
  const [move, add, change] = blockMenuGroups;

  return (
    <>
      <DropdownMenuGroup>
        {move?.map(item)}
        {destinations.length > 0 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!chosen}>
              <ArrowRightIcon />
              Move to
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {destinations.map(({ list }) => {
                if (list === "root") return null;
                const section = document.blocks[list.block];
                return (
                  <DropdownMenuItem
                    key={`${list.block}:${list.slot}`}
                    onClick={() => run(moveTo, { list })}
                  >
                    {section === undefined ? list.block : blockLabel(definitions, section)}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {slots.map(([slot, spec]) => (
          <DropdownMenuItem key={slot} disabled={!chosen} onClick={() => run(addInto, { slot })}>
            <PlusIcon />
            Add to {spec.title}
          </DropdownMenuItem>
        ))}
        {add?.map(item)}
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>{change?.map(item)}</DropdownMenuGroup>
    </>
  );
}

/**
 * The commands for one block on the page: moving, adding, duplicating and
 * removing it. Opening the menu chooses the block, and each command acts on it.
 */
export function BlockMenu(
  props: MenuProps & {
    readonly open: boolean;
    readonly onOpenChange: (open: boolean) => void;
    readonly trigger: ReactElement;
  },
) {
  const store = useStore();
  return (
    <DropdownMenu
      open={props.open}
      onOpenChange={(open) => {
        if (open) store.select({ kind: "block", target: props.page, block: props.block });
        props.onOpenChange(open);
      }}
    >
      <DropdownMenuTrigger render={props.trigger} />
      {props.open && (
        <DropdownMenuContent align="start" className="w-64">
          <BlockMenuItems page={props.page} block={props.block} origin={props.origin} />
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
