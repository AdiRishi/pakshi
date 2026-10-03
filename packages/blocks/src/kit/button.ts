import { cva, type VariantProps } from "class-variance-authority";

/**
 * How a link looks as a button: shadcn/ui's button, set in the theme's
 * tokens. The theme decides its corners, so a block decides only its kind
 * and size.
 */
export const buttonClass = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-button font-medium whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary/85",
        secondary: "border border-foreground/20 text-foreground hover:bg-foreground/5",
        soft: "bg-foreground/8 text-foreground hover:bg-foreground/12",
        link: "link-arrow rounded-sm text-foreground underline-offset-4 hover:underline",
      },
      size: {
        sm: "text-small",
        md: "text-body",
        lg: "text-body",
      },
    },
    compoundVariants: [
      { variant: ["primary", "secondary", "soft"], size: "sm", className: "h-9 px-4" },
      { variant: ["primary", "secondary", "soft"], size: "md", className: "h-11 px-5" },
      { variant: ["primary", "secondary", "soft"], size: "lg", className: "h-13 px-7" },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export type ButtonVariant = NonNullable<VariantProps<typeof buttonClass>["variant"]>;
