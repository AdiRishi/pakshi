import { type BlockComponentProps, defineBlock } from "../../block.tsx";
import { Root, Text, useMenu, useSiteName } from "../../components.tsx";
import { optional, text } from "../../fields.ts";

const props = {
  note: optional(text({ title: "Note", max: 200, multiline: true })),
};

const Footer = ({
  props: footer,
  variant,
}: BlockComponentProps<typeof props, "simple" | "columns">) => {
  const name = useSiteName();
  const menu = useMenu("footer");
  return (
    <Root as="footer" className="bg-background px-6 py-12 text-foreground">
      <div
        className={
          variant === "columns"
            ? "mx-auto grid max-w-6xl gap-8 md:grid-cols-2"
            : "mx-auto flex max-w-6xl flex-col gap-6"
        }
      >
        <div className="flex flex-col gap-2">
          <p className="text-lead font-heading">{name}</p>
          {footer.note && (
            <Text
              field="note"
              as="p"
              value={footer.note}
              className="text-small whitespace-pre-line text-muted-foreground"
            />
          )}
        </div>
        {menu.length > 0 && (
          <nav aria-label="Footer">
            <ul
              className={
                variant === "columns"
                  ? "flex flex-col gap-3 md:items-end"
                  : "flex flex-wrap gap-x-6 gap-y-3"
              }
            >
              {menu.map((item) => (
                <li key={item.id}>
                  <a
                    href={item.href}
                    className="text-small rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
    </Root>
  );
};

export default defineBlock({
  type: "footer",
  version: 1,
  title: "Footer",
  placement: "footer",
  props,
  variants: ["simple", "columns"],
  surfaces: ["default", "muted", "brand", "inverse"],
  agent: {
    purpose: "The site's name, a short note and the footer menu, at the bottom of every page",
  },
  component: Footer,
});
