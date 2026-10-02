import { cn } from "cn";
import type { ReactNode } from "react";

/** A plain browser window around a picture of a page, so it reads as a web page. */
export function BrowserFrame(props: { readonly className?: string; readonly children: ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-lg ring-1 ring-foreground/10", props.className)}>
      <div aria-hidden className="flex h-5 items-center gap-1.5 border-b bg-muted px-2.5">
        <span className="size-1.5 rounded-full bg-foreground/15" />
        <span className="size-1.5 rounded-full bg-foreground/15" />
        <span className="size-1.5 rounded-full bg-foreground/15" />
      </div>
      {props.children}
    </div>
  );
}
