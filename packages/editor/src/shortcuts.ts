import type { Shortcut } from "./commands.ts";

const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform);

/** Whether a key press is exactly this shortcut, with no other modifiers held. */
export const matches = (shortcut: Shortcut, event: KeyboardEvent) =>
  event.key.toLowerCase() === shortcut.key.toLowerCase() &&
  (event.metaKey || event.ctrlKey) === (shortcut.mod ?? false) &&
  event.altKey === (shortcut.alt ?? false) &&
  event.shiftKey === (shortcut.shift ?? false);

/** The names of a shortcut's modifiers, from the names for ⌘ or Ctrl, Alt and Shift. */
const modifiers = (shortcut: Shortcut, [mod, alt, shift]: readonly [string, string, string]) => [
  ...(shortcut.mod ? [mod] : []),
  ...(shortcut.alt ? [alt] : []),
  ...(shortcut.shift ? [shift] : []),
];

/** Names for keys that aren't a single character, on a Mac and elsewhere. */
const keyNames = new Map<string, readonly [mac: string, other: string]>([
  ["ArrowUp", ["↑", "Up"]],
  ["ArrowDown", ["↓", "Down"]],
  ["ArrowLeft", ["←", "Left"]],
  ["ArrowRight", ["→", "Right"]],
  ["Backspace", ["⌫", "Backspace"]],
  ["Delete", ["⌦", "Delete"]],
  ["Enter", ["↩", "Enter"]],
  ["Escape", ["Esc", "Esc"]],
]);

/** A shortcut as menus and tooltips show it: "⌥↑" on a Mac, "Alt+Up" elsewhere. */
export const formatShortcut = (shortcut: Shortcut) => {
  const mac = isMac();
  const names = keyNames.get(shortcut.key);
  const key = names === undefined ? shortcut.key.toUpperCase() : names[mac ? 0 : 1];
  const parts = [...modifiers(shortcut, mac ? ["⌘", "⌥", "⇧"] : ["Ctrl", "Alt", "Shift"]), key];
  return parts.join(mac ? "" : "+");
};

/** Every shortcut of a command in the ARIA `aria-keyshortcuts` syntax. */
export const ariaShortcuts = (shortcuts: ReadonlyArray<Shortcut>) =>
  shortcuts
    .map((shortcut) =>
      [
        ...modifiers(shortcut, [isMac() ? "Meta" : "Control", "Alt", "Shift"]),
        shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key,
      ].join("+"),
    )
    .join(" ");
