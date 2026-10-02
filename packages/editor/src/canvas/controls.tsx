import { fieldAt } from "@repo/blocks";
import { createContext, useContext } from "react";

import { type ActiveRichText, type FieldTarget, useEditorState, useServices } from "../context.tsx";
import { isSelectedField } from "./fields.tsx";
import { FormPopover } from "./form-popover.tsx";
import { FormattingToolbar } from "./formatting.tsx";
import type { GhostPolicy } from "./ghost.tsx";
import { CanvasMarks } from "./marks.tsx";
import { MediaPopover } from "./media-popover.tsx";
import { blockElement, fieldElement } from "./regions.ts";
import { SettingPopover } from "./setting-popover.tsx";
import { ButtonDestination, LinkPopover } from "./where-it-goes.tsx";

/** A popover a field opened from the canvas, beside the element it came from. */
export interface CanvasPopover {
  readonly kind: "media" | "link" | "form" | "setting";
  readonly field: FieldTarget;
  readonly anchor: Element;
}

/** What the canvas shows in Studio beside the page, and the frame's document once it's ready. */
export interface CanvasControls {
  readonly popover: CanvasPopover | null;
  readonly richText: ActiveRichText | null;
  readonly document: Document | null;
  readonly closePopover: () => void;
  readonly setCanvasDocument: (document: Document) => void;
}

const CanvasControlsContext = createContext<CanvasControls | null>(null);

export const CanvasControlsProvider = CanvasControlsContext.Provider;

export const useCanvasControls = () => {
  const controls = useContext(CanvasControlsContext);
  if (controls === null) throw new Error("The canvas renders only inside the editor.");
  return controls;
};

/** The selected button on the page, whose destination shows under it. */
const useSelectedButton = (document: Document) => {
  const { definitions } = useServices();
  const selected = useEditorState((state) => {
    const { selection } = state;
    if (selection?.kind !== "field") return null;
    const holder =
      selection.target === "site" ? state.view.parts : state.view.pages[selection.target];
    const type = holder?.blocks[selection.block]?.type;
    const contract = type === undefined ? undefined : definitions.get(type);
    const field = contract === undefined ? undefined : fieldAt(contract.fields, selection.path);
    return field?.kind === "cta" ? selection : null;
  });
  // Read when the selection changes, by which time the button is on the page.
  const block = selected === null ? null : blockElement(document, selected.block);
  const element =
    selected === null || block === null ? undefined : fieldElement(block, selected.path);
  return selected === null || element === undefined ? null : { field: selected, element };
};

/**
 * Studio's controls over the canvas, laid over `container`: the popover a
 * field opened, the formatting toolbar for rich text, where a selected
 * button goes, and the marks for what's pointed at or selected.
 */
export function CanvasChrome(props: {
  readonly container: HTMLElement;
  readonly document: Document;
  /** Whether marks are cut off at the container's edges, as they are where the page scrolls inside it. */
  readonly clip: boolean;
  /** Which blocks show their missing parts, and so the marks of what they lack. */
  readonly policy: GhostPolicy;
}) {
  const controls = useCanvasControls();
  const selection = useEditorState((state) => state.selection);
  const button = useSelectedButton(props.document);
  const popover = controls.popover;
  return (
    <>
      <CanvasMarks
        document={props.document}
        container={props.container}
        clip={props.clip}
        policy={props.policy}
      />
      {popover?.kind === "media" && (
        <MediaPopover
          field={popover.field}
          anchor={popover.anchor}
          onClose={controls.closePopover}
        />
      )}
      {popover?.kind === "link" && (
        <LinkPopover
          field={popover.field}
          anchor={popover.anchor}
          onClose={controls.closePopover}
        />
      )}
      {popover?.kind === "form" && (
        <FormPopover
          field={popover.field}
          anchor={popover.anchor}
          onClose={controls.closePopover}
        />
      )}
      {popover?.kind === "setting" && (
        <SettingPopover
          field={popover.field}
          anchor={popover.anchor}
          onClose={controls.closePopover}
        />
      )}
      {controls.richText !== null && isSelectedField(selection, controls.richText.target) && (
        <FormattingToolbar active={controls.richText} container={props.container} />
      )}
      {button !== null && popover === null && (
        <ButtonDestination
          field={button.field}
          element={button.element}
          container={props.container}
        />
      )}
    </>
  );
}
