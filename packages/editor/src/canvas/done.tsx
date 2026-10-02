import { Button } from "@repo/ui/components/button";

/** Closes a popover or panel on the canvas, whose changes are already made. */
export function DoneButton(props: { readonly onClick: () => void }) {
  return (
    <Button
      size="sm"
      className="bg-foreground px-4 text-background hover:bg-foreground/85"
      onClick={props.onClick}
    >
      Done
    </Button>
  );
}
