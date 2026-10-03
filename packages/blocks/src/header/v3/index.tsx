import { cx } from "class-variance-authority";
import { motion, useReducedMotion } from "motion/react";
import { type MouseEvent, useState } from "react";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import {
  Cta,
  type ResolvedMenuItem,
  Root,
  Text,
  useAddress,
  useEditing,
  useHref,
  useLogo,
  useMenu,
  useMotion,
  useSiteName,
} from "../../components.tsx";
import { choice, cta, link, optional, text } from "../../fields.ts";
import { buttonClass } from "../../kit/button.ts";
import { Icon } from "../../kit/icon.tsx";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuItemClass,
} from "../../kit/ui/navigation-menu.tsx";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "../../kit/ui/sheet.tsx";

const props = {
  cta: optional(cta({ title: "Button" })),
  secondary: optional(cta({ title: "Second link" })),
  announcement: optional(text({ title: "Announcement", max: 100 })),
  announcementLink: optional(link({ title: "Announcement link" })),
  position: choice({ title: "Position", options: ["static", "sticky", "overlay"] }),
  bar: choice({ title: "Announcement color", options: ["brand", "inverse", "accent"] }),
};

type Variant = "standard" | "centered-menu" | "centered-logo" | "floating";
type Header = BlockComponentProps<typeof props, Variant>["props"];

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** The brand's logo, in its version for the header's background, or the site's name. */
const Brand = () => {
  const name = useSiteName();
  const logo = useLogo();
  const address = useAddress();
  return (
    <a
      href={address("/")}
      className={cx("shrink-0 rounded-sm font-heading text-lead font-semibold", focus)}
    >
      {logo === null ? (
        name
      ) : (
        <>
          <img
            src={logo.light.src}
            width={logo.light.width}
            height={logo.light.height}
            alt={name}
            className={cx("h-8 w-auto", logo.onDark !== null && "on-light-only")}
          />
          {logo.onDark !== null && (
            <img
              src={logo.onDark.src}
              width={logo.onDark.width}
              height={logo.onDark.height}
              alt={name}
              className="on-dark-only h-8 w-auto"
            />
          )}
        </>
      )}
    </a>
  );
};

const navLink = cx(
  "rounded-sm text-small font-medium text-foreground/75 transition-colors hover:text-foreground",
  focus,
);

/**
 * The main menu across the header. An item with children opens a panel of
 * them on hover, click or the keyboard, led by a link to the item's own page.
 * The panels stay in the page's HTML, hidden, until the menu first opens.
 */
