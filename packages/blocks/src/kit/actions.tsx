import type { Link } from "@repo/contracts/references";
import { cx } from "class-variance-authority";

import { Cta } from "../components.tsx";
import { type ButtonVariant, buttonClass } from "./button.ts";

/** A list of buttons as blocks store them: each item's button is a label and a link. */
export type ActionList = ReadonlyArray<{
  readonly id: string;
  readonly button: { readonly label: string; readonly link: Link };
}>;

/**
 * A block's buttons, from its `actions` list: the first is the main one, and
 * the others are quieter, so one action leads.
 */
export const Actions = (props: {
  readonly actions: ActionList;
  readonly field?: string;
  readonly size?: "sm" | "md" | "lg";
  readonly align?: "start" | "center";
  readonly others?: ButtonVariant;
  readonly className?: string;
}) =>
  props.actions.length === 0 ? null : (
    <div
      className={cx(
        "flex flex-wrap items-center gap-3",
        props.align === "center" && "justify-center",
        props.className,
      )}
    >
      {props.actions.map((action, index) => (
        <Cta
          key={action.id}
          field={[props.field ?? "actions", action.id, "button"]}
          value={action.button}
          className={buttonClass({
            variant: index === 0 ? "primary" : (props.others ?? "secondary"),
            size: props.size ?? "md",
          })}
        />
      ))}
    </div>
  );
