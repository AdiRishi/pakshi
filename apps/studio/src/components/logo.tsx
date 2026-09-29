import logo from "@repo/brand/logo.svg?url";
import mark from "@repo/brand/mark.svg?url";
import { cn } from "cn";

/**
 * Pakshi's logo: the bird and the wordmark, or the bird alone where space is
 * short. Both are drawn for light backgrounds.
 */
export const Logo = ({
  variant = "full",
  className,
}: {
  readonly variant?: "full" | "mark";
  readonly className?: string;
}) =>
  variant === "full" ? (
    <img
      src={logo}
      alt="Pakshi"
      width={1200}
      height={360}
      className={cn("h-8 w-auto", className)}
    />
  ) : (
    <img src={mark} alt="Pakshi" width={1024} height={1024} className={cn("size-8", className)} />
  );
