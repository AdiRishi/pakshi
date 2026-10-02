import { cx } from "class-variance-authority";

import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import {
  Cta,
  type ResolvedMenuItem,
  Root,
  Text,
  useHref,
  useLogo,
  useMenu,
  useSiteName,
} from "../../components.tsx";
import { choice, cta, link, optional, text } from "../../fields.ts";
import { buttonClass } from "../../kit/button.ts";
import { Icon } from "../../kit/icon.tsx";

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
  return (
    <a href="/" className={cx("shrink-0 rounded-sm font-heading text-lead font-semibold", focus)}>
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

/** The main menu across the header, with a menu item's children in a panel under it. */
const Menu = ({ items }: { readonly items: ReadonlyArray<ResolvedMenuItem> }) => (
  <nav aria-label="Main" className="hidden md:block">
    <ul className="flex items-center gap-7">
      {items.map((item) => (
        <li key={item.id} className="group relative">
          <a href={item.href} className={cx(navLink, "inline-flex items-center gap-1")}>
            {item.label}
            {item.children.length > 0 && (
              <Icon
                name="chevron-down"
                className="size-3.5 opacity-60 transition-transform group-focus-within:rotate-180 group-hover:rotate-180"
              />
            )}
          </a>
          {item.children.length > 0 && (
            <div className="invisible absolute top-full left-1/2 z-50 -translate-x-1/2 pt-3 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <ul className="flex min-w-56 flex-col rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-card">
                {item.children.map((child) => (
                  <li key={child.id}>
                    <a
                      href={child.href}
                      className={cx(
                        "block rounded-md px-3 py-2 text-small transition-colors hover:bg-muted",
                        focus,
                      )}
                    >
                      {child.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  </nav>
);

/** The header's buttons: a quiet second link, then the main button. */
const Buttons = ({ header }: { readonly header: Header }) =>
  header.cta === undefined && header.secondary === undefined ? null : (
    <div className="hidden items-center gap-5 md:flex">
      {header.secondary && <Cta field="secondary" value={header.secondary} className={navLink} />}
      {header.cta && <Cta field="cta" value={header.cta} className={buttonClass({ size: "sm" })} />}
    </div>
  );

/**
 * The menu on a phone: a button that opens every link, children included,
 * and the header's buttons. It opens without any script.
 */
const MobileMenu = ({
  items,
  header,
}: {
  readonly items: ReadonlyArray<ResolvedMenuItem>;
  readonly header: Header;
}) =>
  items.length === 0 && header.cta === undefined && header.secondary === undefined ? null : (
    <details className="group/menu md:hidden">
      <summary
        aria-label="Menu"
        className={cx(
          "flex size-10 cursor-pointer list-none items-center justify-center rounded-md hover:bg-foreground/5",
          focus,
        )}
      >
        <Icon name="menu" className="size-5 group-open/menu:hidden" />
        <Icon name="x" className="hidden size-5 group-open/menu:block" />
      </summary>
      <div className="px-gutter absolute inset-x-0 top-full z-50 border-b border-border bg-background pt-4 pb-8 shadow-card">
        <nav aria-label="Main">
          <ul className="flex flex-col divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="py-3">
                <a href={item.href} className={cx("block rounded-sm text-lead font-medium", focus)}>
                  {item.label}
                </a>
                {item.children.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-2 pl-4">
                    {item.children.map((child) => (
                      <li key={child.id}>
                        <a href={child.href} className={cx(navLink, "text-body")}>
                          {child.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </nav>
        {(header.cta || header.secondary) && (
          <div className="mt-6 flex flex-col gap-3">
            {header.cta && (
              <Cta field="cta" value={header.cta} className={buttonClass({ size: "md" })} />
            )}
            {header.secondary && (
              <Cta
                field="secondary"
                value={header.secondary}
                className={buttonClass({ variant: "secondary", size: "md" })}
              />
            )}
          </div>
        )}
      </div>
    </details>
  );

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
      <Announcement header={header} />
      <div className={floating ? "page-width pt-4" : undefined}>
        <div
          className={cx(
            "relative flex h-16 items-center justify-between gap-8",
            floating
              ? "rounded-xl border border-border bg-background/85 pr-3 pl-5 shadow-card backdrop-blur-md"
              : "page-width",
            variant === "centered-menu" && "md:grid md:grid-cols-[1fr_auto_1fr]",
            variant === "centered-logo" && "md:grid md:grid-cols-[1fr_auto_1fr]",
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
            <MobileMenu items={menu} header={header} />
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
