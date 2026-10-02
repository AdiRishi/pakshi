import type { PersonOnly } from "@repo/agent/issues";
import type { CheckIssue } from "@repo/contracts/publishing";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@repo/ui/components/popover";
import { ChevronRightIcon, CircleCheckIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useId, useState } from "react";

import { describeIssue } from "@/features/approvals/describe";

import { CheckList } from "./check-list";
import { fixAllMessage } from "./issues";

/**
 * Whether Pakshi can take on the draft's issues now: it's free, still
 * working on a request, connecting, unreachable, or the draft no longer
 * takes the person's changes.
 */
export type PakshiReadiness = "ready" | "working" | "connecting" | "offline" | "closed";

const notReady: Readonly<Record<Exclude<PakshiReadiness, "ready">, string>> = {
  working:
    "Pakshi is still working on your last request. Wait for it to finish, or stop it in the chat.",
  connecting: "Pakshi is getting ready. Try again in a moment.",
  offline: "Can't reach Pakshi. Reconnecting.",
  closed: "This draft no longer takes your changes, so Pakshi can't make them either.",
};

const whyYours: Readonly<Record<PersonOnly, string>> = {
  image: "Pakshi can't choose images.",
  "alt-text": "Pakshi can't see the image.",
  settings: "Pakshi can't change site settings.",
};

const count = (issues: number) => (issues === 1 ? "1 thing to fix" : `${issues} things to fix`);

/**
 * What the checks find in the draft, from the editor's top bar: every check,
 * each issue a person can go to, and a way to hand the issues to Pakshi. The
 * ones only a person can fix are marked, and left out of what Pakshi is asked.
 */
export function ChecksPopover(props: {
  readonly issues: ReadonlyArray<CheckIssue>;
  readonly personOnly: (issue: CheckIssue) => PersonOnly | null;
  /** What going to an issue does, or null when the draft no longer shows it. */
  readonly goTo: (issue: CheckIssue) => (() => void) | null;
  readonly pakshi: PakshiReadiness;
  /** Sends Pakshi a message from the person, as if they'd typed it in the chat. */
  readonly onFixAll: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const reasonId = useId();
  const fixable = props.issues.filter((issue) => props.personOnly(issue) === null);
  const blocked =
    props.pakshi !== "ready"
      ? notReady[props.pakshi]
      : fixable.length === 0
        ? "What's left needs you, so there's nothing here for Pakshi to fix."
        : null;
  const passes = props.issues.length === 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            className={
              passes
                ? "text-success-foreground"
                : "border-warning bg-warning text-warning-foreground hover:bg-warning/80 aria-expanded:bg-warning/80 aria-expanded:text-warning-foreground"
            }
          />
        }
      >
        {passes ? <CircleCheckIcon /> : <TriangleAlertIcon />}
        {passes ? "Checks pass" : count(props.issues.length)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 gap-0 p-0">
        <PopoverHeader className="gap-1 border-b p-4">
          <PopoverTitle className="text-base font-semibold">
            {passes ? "This draft passes its checks" : count(props.issues.length)}
          </PopoverTitle>
          <PopoverDescription>
            {passes
              ? "Nothing stops it being submitted."
              : "Choose one to go to it. Each ticks off once it's fixed."}
          </PopoverDescription>
        </PopoverHeader>
        <div className="max-h-112 overflow-y-auto p-4">
          <CheckList
            issues={props.issues}
            renderIssue={(issue, index) => {
              const go = props.goTo(issue);
              const yours = props.personOnly(issue);
              return (
                <li key={index} className="-mx-2">
                  <button
                    type="button"
                    disabled={go === null}
                    onClick={() => {
                      setOpen(false);
                      go?.();
                    }}
                    className="group/issue flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:text-muted-foreground disabled:hover:bg-transparent"
                  >
                    <span className="flex grow flex-col gap-1">
                      <span>{describeIssue(issue).text}.</span>
                      {yours !== null && (
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <Badge variant="outline">Needs you</Badge>
                          {whyYours[yours]}
                        </span>
                      )}
                    </span>
                    {go !== null && (
                      <ChevronRightIcon
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground opacity-0 group-hover/issue:opacity-100 group-focus-visible/issue:opacity-100"
                      />
                    )}
                  </button>
                </li>
              );
            }}
          />
        </div>
        {!passes && (
          <div className="flex flex-col gap-2 border-t bg-muted/40 p-4">
            <Button
              variant="secondary"
              disabled={blocked !== null}
              aria-describedby={reasonId}
              onClick={() => {
                setOpen(false);
                props.onFixAll(fixAllMessage(fixable));
              }}
            >
              <SparklesIcon />
              Fix all with Pakshi
            </Button>
            <p id={reasonId} className="text-xs text-muted-foreground">
              {blocked ??
                (fixable.length === props.issues.length
                  ? "Pakshi works through them in the chat, and asks for anything it would have to make up."
                  : `Pakshi works through the ${fixable.length} it can in the chat, and leaves the ones that need you.`)}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
