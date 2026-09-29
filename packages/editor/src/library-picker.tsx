import type { MediaId } from "@repo/contracts/ids";
import type { MediaRef } from "@repo/contracts/references";

import { useServices } from "./context.tsx";

/**
 * The site's image library as thumbnails. Choosing an image other than the
 * current one places it with the alt text the library suggests.
 */
export function LibraryPicker(props: {
  readonly chosen: MediaId | undefined;
  readonly onChoose: (image: MediaRef) => void;
}) {
  const { media, mediaSrc } = useServices();
  return (
    <ul className="grid grid-cols-3 gap-2" aria-label="Library">
      {media.map((file) => (
        <li key={file.id}>
          <button
            type="button"
            aria-pressed={props.chosen === file.id}
            aria-label={file.alt === "" ? file.id : file.alt}
            className="block aspect-square w-full overflow-hidden rounded-md border-2 border-transparent focus-visible:border-ring focus-visible:outline-none aria-pressed:border-ring"
            onClick={() => {
              if (props.chosen !== file.id)
                props.onChoose({ $ref: "media", id: file.id, alt: file.alt });
            }}
          >
            <img src={mediaSrc(file.id)} alt="" className="size-full object-cover" />
          </button>
        </li>
      ))}
    </ul>
  );
}