const Menu = ({ items }: { readonly items: ReadonlyArray<ResolvedMenuItem> }) => {
  const editing = useEditing();
  return (
    <NavigationMenu aria-label="Main" value={editing ? null : undefined} className="hidden md:flex">
      <NavigationMenuList>
        {items.map((item) => (
          <NavigationMenuItem key={item.id}>
            {item.children.length === 0 ? (
              <NavigationMenuLink href={item.href} className={navigationMenuItemClass}>
                {item.label}
              </NavigationMenuLink>
            ) : (
              <>
                <NavigationMenuTrigger>{item.label}</NavigationMenuTrigger>
                <NavigationMenuContent keepMounted>
                  <ul className="flex w-64 flex-col">
                    <li className="mb-1 border-b border-border pb-1">
                      <NavigationMenuLink href={item.href} className="link-arrow font-medium">
                        {item.label}
                      </NavigationMenuLink>
                    </li>
                    {item.children.map((child) => (
                      <li key={child.id}>
                        <NavigationMenuLink
                          href={child.href}
                          className="text-muted-foreground hover:text-foreground focus-visible:text-foreground"
                        >
                          {child.label}
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </>
            )}
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  );
};

/** The header's buttons: a quiet second link, then the main button. */
const Buttons = ({ header }: { readonly header: Header }) =>
  header.cta === undefined && header.secondary === undefined ? null : (
    <div className="hidden items-center gap-5 md:flex">
      {header.secondary && <Cta field="secondary" value={header.secondary} className={navLink} />}
      {header.cta && <Cta field="cta" value={header.cta} className={buttonClass({ size: "sm" })} />}
    </div>
  );

/**
 * The menu on a phone: a button that opens a sheet of every link, each
 * item's children under it, and the header's buttons. Choosing a link closes
 * it. In the editor it stays shut, as the header's fields show beside it.
 */
const PhoneMenu = ({
  items,
  header,
}: {
  readonly items: ReadonlyArray<ResolvedMenuItem>;
  readonly header: Header;
}) => {
  const editing = useEditing();
  const [open, setOpen] = useState(false);
  const moving = useMotion();
  const reduced = useReducedMotion() === true;
  if (items.length === 0 && header.cta === undefined && header.secondary === undefined) return null;
  const closeOnLink = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target instanceof Element && event.target.closest("a") !== null) setOpen(false);
  };
  return (
    <Sheet open={open && !editing} onOpenChange={setOpen}>
      <SheetTrigger
        aria-label="Menu"
        className={cx(
          "flex size-10 cursor-pointer items-center justify-center rounded-button transition-colors hover:bg-foreground/5 md:hidden",
          focus,
        )}
      >
        <Icon name="menu" className="size-5" />
      </SheetTrigger>
      <SheetContent onClick={closeOnLink} className="gap-0 overflow-y-auto">
        <SheetTitle className="sr-only">Menu</SheetTitle>
        <div className="flex h-18 shrink-0 items-center pr-16 pl-6">
          <Brand />
        </div>
        {items.length > 0 && (
          <nav aria-label="Main" className="px-6 pt-2 pb-8">
            <ul className="flex flex-col">
              {items.map((item, index) => (
                <motion.li
                  key={item.id}
                  initial={moving && !reduced ? { opacity: 0, x: 16 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.06 + index * 0.04, duration: 0.3, ease: "easeOut" }}
                  className="border-b border-border py-2 last:border-b-0"
                >
                  <a
                    href={item.href}
                    className={cx(
                      "block rounded-sm py-1.5 font-heading text-heading font-semibold",
                      focus,
                    )}
                  >
                    {item.label}
                  </a>
                  {item.children.length > 0 && (
                    <ul className="mt-1 mb-2 flex flex-col gap-1 border-l border-border pl-4">
                      {item.children.map((child) => (
                        <li key={child.id}>
                          <a
                            href={child.href}
                            className={cx(
                              "block rounded-sm py-1 text-body text-muted-foreground transition-colors hover:text-foreground",
                              focus,
                            )}
                          >
                            {child.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.li>
              ))}
            </ul>
          </nav>
        )}
        {(header.cta || header.secondary) && (
          <div className="mt-auto flex flex-col gap-3 border-t border-border p-6">
            {header.cta && (
              <Cta field="cta" value={header.cta} className={buttonClass({ size: "lg" })} />
            )}
            {header.secondary && (
              <Cta
                field="secondary"
                value={header.secondary}
                className={buttonClass({ variant: "secondary", size: "lg" })}
              />
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

/** A line of news across the top of every page, in a color of its own. */
const Announcement = ({ header }: { readonly header: Header }) => {
  const href = useHref(header.announcementLink ?? "#");
  if (!header.announcement) return null;
  const words = <Text field="announcement" as="span" value={header.announcement} />;
  return (
    <div
      data-surface={header.bar}
      className="px-gutter text-small bg-background py-2.5 text-center text-foreground"
    >
      {header.announcementLink === undefined ? (
        words
      ) : (
        <a href={href} className={cx("link-arrow rounded-sm hover:underline", focus)}>
          {words}
        </a>
      )}
    </div>
  );
};

const positions = {
  static: "relative bg-background",
  sticky: "sticky top-0 bg-background/85 backdrop-blur-md",
  overlay: "absolute inset-x-0 top-0 bg-transparent",
} as const satisfies Record<Header["position"], string>;

/**
 * The top of every page: the brand, the main menu with its panels, and the
 * header's buttons, with a sheet of the same links on a phone, under an
 * optional line of news.
 */
const HeaderBlock = ({ props: header, variant }: BlockComponentProps<typeof props, Variant>) => {
  const menu = useMenu("main");
  const floating = variant === "floating";
  return (
    <Root
      as="header"
      className={cx(
        "z-40 text-foreground",
        floating ? cx(positions[header.position], "bg-transparent") : positions[header.position],
        !floating && header.position !== "overlay" && "border-b border-border",
      )}
    >
      {/* An overlaid header takes the surface of the section it sits over, from the theme's CSS. */}
      <div data-overlay={header.position === "overlay" || undefined} className="text-foreground">
        <Announcement header={header} />
        <div className={floating ? "page-width pt-4" : undefined}>
          <div
            className={cx(
              "relative flex h-16 items-center justify-between gap-6",
              floating
                ? "rounded-xl border border-border bg-background/85 pr-2 pl-5 shadow-card backdrop-blur-md"
                : "page-width",
              (variant === "centered-menu" || variant === "centered-logo") &&
                "md:grid md:grid-cols-[1fr_auto_1fr]",
            )}
          >
            {variant === "centered-logo" ? (
              <>
                <Menu items={menu} />
                <div className="md:justify-self-center">
                  <Brand />
                </div>
              </>
            ) : (
              <>
                <Brand />
                <div className={cx(variant !== "centered-menu" && "md:ml-auto")}>
                  <Menu items={menu} />
                </div>
              </>
            )}
            <div className="flex items-center justify-end gap-2">
              <Buttons header={header} />
              <PhoneMenu items={menu} header={header} />
            </div>
          </div>
        </div>
      </div>
    </Root>
  );
};

export default defineBlock({
  type: "header",
  version: 3,
  title: "Header",
  placement: "header",
  props,
  variants: ["standard", "centered-menu", "centered-logo", "floating"],
  surfaces: ["default", "muted", "tint", "brand", "accent", "inverse"],
  agent: {
    purpose:
      "The brand's logo or the site's name, the main menu, at most one button and one quieter link, and an optional line of news above, at the top of every page",
    avoid: ["an announcement that isn't news", "a button that repeats a menu item"],
  },
  component: HeaderBlock,
});
