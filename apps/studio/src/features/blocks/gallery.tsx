import { type BlockPresentation, galleryBlocks } from "@repo/blocks";
import type { Viewer } from "@repo/contracts/studio";
import { Button } from "@repo/ui/components/button";
import { Card } from "@repo/ui/components/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@repo/ui/components/input-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { PlusIcon, SearchIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { AppShell } from "@/components/app-shell";

import { GalleryPreview } from "./gallery-preview";

/** Which part of the blocks page an address opens: every block unless it says otherwise. */
export const BlocksSearch = Schema.Struct({
  tab: Schema.optionalKey(Schema.Literals(["asked", "updates"])),
});
export type BlocksSearch = typeof BlocksSearch.Type;

export type GalleryTab = NonNullable<BlocksSearch["tab"]> | "all";

const tabTrigger = "h-11 flex-none px-0 font-semibold group-data-horizontal/tabs:after:-bottom-px";

/** The gallery's blocks whose name or summary holds the search text. */
const matching = (search: string) => {
  const words = search.trim().toLowerCase();
  return galleryBlocks.filter((block) =>
    `${block.name} ${block.summary}`.toLowerCase().includes(words),
  );
};

/** One block: its name and what it is, over its sample as a page shows it. */
function BlockCard(props: { readonly block: BlockPresentation }) {
  const [pointing, setPointing] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <Link
      to="/blocks/$blockType"
      params={{ blockType: props.block.type }}
      className="group block rounded-2xl focus-visible:outline-none"
      onPointerEnter={() => setPointing(true)}
      onPointerLeave={() => setPointing(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Card className="h-full gap-3.5 rounded-2xl p-4.5 ring-border transition-[box-shadow,translate] duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:ring-ring/40 group-focus-visible:ring-3 group-focus-visible:ring-ring motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
        <div className="flex flex-col gap-0.5 px-0.5">
          <h2 className="decoration-1.5 text-xl font-semibold tracking-tight underline-offset-4 group-hover:underline">
            {props.block.name}
          </h2>
          <p className="text-sm text-muted-foreground">{props.block.summary}</p>
        </div>
        <div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
          <div aria-hidden className="flex h-5 items-center gap-1.5 border-b bg-muted px-2.5">
            <span className="size-1.5 rounded-full bg-foreground/15" />
            <span className="size-1.5 rounded-full bg-foreground/15" />
            <span className="size-1.5 rounded-full bg-foreground/15" />
          </div>
          <GalleryPreview
            type={props.block.type}
            name={props.block.name}
            active={pointing || focused}
          />
        </div>
      </Card>
    </Link>
  );
}

/**
 * The blocks page: every block a page can be made of, in the order a page
 * runs, beside the requests people made for blocks the library doesn't have
 * and, for the platform team, the upgrades sites are waiting on.
 */
export function BlockGallery(props: {
  readonly viewer: Viewer;
  readonly tab: GalleryTab;
  readonly onTab: (tab: GalleryTab) => void;
  /** Opens the request form, or null for someone who may not ask for blocks. */
  readonly onAsk: (() => void) | null;
  /** The requests people made. */
  readonly asked: ReactNode;
  /** The upgrades sites are waiting on, or null for anyone outside the platform team. */
  readonly updates: ReactNode;
}) {
  const [search, setSearch] = useState("");
  const searchId = useId();
  const { onAsk } = props;
  const tab = props.tab === "updates" && props.updates === null ? "all" : props.tab;
  const shown = matching(search);
  return (
    <AppShell viewer={props.viewer}>
      <div className="flex w-full max-w-7xl flex-col gap-7 px-6 pt-9 pb-18 md:px-12">
        <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-4xl font-semibold tracking-tight">Blocks</h1>
            <p className="text-secondary-foreground">
              The pieces your web pages are made of. Hover over one to see the other ways it can
              look.
            </p>
          </div>
          {onAsk !== null && (
            <Button variant="outline" className="ml-auto" onClick={onAsk}>
              <PlusIcon />
              Ask for a new block
            </Button>
          )}
        </header>
        <Tabs value={tab} onValueChange={props.onTab} className="gap-7">
          <div className="flex flex-wrap items-center gap-x-4 border-b">
            <TabsList variant="line" className="h-auto gap-5 p-0">
              <TabsTrigger value="all" className={tabTrigger}>
                All blocks
              </TabsTrigger>
              <TabsTrigger value="asked" className={tabTrigger}>
                Blocks people asked for
              </TabsTrigger>
              {props.updates !== null && (
                <TabsTrigger value="updates" className={tabTrigger}>
                  Updates
                </TabsTrigger>
              )}
            </TabsList>
            {tab === "all" && (
              <InputGroup className="mb-2 w-full bg-card sm:ml-auto sm:w-75">
                <InputGroupAddon>
                  <SearchIcon />
                </InputGroupAddon>
                <label htmlFor={searchId} className="sr-only">
                  Search blocks
                </label>
                <InputGroupInput
                  id={searchId}
                  type="search"
                  placeholder="Search blocks"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </InputGroup>
            )}
          </div>
          {/* Previews keep the width they fitted at while another tab is open. */}
          <TabsContent value="all" keepMounted>
            {shown.length === 0 ? (
              <div className="flex flex-col items-start gap-3 py-9">
                <p className="text-lg font-semibold">No block matches "{search.trim()}"</p>
                <div className="flex flex-wrap gap-2.5">
                  {onAsk !== null && <Button onClick={onAsk}>Ask for a new block</Button>}
                  <Button variant="outline" onClick={() => setSearch("")}>
                    Clear the search
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="grid gap-x-8 gap-y-12 xl:grid-cols-2">
                {shown.map((block) => (
                  <li key={block.type}>
                    <BlockCard block={block} />
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
          <TabsContent value="asked">{props.asked}</TabsContent>
          {props.updates !== null && <TabsContent value="updates">{props.updates}</TabsContent>}
        </Tabs>
      </div>
    </AppShell>
  );
}
