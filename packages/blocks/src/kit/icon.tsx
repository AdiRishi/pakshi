import type { IconName } from "../icon-names.ts";
import { icons } from "../icons.tsx";

/** An icon from the library's set, drawn in the current text color and hidden from screen readers. */
export const Icon = (props: { readonly name: IconName; readonly className?: string }) => {
  const Glyph = icons[props.name];
  return <Glyph aria-hidden className={props.className} />;
};
