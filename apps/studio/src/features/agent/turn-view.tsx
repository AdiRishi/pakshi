import type { Activity, Part, SitePlan, Turn } from "@repo/contracts/agent";
import { useBlockTitle } from "@repo/editor";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Spinner } from "@repo/ui/components/spinner";
import { cn } from "cn";
import {
  CheckIcon,
  CircleAlertIcon,
  FileTextIcon,
  LayoutTemplateIcon,
  PlusIcon,
  SendIcon,
  Undo2Icon,
} from "lucide-react";

import { describeIssue } from "@/features/approvals/describe";

/** What the chat panel can do from a turn. */
export interface TurnActions {
  readonly answer: (part: string, answer: string) => void;
  readonly build: (part: string) => void;
  readonly undo: () => void;
  readonly show: (at: NonNullable<Activity["at"]>) => void;
  readonly submit: () => void;
}

const endings: Partial<Record<Turn["status"], string>> = {
  stopped: "You stopped Pakshi. What it changed so far stays in the draft.",
  interrupted: "Pakshi was cut off. What it changed so far stays in the draft.",
  failed: "Something went wrong, so Pakshi stopped. Try again.",
  unavailable:
    "Pakshi can't help right now, because Pakshi's AI has reached its spending limit. Try again later.",
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function PersonMessage(props: { readonly turn: Turn }) {
  const { request } = props.turn;
  return (
    <div className="ml-6 flex flex-col gap-2 rounded-xl bg-accent px-3.5 py-3 text-sm text-accent-foreground">
      <p className="whitespace-pre-wrap">{request.text}</p>
      {request.sources.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {request.sources.map((source) => (
            <li
              key={source.id}
              className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs font-medium"
            >
              <FileTextIcon aria-hidden className="size-3.5 text-muted-foreground" />
              {source.name}
            </li>
          ))}
        </ul>
      )}
      {request.selected !== null && (
        <p className="text-xs text-muted-foreground">About: {request.selected.title}</p>
      )}
    </div>
  );
}

function ActivityLine(props: { readonly activity: Activity }) {
  const { activity } = props;
  return (
    <li className="flex items-center gap-2 text-xs text-muted-foreground">
      {activity.status === "running" ? (
        <Spinner className="size-3.5" />
      ) : activity.status === "failed" ? (
        <CircleAlertIcon aria-hidden className="size-3.5" />
      ) : (
        <CheckIcon aria-hidden className="size-3.5" />
      )}
      {activity.label}
    </li>
  );
}

function Question(props: {
  readonly part: Extract<Part, { _tag: "Question" }>;
  readonly onAnswer: (answer: string) => void;
}) {
  const { part } = props;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm whitespace-pre-wrap">{part.question}</legend>
      <div className="flex flex-wrap gap-2">
        {part.choices.map((choice) => (
          <Button
            key={choice}
            variant={part.answer === choice ? "secondary" : "outline"}
            size="sm"
            disabled={part.answer !== null}
            aria-pressed={part.answer === choice}
            onClick={() => props.onAnswer(choice)}
          >
            {part.answer === choice && <CheckIcon />}
            {choice}
          </Button>
        ))}
      </div>
    </fieldset>
  );
}

