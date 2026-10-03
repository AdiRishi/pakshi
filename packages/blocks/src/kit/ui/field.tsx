import { ChevronDownIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../cn.ts";

/*
 * shadcn/ui's field and its controls, in the theme's type and corners. The
 * controls are the browser's own elements, so a form sends its answers
 * before the page's script has loaded, and a hydrated form only adds checks.
 */

const control =
  "w-full min-w-0 rounded-md border border-input bg-background px-4 text-body text-foreground transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50";

export const Field = ({
  className,
  orientation = "vertical",
  ...props
}: ComponentProps<"div"> & { readonly orientation?: "vertical" | "horizontal" }) => (
  <div
    data-slot="field"
    data-orientation={orientation}
    className={cn(
      "group/field flex gap-2",
      orientation === "vertical" ? "flex-col" : "flex-row items-start gap-3",
      className,
    )}
    {...props}
  />
);

export const FieldLabel = ({ className, ...props }: ComponentProps<"label">) => (
  // oxlint-disable-next-line jsx-a11y/label-has-associated-control -- callers tie it to its control with htmlFor
  <label
    data-slot="field-label"
    className={cn("text-small font-medium text-foreground", className)}
    {...props}
  />
);

export const FieldDescription = ({ className, ...props }: ComponentProps<"p">) => (
  <p
    data-slot="field-description"
    className={cn("text-small text-muted-foreground", className)}
    {...props}
  />
);

/** What's wrong with a field's answer, read out as it appears. */
export const FieldError = ({ className, children, ...props }: ComponentProps<"p">) =>
  children === undefined || children === null || children === "" ? null : (
    <p
      role="alert"
      data-slot="field-error"
      className={cn("text-small font-medium text-destructive", className)}
      {...props}
    >
      {children}
    </p>
  );

export const Input = ({ className, ...props }: ComponentProps<"input">) => (
  <input data-slot="input" className={cn(control, "h-12", className)} {...props} />
);

export const Textarea = ({ className, ...props }: ComponentProps<"textarea">) => (
  <textarea data-slot="textarea" className={cn(control, "min-h-32 py-3", className)} {...props} />
);

export const NativeSelect = ({ className, ...props }: ComponentProps<"select">) => (
  <div data-slot="native-select-wrapper" className={cn("relative", className)}>
    <select
      data-slot="native-select"
      className={cn(control, "h-12 appearance-none pr-10")}
      {...props}
    />
    <ChevronDownIcon
      aria-hidden
      className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
    />
  </div>
);

export const Checkbox = ({ className, ...props }: Omit<ComponentProps<"input">, "type">) => (
  <input
    data-slot="checkbox"
    type="checkbox"
    className={cn(
      "mt-0.5 size-5 shrink-0 rounded-sm border-input accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:outline-2 aria-invalid:outline-destructive",
      className,
    )}
    {...props}
  />
);
