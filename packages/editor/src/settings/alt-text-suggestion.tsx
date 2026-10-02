import type { MediaId } from "@repo/contracts/ids";
import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";
import { SparklesIcon } from "lucide-react";
import { useState } from "react";

import { type FieldTarget, useServices, useStore } from "../context.tsx";

type Suggesting =
  | { readonly status: "idle" }
  | { readonly status: "asking" }
  | { readonly status: "suggested"; readonly text: string }
  | { readonly status: "none" };

/**
 * Asks Pakshi for alt text for an image field's image, and shows it for the
 * person to use or leave. Nothing changes until they use it. A suggestion
 * belongs to the image and field it was asked for, so it's dropped when
 * either changes, even if it arrives after.
 */
export function AltTextSuggestion(props: { readonly field: FieldTarget; readonly media: MediaId }) {
  const { suggestAltText } = useServices();
  const store = useStore();
  const { target, block, path } = props.field;
  const image = JSON.stringify([target, block, path, props.media]);
  const [asked, setAsked] = useState<{ readonly image: string; readonly suggesting: Suggesting }>({
    image,
    suggesting: { status: "idle" },
  });
  const suggesting: Suggesting = asked.image === image ? asked.suggesting : { status: "idle" };
  const setSuggesting = (next: Suggesting) => setAsked({ image, suggesting: next });
  const settle = (next: Suggesting) =>
    setAsked((current) => (current.image === image ? { image, suggesting: next } : current));
  const ask = () => {
    if (suggestAltText === null) return;
    setSuggesting({ status: "asking" });
    suggestAltText(props.media, block).then(
      (text) => settle(text === null ? { status: "none" } : { status: "suggested", text }),
      () => settle({ status: "none" }),
    );
  };
  if (suggestAltText === null) return null;
  switch (suggesting.status) {
    case "idle":
      return (
        <Button type="button" variant="ghost" size="xs" className="self-start" onClick={ask}>
          <SparklesIcon />
          Suggest alt text
        </Button>
      );
    case "asking":
      return (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Spinner className="size-3.5" />
          Pakshi is looking at the image
        </p>
      );
    case "none":
      return (
        <p className="text-xs text-muted-foreground">
          Pakshi couldn't suggest alt text for this image.
        </p>
      );
    case "suggested":
      return (
        <div className="flex flex-col gap-2 rounded-md border border-dashed p-2.5 text-sm">
          <p>
            <span className="text-xs font-semibold text-muted-foreground">Pakshi suggests: </span>
            {suggesting.text}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="xs"
              onClick={() => {
                store.run([
                  {
                    op: "setProp",
                    target,
                    block,
                    path: [...path, "alt"],
                    value: suggesting.text,
                  },
                ]);
                setSuggesting({ status: "idle" });
              }}
            >
              Use this
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setSuggesting({ status: "idle" })}
            >
              Dismiss
            </Button>
          </div>
        </div>
      );
  }
}
