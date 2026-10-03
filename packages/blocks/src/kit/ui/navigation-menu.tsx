import { NavigationMenu as NavigationMenuPrimitive } from "@base-ui/react/navigation-menu";
import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../cn.ts";

/*
 * shadcn/ui's navigation menu on Base UI: a row of links where an item with
 * children opens a panel on hover, click or the keyboard, and the panel
 * glides between items as the pointer moves along the row.
 */

export const NavigationMenu = ({
  className,
  children,
  ...props
}: NavigationMenuPrimitive.Root.Props) => (
  <NavigationMenuPrimitive.Root
    data-slot="navigation-menu"
    className={cn("relative flex max-w-max flex-1 items-center", className)}
    {...props}
  >
    {children}
    <NavigationMenuPrimitive.Portal>
      <NavigationMenuPrimitive.Positioner
        side="bottom"
        sideOffset={12}
        align="center"
        className="isolate z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width) transition-[top,left,right,bottom] duration-300 ease-out data-instant:transition-none motion-reduce:transition-none"
      >
        <NavigationMenuPrimitive.Popup className="relative h-(--popup-height) w-(--popup-width) origin-(--transform-origin) overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-card transition-[opacity,transform,width,height,scale] duration-300 ease-out outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none">
          <NavigationMenuPrimitive.Viewport className="relative size-full overflow-hidden" />
        </NavigationMenuPrimitive.Popup>
      </NavigationMenuPrimitive.Positioner>
    </NavigationMenuPrimitive.Portal>
  </NavigationMenuPrimitive.Root>
);

export const NavigationMenuList = ({
  className,
  ...props
}: ComponentProps<typeof NavigationMenuPrimitive.List>) => (
  <NavigationMenuPrimitive.List
    data-slot="navigation-menu-list"
    className={cn("flex list-none items-center gap-1", className)}
    {...props}
  />
);

export const NavigationMenuItem = NavigationMenuPrimitive.Item;

/** How a top-level link or trigger looks in the row. */
export const navigationMenuItemClass =
  "inline-flex h-10 items-center gap-1 rounded-button px-3 text-small font-medium text-foreground/75 transition-colors outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-popup-open:text-foreground";

export const NavigationMenuTrigger = ({
  className,
  children,
  ...props
}: NavigationMenuPrimitive.Trigger.Props) => (
  <NavigationMenuPrimitive.Trigger
    data-slot="navigation-menu-trigger"
    className={cn(navigationMenuItemClass, "group/trigger cursor-pointer", className)}
    {...props}
  >
    {children}
    <ChevronDownIcon
      aria-hidden
      className="size-3.5 opacity-60 transition-transform duration-300 group-data-popup-open/trigger:rotate-180"
    />
  </NavigationMenuPrimitive.Trigger>
);

export const NavigationMenuContent = ({
  className,
  ...props
}: NavigationMenuPrimitive.Content.Props) => (
  <NavigationMenuPrimitive.Content
    data-slot="navigation-menu-content"
    className={cn(
      "w-max p-2 transition-[opacity,transform,translate] duration-300 ease-out data-ending-style:opacity-0 data-starting-style:opacity-0 data-ending-style:data-activation-direction=left:translate-x-1/2 data-ending-style:data-activation-direction=right:-translate-x-1/2 data-starting-style:data-activation-direction=left:-translate-x-1/2 data-starting-style:data-activation-direction=right:translate-x-1/2 motion-reduce:transition-none",
      className,
    )}
    {...props}
  />
);

export const NavigationMenuLink = ({ className, ...props }: NavigationMenuPrimitive.Link.Props) => (
  <NavigationMenuPrimitive.Link
    data-slot="navigation-menu-link"
    className={cn(
      "block rounded-md px-3 py-2 text-small text-foreground transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-ring",
      className,
    )}
    {...props}
  />
);
