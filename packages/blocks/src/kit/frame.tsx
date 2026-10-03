import { cx } from "class-variance-authority";
import type { ReactNode } from "react";

/** How a picture is set: as it is, on a tray, in a browser window, or on a phone. */
export type FrameStyle = "plain" | "framed" | "browser" | "phone";

/**
 * A picture in its frame. `children` is the block's `Media` for the picture;
 * give it the classes `frameImageClass` returns for the same style, so its
 * corners and shape suit the frame.
 */
export const Frame = (props: {
  readonly kind: FrameStyle;
  readonly className?: string;
  readonly children: ReactNode;
}) => {
  switch (props.kind) {
    case "plain":
      return <div className={props.className}>{props.children}</div>;
    case "framed":
      return (
        <div
          className={cx(
            "rounded-xl border border-foreground/10 bg-foreground/4 p-2 shadow-card",
            props.className,
          )}
        >
          {props.children}
        </div>
      );
    case "browser":
      return (
        <div className={cx("frame-browser", props.className)}>
          <div aria-hidden className="frame-browser-bar">
            <span />
            <span />
            <span />
          </div>
          {props.children}
        </div>
      );
    case "phone":
      return <div className={cx("frame-phone", props.className)}>{props.children}</div>;
  }
};

/** The classes a picture takes inside a frame of this style, beside its own aspect ratio. */
export const frameImageClass = (style: FrameStyle) =>
  ({
    plain: "w-full rounded-image object-cover",
    framed: "w-full rounded-lg object-cover",
    browser: "w-full object-cover",
    phone: "",
  })[style];
