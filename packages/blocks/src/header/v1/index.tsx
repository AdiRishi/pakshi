import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Cta, Root, useMenu, useSiteName } from "../../components.tsx";
import { cta, optional } from "../../fields.ts";

const props = {
  cta: optional(cta({ title: "Button" })),
};

const link =
  "rounded-sm text-body hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const Header = ({
  props: header,
  variant,
}: BlockComponentProps<typeof props, "simple" | "centered">) => {
  const name = useSiteName();
  const menu = useMenu("main");
  return (
    <Root as="header" className="bg-background px-6 py-5 text-foreground">
      <div
        className={
          variant === "centered"
            ? "mx-auto flex max-w-6xl flex-col items-center gap-4"
            : "mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-4"
        }
      >
        <a
          href="/"
          className="text-lead font-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {name}
        </a>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
          {menu.length > 0 && (
            <nav aria-label="Main">
              <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {menu.map((item) => (
                  <li key={item.id} className="group relative">
                    <a href={item.href} className={link}>
                      {item.label}
                    </a>
                    {item.children.length > 0 && (
                      <ul className="absolute top-full left-0 z-10 hidden min-w-48 flex-col gap-2 rounded-md border border-border bg-popover p-4 text-popover-foreground shadow-card group-focus-within:flex group-hover:flex">
                        {item.children.map((child) => (
                          <li key={child.id}>
                            <a href={child.href} className={link}>
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
          )}
          {header.cta && (
            <Cta
              field="cta"
              value={header.cta}
              className="text-body inline-flex items-center rounded-md bg-primary px-5 py-2 text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          )}
        </div>
      </div>
    </Root>
  );
};

export default defineBlock({
  type: "header",
  version: 1,
  title: "Header",
  placement: "header",
  props,
  variants: ["simple", "centered"],
  surfaces: ["default", "muted", "brand", "inverse"],
  agent: { purpose: "The site's name, main menu and at most one button, at the top of every page" },
  component: Header,
});