function PlanCard(props: {
  readonly plan: SitePlan;
  readonly status: "proposed" | "building" | "replaced";
  readonly onBuild: () => void;
}) {
  const blockTitle = useBlockTitle();
  const sections = props.plan.pages.reduce((count, page) => count + page.sections.length, 0);
  return (
    <section
      aria-label="Site plan"
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-3",
        props.status === "replaced" && "opacity-60",
      )}
    >
      <header className="flex items-center gap-2">
        <LayoutTemplateIcon aria-hidden className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Site plan</h3>
        <span className="text-xs text-muted-foreground">
          {plural(props.plan.pages.length, "page")}, {plural(sections, "section")}
        </span>
        {props.status === "building" && <Badge className="ml-auto">Building</Badge>}
        {props.status === "replaced" && (
          <Badge variant="secondary" className="ml-auto">
            Replaced
          </Badge>
        )}
      </header>
      {props.plan.summary !== "" && <p className="text-sm">{props.plan.summary}</p>}
      <ol className="flex flex-col gap-2.5">
        {props.plan.pages.map((page) => (
          <li key={page.path} className="flex flex-col gap-1 rounded-lg bg-muted/60 px-2.5 py-2">
            <p className="flex items-baseline gap-1.5 text-sm">
              <span className="font-semibold">{page.title}</span>
              <span className="text-xs text-muted-foreground">{page.path}</span>
            </p>
            <ol className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              {page.sections.map((section, index) => (
                <li key={`${section.type}-${index}`}>
                  <span className="font-medium text-foreground">{blockTitle(section.type)}</span>:{" "}
                  {section.purpose}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
      {props.status === "proposed" && (
        <div className="flex flex-col gap-1.5">
          <Button onClick={props.onBuild}>Build the site</Button>
          <p className="text-xs text-muted-foreground">
            Or tell Pakshi what to change. Nothing is built until you choose to build it.
          </p>
        </div>
      )}
    </section>
  );
}

function SubmissionCard(props: {
  readonly part: Extract<Part, { _tag: "Submission" }>;
  readonly onSubmit: () => void;
}) {
  const { issues, behind } = props.part;
  const ready = issues.length === 0 && !behind;
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <h3 className="text-sm font-semibold">
        {ready ? "The draft passes its checks" : `${plural(issues.length, "thing")} to fix first`}
      </h3>
      {behind && (
        <p className="text-sm text-muted-foreground">
          The draft is behind the live site. It's updated when it's submitted.
        </p>
      )}
      {issues.length > 0 && (
        <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
          {issues.slice(0, 5).map((issue, index) => (
            <li key={index}>{describeIssue(issue).text}.</li>
          ))}
          {issues.length > 5 && <li>And {issues.length - 5} more.</li>}
        </ul>
      )}
      <Button variant={ready ? "default" : "outline"} size="sm" onClick={props.onSubmit}>
        <SendIcon />
        Review and submit
      </Button>
    </section>
  );
}

function ChangesCard(props: {
  readonly changes: ReadonlyArray<Activity>;
  readonly undone: boolean;
  readonly working: boolean;
  readonly actions: TurnActions;
}) {
  const shown = props.changes.find((change) => change.at !== null)?.at ?? null;
  return (
    <section
      aria-label="Changes"
      className="flex flex-col gap-2 rounded-xl border bg-card p-3 text-sm"
    >
      <header className="flex items-center gap-2">
        <h3 className="font-semibold">{plural(props.changes.length, "change")} to the draft</h3>
        {props.undone && (
          <Badge variant="secondary" className="ml-auto">
            Undone
          </Badge>
        )}
      </header>
      <ul className="flex flex-col gap-1 text-xs">
        {props.changes.map((change) => (
          <li key={change.id} className={cn("flex gap-1.5", props.undone && "line-through")}>
            <PlusIcon aria-hidden className="mt-px size-3.5 shrink-0 text-muted-foreground" />
            {change.label}
          </li>
        ))}
      </ul>
      {!props.working && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={props.undone} onClick={props.actions.undo}>
            <Undo2Icon />
            Undo
          </Button>
          {shown !== null && (
            <Button variant="outline" size="sm" onClick={() => props.actions.show(shown)}>
              Show on page
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/** One turn: what the person asked, and everything Pakshi did for it. */
export function TurnView(props: { readonly turn: Turn; readonly actions: TurnActions }) {
  const { turn, actions } = props;
  const working = turn.status === "working";
  const changes = turn.parts.flatMap((part) =>
    part._tag === "Activity" && part.changed ? [part] : [],
  );
  const ending = endings[turn.status];
  return (
    <li className="flex flex-col gap-3">
      <PersonMessage turn={turn} />
      <div className="flex flex-col gap-2.5">
        <p className="text-xs font-semibold text-muted-foreground">Pakshi</p>
        {turn.parts.map((part) => {
          switch (part._tag) {
            case "Text":
              return part.text.trim() === "" ? null : (
                <p key={part.id} className="text-sm whitespace-pre-wrap">
                  {part.text}
                </p>
              );
            case "Activity":
              return working ? (
                <ul key={part.id}>
                  <ActivityLine activity={part} />
                </ul>
              ) : null;
            case "Question":
              return (
                <Question
                  key={part.id}
                  part={part}
                  onAnswer={(answer) => actions.answer(part.id, answer)}
                />
              );
            case "Plan":
              return (
                <PlanCard
                  key={part.id}
                  plan={part.plan}
                  status={part.status}
                  onBuild={() => actions.build(part.id)}
                />
              );
            case "Submission":
              return <SubmissionCard key={part.id} part={part} onSubmit={actions.submit} />;
            case "BlockRequest":
              return (
                <p
                  key={part.id}
                  className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground"
                >
                  Asked the platform team for a new block: {part.need}
                </p>
              );
          }
        })}
        {working && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3.5" />
            Pakshi is working
          </p>
        )}
        {changes.length > 0 && (
          <ChangesCard changes={changes} undone={turn.undone} working={working} actions={actions} />
        )}
        {ending !== undefined && <p className="text-xs text-muted-foreground">{ending}</p>}
      </div>
    </li>
  );
}
