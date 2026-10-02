import logoInverse from "@repo/brand/logo-inverse.svg?url";
import logo from "@repo/brand/logo.svg?url";
import markInverse from "@repo/brand/mark-inverse.svg?url";
import mark from "@repo/brand/mark.svg?url";
import { cn } from "cn";

/**
 * Pakshi's logo: the bird and the wordmark, or the bird alone where space is
 * short. Dark mode shows the inverse logo, drawn for dark backgrounds.
 */
export const Logo = ({
  variant = "full",
  className,
}: {
  readonly variant?: "full" | "mark";
  readonly className?: string;
}) =>
  variant === "full" ? (
    <>
      <img
        src={logo}
        alt="Pakshi"
        width={1200}
        height={360}
        className={cn("h-8 w-auto dark:hidden", className)}
      />
      <img
        src={logoInverse}
        alt="Pakshi"
        width={1200}
        height={360}
        className={cn("hidden h-8 w-auto dark:inline", className)}
      />
    </>
  ) : (
    <>
      <img
        src={mark}
        alt="Pakshi"
        width={1024}
        height={1024}
        className={cn("size-8 dark:hidden", className)}
      />
      <img
        src={markInverse}
        alt="Pakshi"
        width={1024}
        height={1024}
        className={cn("hidden size-8 dark:inline", className)}
      />
    </>
  );
