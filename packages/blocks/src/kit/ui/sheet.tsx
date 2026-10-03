import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../cn.ts";

/*
 * shadcn/ui's sheet on Base UI: a panel that slides in from an edge over a
 * dimmed page, traps focus while it's open, and closes on Escape, on its
 * close button, or on a click outside.
 */

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetTitle = SheetPrimitive.Title;

export const SheetContent = ({
  className,
  children,
  side = "right",
  closeLabel = "Close",
  ...props
}: SheetPrimitive.Popup.Props & {
  readonly side?: "top" | "right" | "bottom" | "left";
  readonly closeLabel?: string;
}) => (
  <SheetPrimitive.Portal>
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className="fixed inset-0 z-50 bg-foreground/20 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs"
    />
    <SheetPrimitive.Popup
      data-slot="sheet-content"
      data-side={side}
      className={cn(
        "fixed z-50 flex flex-col gap-4 bg-background text-foreground shadow-card transition duration-300 ease-out outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none",
        "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-5/6 data-[side=right]:max-w-sm data-[side=right]:border-l data-[side=right]:border-border data-[side=right]:data-ending-style:translate-x-10 data-[side=right]:data-starting-style:translate-x-10",
        "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-5/6 data-[side=left]:max-w-sm data-[side=left]:border-r data-[side=left]:border-border data-[side=left]:data-ending-style:-translate-x-10 data-[side=left]:data-starting-style:-translate-x-10",
        "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:border-b data-[side=top]:border-border data-[side=top]:data-ending-style:-translate-y-10 data-[side=top]:data-starting-style:-translate-y-10",
        "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:border-t data-[side=bottom]:border-border data-[side=bottom]:data-ending-style:translate-y-10 data-[side=bottom]:data-starting-style:translate-y-10",
        className,
      )}
      {...props}
    >
      {children}
      <SheetPrimitive.Close
        data-slot="sheet-close"
        className="rounded-button absolute top-4 right-4 inline-flex size-10 items-center justify-center text-foreground transition-colors hover:bg-foreground/8 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <XIcon aria-hidden className="size-5" />
        <span className="sr-only">{closeLabel}</span>
      </SheetPrimitive.Close>
    </SheetPrimitive.Popup>
  </SheetPrimitive.Portal>
);

export const SheetHeader = ({ className, ...props }: ComponentProps<"div">) => (
  <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />
);
