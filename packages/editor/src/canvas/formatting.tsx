import { ExternalUrl } from "@repo/contracts/references";
import { Button } from "@repo/ui/components/button";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { Toggle } from "@repo/ui/components/toggle";
import { Predicate, Schema } from "effect";
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useId, useReducer, useState } from "react";

import type { ActiveRichText } from "../context.tsx";
import { useCanvasRect } from "./anchor.tsx";

/**
 * Keeps focus in the canvas when a toolbar button is pressed with a pointer,
 * so the rich text field keeps its selection.
 */
const keepFocus = (event: React.MouseEvent) => event.preventDefault();

function Format(props: {
  readonly label: string;
  readonly pressed: boolean;
  readonly onPress: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Toggle
      size="sm"
      aria-label={props.label}
      pressed={props.pressed}
      onMouseDown={keepFocus}
      onPressedChange={props.onPress}
    >
      {props.children}
    </Toggle>
  );
}

function LinkButton(props: { readonly active: ActiveRichText }) {
  const { editor } = props.active;
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const id = useId();
  const current = editor.getAttributes("link")["href"];
  const apply = () => {
    if (!Schema.is(ExternalUrl)(href)) {
      setProblem("Enter a full address that starts with https://, http://, mailto: or tel:");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setHref(Predicate.isString(current) ? current : "https://");
          setProblem(null);
        }
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant={editor.isActive("link") ? "secondary" : "ghost"}
            size="icon-sm"
            aria-label="Link"
            onMouseDown={keepFocus}
          />
        }
      >
        <LinkIcon />
      </PopoverTrigger>
      <PopoverContent align="start">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            apply();
          }}
        >
          <Field data-invalid={problem !== null || undefined}>
            <FieldLabel htmlFor={id}>Link address</FieldLabel>
            <Input
              id={id}
              value={href}
              type="url"
              spellCheck={false}
              aria-invalid={problem !== null || undefined}
              onChange={(event) => setHref(event.target.value)}
            />
            <FieldError>{problem}</FieldError>
          </Field>
          <div className="flex justify-end gap-2">
            {editor.isActive("link") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run();
                  setOpen(false);
                }}
              >
                Remove link
              </Button>
            )}
            <Button type="submit" size="sm">
              Apply
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The formatting toolbar for the rich text field with focus. It renders in
 * Studio above the field, and offers only the marks and nodes the field allows.
 */
export function FormattingToolbar(props: {
  readonly active: ActiveRichText;
  readonly container: HTMLElement;
}) {
  const { editor, field, element } = props.active;
  const rect = useCanvasRect(element, props.container);
  const [, refresh] = useReducer((count: number) => count + 1, 0);
  useEffect(() => {
    editor.on("transaction", refresh);
    return () => {
      editor.off("transaction", refresh);
    };
  }, [editor]);
  if (rect === null) return null;
  const chain = () => editor.chain().focus();
  const marks = new Set(field.marks);
  const nodes = new Set(field.nodes);
  return (
    <div
      role="toolbar"
      aria-label={`Format ${field.title}`}
      className="absolute z-40 flex -translate-y-full items-center gap-1 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
      style={{ top: Math.max(rect.top - 8, 0), left: rect.left }}
    >
      {marks.has("bold") && (
        <Format
          label="Bold"
          pressed={editor.isActive("bold")}
          onPress={() => chain().toggleBold().run()}
        >
          <BoldIcon />
        </Format>
      )}
      {marks.has("italic") && (
        <Format
          label="Italic"
          pressed={editor.isActive("italic")}
          onPress={() => chain().toggleItalic().run()}
        >
          <ItalicIcon />
        </Format>
      )}
      {nodes.has("heading") && (
        <>
          <Format
            label="Heading"
            pressed={editor.isActive("heading", { level: 2 })}
            onPress={() => chain().toggleHeading({ level: 2 }).run()}
          >
            <Heading2Icon />
          </Format>
          <Format
            label="Subheading"
            pressed={editor.isActive("heading", { level: 3 })}
            onPress={() => chain().toggleHeading({ level: 3 }).run()}
          >
            <Heading3Icon />
          </Format>
        </>
      )}
      {nodes.has("bulletList") && (
        <Format
          label="Bulleted list"
          pressed={editor.isActive("bulletList")}
          onPress={() => chain().toggleBulletList().run()}
        >
          <ListIcon />
        </Format>
      )}
      {nodes.has("orderedList") && (
        <Format
          label="Numbered list"
          pressed={editor.isActive("orderedList")}
          onPress={() => chain().toggleOrderedList().run()}
        >
          <ListOrderedIcon />
        </Format>
      )}
      {marks.has("link") && <LinkButton active={props.active} />}
    </div>
  );
}
