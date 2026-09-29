import type { Command } from "./commands.ts";
import type { EditorUi } from "./context.tsx";
import type { EditorStore } from "./store.ts";

/** Where a command started. Focus follows the selection there once it has run. */
export type Origin = "canvas" | "outline" | "elsewhere";

/** Runs a command if it can run now, and says whether it ran. */
export const runCommand = <Args>(
  { store, ui }: { readonly store: EditorStore; readonly ui: EditorUi },
  command: Command<Args>,
  args: Args,
  origin: Origin,
) => {
  const effect = command.plan({ state: store.getState(), contracts: store.contracts }, args);
  if (effect === undefined) return false;
  switch (effect.kind) {
    case "change": {
      // The ops were planned against this same state, so the document module accepts them.
      if (store.run(effect.ops).length > 0) return false;
      if (effect.select !== undefined) store.select(effect.select);
      ui.announce(effect.announce(store.getState().view));
      break;
    }
    case "select":
      store.select(effect.selection);
      break;
    case "undo":
      store.undo();
      break;
    case "redo":
      store.redo();
      break;
    case "pick":
      ui.openPicker({ list: effect.list, after: effect.after }, origin);
      return true;
  }
  ui.focusSelection(origin);
  return true;
};
