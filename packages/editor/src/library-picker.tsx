import type { MediaId } from "@repo/contracts/ids";
import type { MediaRef } from "@repo/contracts/references";
import type { ReactNode } from "react";

import { useServices } from "./context.tsx";

/**
 * The site's image library as thumbnails. Choosing an image other than the
 * current one places it with the alt text the library suggests. `add` ends
 * the grid, such as with a way to upload another.
 */
export function LibraryPicker(props: {
  /** What the thumbnails are for, which screen readers announce. */
  readonly label: string;
  readonly chosen: MediaId | undefined;
  readonly onChoose: (image: MediaRef) => void;
  readonly add?: ReactNode;
}) {
  const { media, mediaSrc } = useServices();
  return (
    <ul className="grid grid-cols-4 gap-2" aria-label={props.label}>
      {media.map((file) => (
        <li key={file.id}>
          <button
            type="button"
            aria-pressed={props.chosen === file.id}
            aria-label={file.alt === "" ? file.id : file.alt}
            className="block aspect-square w-full overflow-hidden rounded-md ring-1 ring-border transition-shadow hover:ring-ring/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-pressed:ring-2 aria-pressed:ring-ring aria-pressed:ring-offset-2 aria-pressed:ring-offset-popover"
            onClick={() => {
              if (props.chosen !== file.id)
                props.onChoose({ $ref: "media", id: file.id, alt: file.alt });
            }}
          >
            <img src={mediaSrc(file.id)} alt="" className="size-full object-cover" />
          </button>
        </li>
      ))}
      {props.add !== undefined && <li>{props.add}</li>}
    </ul>
  );
}
