import { latestLockfile, presentationOf } from "@repo/blocks";
import type { BlockType } from "@repo/contracts/ids";
import type { Viewer } from "@repo/contracts/studio";
import { BlockCustomizer } from "@repo/editor";
import { Button } from "@repo/ui/components/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronLeftIcon, RotateCcwIcon } from "lucide-react";
import { useId, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { canvasColors } from "@/features/editor/canvas-colors";

import { RequestBlockDialog } from "./block-requests";
import { blocksQuery } from "./blocks-query";
import { blockRequestsQuery, blockUsageQuery } from "./queries";

import siteCss from "@repo/blocks/site.css?url";

/** The newest version of every block, which a block's page shows. */
export const newestBlocksQuery = blocksQuery(latestLockfile);

/** Names in a sentence: "A", "A and B", "A, B and C". */
const listed = (names: ReadonlyArray<string>) =>
  names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;

/** Which of the person's sites show the block now, opened to name them. */
function UsedOn(props: { readonly type: BlockType }) {
  const { data: uses } = useSuspenseQuery(blockUsageQuery(props.type));
  const [open, setOpen] = useState(false);
  const id = useId();
  if (uses.length === 0)
    return <p className="text-secondary-foreground">None of your sites use it yet.</p>;
  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="link"
        className="h-auto self-start p-0 font-semibold"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((current) => !current)}
      >
        Used on {uses.length} of your {uses.length === 1 ? "site" : "sites"}
        <ChevronDownIcon
          className={open ? "rotate-180 transition-transform" : "transition-transform"}
        />
      </Button>
      <p id={id} hidden={!open}>
        {listed(uses.map((use) => use.site.name))}.
      </p>
    </div>
  );
}

/** Advice on using the block, where it's used, and a way to ask for it to change. */
function GoodToKnow(props: {
  readonly type: BlockType;
  readonly name: string;
  readonly hint: string;
}) {
  const { data: requests } = useSuspenseQuery(blockRequestsQuery);
  const [asking, setAsking] = useState(false);
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex max-w-3xl flex-col gap-3">
      <h2 id={id} className="text-lg font-semibold">
        Good to know
      </h2>
      <p className="text-secondary-foreground">{props.hint}</p>
      <UsedOn type={props.type} />
      {requests.sites.length > 0 && (
        <>
          <Button
            variant="link"
            className="h-auto self-start p-0 font-semibold"
            onClick={() => setAsking(true)}
          >
            Ask for a change to {props.name}
          </Button>
          <RequestBlockDialog
            open={asking}
            onOpenChange={setAsking}
            sites={requests.sites}
            onSent={() => setAsking(false)}
          />
        </>
      )}
    </section>
  );
}

/**
 * One block type's own page: the block with its example content, changed
 * right on it with the same tools as the site editor, and nothing saved.
 */
export function BlockPage(props: { readonly viewer: Viewer; readonly type: BlockType }) {
  const presentation = presentationOf(props.type);
  const { data: definitions } = useSuspenseQuery(newestBlocksQuery);
  const [colors] = useState(canvasColors);
  // Starting over puts the example back by giving the customizer a fresh start.
  const [round, setRound] = useState(0);
  return (
    <AppShell viewer={props.viewer}>
      <div className="flex flex-col gap-6 px-6 py-6 md:px-10">
        <Link
          to="/blocks"
          className="flex items-center gap-1 self-start text-sm font-semibold text-link hover:underline"
        >
          <ChevronLeftIcon className="size-4" />
          Blocks
        </Link>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-4xl font-bold tracking-tight">{presentation.name}</h1>
            <p className="text-lg text-secondary-foreground">{presentation.summary}</p>
          </div>
          <Button variant="outline" onClick={() => setRound((count) => count + 1)}>
            <RotateCcwIcon />
            Start over
          </Button>
        </header>
        <BlockCustomizer
          key={round}
          type={props.type}
          definitions={definitions}
          siteCss={siteCss}
          colors={colors}
        />
        <GoodToKnow type={props.type} name={presentation.name} hint={presentation.hint} />
      </div>
    </AppShell>
  );
}
