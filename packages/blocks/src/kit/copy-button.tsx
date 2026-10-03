import { CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "./cn.ts";

/**
 * A small button that copies a value, such as an email address, for someone
 * whose computer has no mail or phone app to open the link in. Once copied,
 * its icon turns to a tick for a moment and "Copied" is read out.
 */
export const CopyButton = (props: {
  readonly value: string;
  /** What the button does, read out in place of its icon, such as "Copy email address". */
  readonly label: string;
  readonly className?: string;
}) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = () => {
    navigator.clipboard.writeText(props.value).then(
      () => setCopied(true),
      () => setCopied(false),
    );
  };
  const icon =
    "col-start-1 row-start-1 size-4 transition duration-200 motion-reduce:transition-none";
  return (
    <>
      <button
        type="button"
        aria-label={props.label}
        onClick={copy}
        data-copied={copied || undefined}
        className={cn(
          "inline-grid size-8 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/8 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-copied:text-primary",
          props.className,
        )}
      >
        <CopyIcon aria-hidden className={cn(icon, copied && "scale-50 opacity-0")} />
        <CheckIcon aria-hidden className={cn(icon, !copied && "scale-50 opacity-0")} />
      </button>
      <output className="sr-only">{copied ? "Copied" : ""}</output>
    </>
  );
};
