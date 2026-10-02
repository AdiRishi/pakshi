import { fieldAt } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { PageId } from "@repo/contracts/ids";
import type { Target } from "@repo/contracts/ops";
import { ExternalUrl, Link } from "@repo/contracts/references";
import { Button } from "@repo/ui/components/button";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Popover, PopoverContent, PopoverHeader, PopoverTitle } from "@repo/ui/components/popover";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { Option, Predicate, Schema } from "effect";
import { useId, useState } from "react";

import { type FieldTarget, useEditorState, useServices, useStore } from "../context.tsx";
import { valueAt } from "../settings/controls.tsx";
import { useCanvasRect } from "./anchor.tsx";
import { DoneButton } from "./done.tsx";

/*
 * Where a link goes, chosen the same way for a button and for a link with no
 * element of its own, such as a logo's: one of the site's pages, or a web
 * address. A button chooses it in a panel under the button while its words
 * are being typed; a bare link in a popover from its mark on the page.
 */

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

const decodeLink = Schema.decodeUnknownOption(Link);

/** The link stored at a field, if it holds one. */
const useLinkAt = (field: FieldTarget) =>
  useEditorState((state) => {
    const props = holderOf(state.view, field.target)?.blocks[field.block]?.props;
    return props === undefined
      ? undefined
      : Option.getOrUndefined(decodeLink(valueAt(props, field.path)));
  });

/** A web address as people type it: without "https://", which is added when it's missing. */
const shownAddress = (address: string) => address.replace(/^https:\/\//, "");

const typedAddress = (typed: string) => {
  const trimmed = typed.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

/** The site's pages and collections to link to, named as visitors know them, home first. */
const usePages = () => {
  const pages = useEditorState((state) => state.view.pages);
  return Object.values(pages)
    .filter((page) => page.type !== "entry")
    .map((page) => ({
      id: page.id,
      name: page.path === "/" ? "Home" : page.meta.title || page.path,
    }))
    .toSorted((a, b) => (a.name === "Home" ? -1 : b.name === "Home" ? 1 : 0));
};

/** Chooses a page on the site or types a web address. An address is saved once it's a real one. */
function LinkChooser(props: { readonly field: FieldTarget }) {
  const store = useStore();
  const current = useLinkAt(props.field);
  // A link changed elsewhere, such as by undo, starts the address afresh.
  return (
    <LinkChoices
      key={JSON.stringify(current)}
      current={current}
      onChange={(link) => store.run([{ op: "setProp", ...props.field, value: link }])}
    />
  );
}

function LinkChoices(props: {
  readonly current: Link | undefined;
  readonly onChange: (link: Link) => void;
}) {
  const pages = usePages();
  const id = useId();
  const external = Predicate.isString(props.current) ? props.current : null;
  const chosenPage: PageId | null =
    props.current === undefined || Predicate.isString(props.current) ? null : props.current.id;
  const [typed, setTyped] = useState(external === null ? "" : shownAddress(external));
  const [problem, setProblem] = useState<string | null>(null);
  const saveTyped = () => {
    if (typed.trim() === "") return;
    const address = typedAddress(typed);
    if (!Schema.is(ExternalUrl)(address)) {
      setProblem("Type a full web address, like example.org/register.");
      return;
    }
    setProblem(null);
    if (address !== external) props.onChange(address);
  };
  return (
    <div className="flex flex-col gap-4">
      <Field>
        <FieldLabel id={`${id}-pages`} className="text-muted-foreground">
          A page on your site
        </FieldLabel>
        <ToggleGroup
          aria-labelledby={`${id}-pages`}
          variant="outline"
          size="sm"
          className="flex-wrap"
          value={chosenPage === null ? [] : [chosenPage]}
          onValueChange={(values) => {
            const page = pages.find((candidate) => values.includes(candidate.id));
            if (page !== undefined) props.onChange({ $ref: "page", id: page.id });
          }}
        >
          {pages.map((page) => (
            <ToggleGroupItem key={page.id} value={page.id} className="rounded-full px-3">
              {page.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field data-invalid={problem !== null || undefined}>
        <FieldLabel htmlFor={`${id}-address`} className="text-muted-foreground">
          Or a web address
        </FieldLabel>
        <Input
          id={`${id}-address`}
          value={typed}
          type="url"
          inputMode="url"
          spellCheck={false}
          placeholder="example.org/page"
          aria-invalid={problem !== null || undefined}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={saveTyped}
          onKeyDown={(event) => {
            if (event.key === "Enter") saveTyped();
          }}
        />
        <FieldError>{problem}</FieldError>
      </Field>
    </div>
  );
}

/**
 * Where a selected button goes, in a panel under it. It's not a popover, so
 * the button's words keep focus while it shows.
 */
export function ButtonDestination(props: {
  readonly field: FieldTarget;
  readonly element: Element;
  readonly container: HTMLElement;
}) {
  const store = useStore();
  const rect = useCanvasRect(props.element, props.container);
  if (rect === null) return null;
  return (
    <section
      aria-label="Where the button goes"
      className="absolute z-40 flex w-80 flex-col gap-4 rounded-lg bg-popover p-4 text-sm text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      style={{ top: rect.top + rect.height + 8, left: rect.left }}
    >
      <h2 className="font-semibold">Where it goes</h2>
      <LinkChooser field={{ ...props.field, path: [...props.field.path, "link"] }} />
      <div className="flex justify-end">
        <DoneButton
          onClick={() =>
            store.select({ kind: "block", target: props.field.target, block: props.field.block })
          }
        />
      </div>
    </section>
  );
}

/** Where a link with no element of its own goes, in a popover from its mark on the page. */
export function LinkPopover(props: {
  readonly field: FieldTarget;
  readonly anchor: Element;
  readonly onClose: () => void;
}) {
  const store = useStore();
  const { definitions } = useServices();
  const current = useLinkAt(props.field);
  const type = useEditorState(
    (state) => holderOf(state.view, props.field.target)?.blocks[props.field.block]?.type,
  );
  const contract = type === undefined ? undefined : definitions.get(type);
  const definition =
    contract === undefined ? undefined : fieldAt(contract.fields, props.field.path);
  if (definition?.kind !== "link") return null;
  return (
    <Popover
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <PopoverContent anchor={props.anchor} side="bottom" align="start" className="w-80">
        <PopoverHeader>
          <PopoverTitle className="font-semibold">Where it goes</PopoverTitle>
        </PopoverHeader>
        <LinkChooser field={props.field} />
        <div className="flex items-center justify-between gap-2">
          {definition.optional && current !== undefined ? (
            <Button
              variant="link"
              size="sm"
              className="px-0 text-destructive"
              onClick={() => {
                store.run([{ op: "setProp", ...props.field }]);
                props.onClose();
              }}
            >
              Remove link
            </Button>
          ) : (
            <span />
          )}
          <DoneButton onClick={props.onClose} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
