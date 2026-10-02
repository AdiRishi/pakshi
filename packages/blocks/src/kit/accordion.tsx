import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

import { Icon } from "./icon.tsx";

/**
 * One question or heading that opens to show what's under it, without any
 * script: a `details` element whose summary turns its plus into a cross.
 */
export const Disclosure = (props: {
  readonly summary: ReactNode;
  readonly open?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}) => (
  <details open={props.open} className={cx("group/disclosure", props.className)}>
    <summary className="flex cursor-pointer list-none items-start justify-between gap-6 rounded-sm py-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      {props.summary}
      <Icon
        name="plus"
        className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-open/disclosure:rotate-45"
      />
    </summary>
    <div className="pb-6">{props.children}</div>
  </details>
);
