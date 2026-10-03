import {
  type AgentToolName,
  askUser,
  editingTools,
  prepareSubmission,
  proposePlan,
  requestBlock,
} from "@repo/agent/tools";
import { recipeById } from "@repo/blocks/recipes";
import { Change, type PlannedPage, type SitePlan, type Source } from "@repo/contracts/agent";
import type { BlockType } from "@repo/contracts/ids";
import { Badge } from "@repo/ui/components/badge";
import { Bubble, BubbleContent } from "@repo/ui/components/bubble";
import { Button } from "@repo/ui/components/button";
import { Marker, MarkerContent, MarkerIcon } from "@repo/ui/components/marker";
import { Message, MessageContent } from "@repo/ui/components/message";
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireInput,
  QuestionnaireItem,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from "@repo/ui/components/questionnaire";
import { Spinner } from "@repo/ui/components/spinner";
import { TextPart } from "@tanstack/ai-react/ui";
import { cn } from "cn";
import { Option, Schema } from "effect";
import {
  CheckIcon,
  CircleAlertIcon,
  FileTextIcon,
  LayoutTemplateIcon,
  PlusIcon,
  SendIcon,
  Undo2Icon,
} from "lucide-react";

import type { AgentPart, PlanStatus, ToolPart, Turn } from "./agent";

/*
 * A tool call's input and result reach the chat as JSON, so the chat reads
 * them with the tool's own schemas.
 */
const readQuestion = Schema.decodeUnknownOption(askUser.inputSchema);
const readPlan = Schema.decodeUnknownOption(proposePlan.inputSchema);
const readSubmission = Schema.decodeUnknownOption(prepareSubmission.outputSchema);
const readRequest = Schema.decodeUnknownOption(requestBlock.inputSchema);
const readChange = Schema.decodeUnknownOption(Schema.Struct({ change: Change }));
const readAnswer = Schema.decodeUnknownOption(Schema.String);

/** What the chat panel can do from a turn. */
export interface TurnActions {
  readonly answer: (answer: string) => void;
  readonly build: (call: string) => void;
  readonly undo: () => void;
  readonly show: (at: Change["at"]) => void;
  readonly submit: () => void;
}

/** What a turn knows of the conversation around it. */
export interface TurnContext {
  /** Whether this is the conversation's last turn, so its questions are still open. */
  readonly last: boolean;
  /** Whether Pakshi is working on it. */
  readonly working: boolean;
  /** How the next turn began, which answers a question this one asked. */
  readonly answer: string | null;
  /** How each plan in the conversation stands, by its propose_plan call. */
  readonly plans: ReadonlyMap<string, PlanStatus>;
  /** A block's title, such as "Hero", by its type. */
  readonly blockTitle: (type: BlockType) => string;
}

const endings = {
  stopped: "You stopped Pakshi. What it changed so far stays in the draft.",
  interrupted: "Pakshi was cut off. What it changed so far stays in the draft.",
  failed: "Something went wrong, so Pakshi stopped. Try again.",
  unavailable:
    "Pakshi can't help right now, because Pakshi's AI has reached its spending limit. Try again later.",
} as const;

/** What the chat says a tool call is doing, has done, or couldn't do. */
const toolWords: Record<AgentToolName, readonly [running: string, done: string, failed: string]> = {
  get_site_outline: ["Looking over the site", "Looked over the site", "Couldn't read the site"],
  get_page: ["Reading a page", "Read a page", "Couldn't read the page"],
  get_block_contract: ["Checking a block", "Checked a block", "Couldn't check the block"],
  get_recipe: ["Reading a recipe", "Read a recipe", "Couldn't read the recipe"],
  read_source: ["Reading a document", "Read a document", "Couldn't read the document"],
  apply_ops: ["Changing the page", "Changed the page", "Couldn't make that change"],
  insert_section: ["Adding a section", "Added a section", "Couldn't add the section"],
  create_page: ["Creating a page", "Created a page", "Couldn't create the page"],
  create_entry: ["Writing a post", "Wrote a post", "Couldn't create the post"],
  get_preview_link: [
    "Getting the preview link",
    "Got the preview link",
    "Couldn't get the preview link",
  ],
  fetch_url: ["Reading a web page", "Read a web page", "Couldn't read the web page"],
  ask_user: ["Asking you", "Asked you", "Couldn't ask"],
  propose_plan: ["Planning the site", "Planned the site", "Couldn't show the plan"],
  check_draft: ["Checking the draft", "Checked the draft", "Couldn't check the draft"],
  prepare_submission: ["Checking the draft", "Checked the draft", "Couldn't check the draft"],
  request_block: ["Requesting a block", "Requested a block", "Couldn't request the block"],
};

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** A tool call's result, once it went through. */
const resultOf = (part: ToolPart) =>
  part.state === "complete" ? Option.some(part.output) : Option.none();

/** What an edit changed, once it went through. */
const changeOf = (part: AgentPart) =>
  part.type === "tool-call" && editingTools.has(part.name)
    ? Option.map(Option.flatMap(resultOf(part), readChange), (result) => result.change)
    : Option.none();

/** What the edits of a turn changed, in the order they did. */
const changesOf = (parts: ReadonlyArray<AgentPart>): ReadonlyArray<Change> =>
  parts.flatMap((part) => Option.toArray(changeOf(part)));

function PersonMessage(props: {
  readonly text: string;
  readonly sources: ReadonlyArray<Source>;
  readonly about: string | null;
}) {
  return (
    <Message align="end">
      <MessageContent>
        <Bubble align="end" variant="muted">
          <BubbleContent className="whitespace-pre-wrap">{props.text}</BubbleContent>
        </Bubble>
        {props.sources.length > 0 && (
          <ul className="flex flex-wrap justify-end gap-1.5">
            {props.sources.map((source) => (
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
        {props.about !== null && (
          <p className="text-xs text-muted-foreground">About: {props.about}</p>
        )}
      </MessageContent>
    </Message>
  );
}

function Activity(props: { readonly part: ToolPart }) {
  const { part } = props;
  const [running, finished, failed] = toolWords[part.name];
  const label =
    part.state === "error"
      ? failed
      : part.state === "complete"
        ? Option.match(changeOf(part), { onNone: () => finished, onSome: (change) => change.label })
        : running;
  return (
    <Marker render={<output />}>
      <MarkerIcon>
        {part.state === "error" ? (
          <CircleAlertIcon />
        ) : part.state === "complete" ? (
          <CheckIcon />
        ) : (
          <Spinner />
        )}
      </MarkerIcon>
      <MarkerContent
        className={cn(part.state !== "complete" && part.state !== "error" && "shimmer")}
      >
        {label}
      </MarkerContent>
    </Marker>
  );
}

function Question(props: {
  readonly id: string;
  readonly question: string;
  readonly choices: ReadonlyArray<string>;
  readonly context: TurnContext;
  readonly onAnswer: (answer: string) => void;
}) {
  const { question, choices } = props;
  const { answer, last, working } = props.context;
  if (!last || working)
    return (
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm whitespace-pre-wrap">{question}</legend>
        <div className="flex flex-wrap gap-2">
          {choices.map((choice) => (
            <Button
              key={choice}
              variant={answer === choice ? "secondary" : "outline"}
              size="sm"
              disabled
              aria-pressed={answer === choice}
            >
              {answer === choice && <CheckIcon />}
              {choice}
            </Button>
          ))}
        </div>
      </fieldset>
    );
  return (
    <Questionnaire
      key={props.id}
      className="rounded-xl border bg-card p-3"
      items={[{ name: "answer", required: true, choices: choices.map((value) => ({ value })) }]}
      onSubmit={(event) => {
        event.preventDefault();
        const chosen = Option.map(
          readAnswer(new FormData(event.currentTarget).get("answer")),
          (found) => found.trim(),
        );
        if (Option.isSome(chosen) && chosen.value !== "") props.onAnswer(chosen.value);
      }}
    >
      <QuestionnaireItem name="answer" required>
        <QuestionnaireTitle className="text-sm font-normal">{question}</QuestionnaireTitle>
        <QuestionnaireChoices>
          {choices.map((choice) => (
            <QuestionnaireChoice key={choice} value={choice}>
              {choice}
            </QuestionnaireChoice>
          ))}
          <QuestionnaireInput aria-label="Another answer" placeholder="Or write your own answer" />
        </QuestionnaireChoices>
      </QuestionnaireItem>
      <QuestionnaireActions>
        <QuestionnaireSubmit>Answer</QuestionnaireSubmit>
      </QuestionnaireActions>
    </Questionnaire>
  );
}

/** What a planned page's recipe makes: a page, a blog or a post. */
const makesOf = (page: PlannedPage) => recipeById(page.recipe)?.makes.type ?? "page";

const parentOf = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

/** A plan's pages in its order, with each planned post under the planned blog it goes in. */
const plannedBranches = (pages: ReadonlyArray<PlannedPage>) => {
  const blogs = new Set(
    pages.filter((page) => makesOf(page) === "collection").map((page) => page.path),
  );
  const inPlannedBlog = (page: PlannedPage) =>
    makesOf(page) === "entry" && blogs.has(parentOf(page.path));
  return pages
    .filter((page) => !inPlannedBlog(page))
    .map((page) => ({
      page,
      posts:
        makesOf(page) === "collection"
          ? pages.filter((post) => inPlannedBlog(post) && parentOf(post.path) === page.path)
          : [],
    }));
};

function PlannedSections(props: {
  readonly page: PlannedPage;
  readonly blockTitle: (type: BlockType) => string;
}) {
  const { blockTitle } = props;
  return (
    <>
      <p className="flex items-baseline gap-1.5 text-sm">
        <span className="font-semibold">{props.page.title}</span>
        <span className="text-xs text-muted-foreground">{props.page.path}</span>
      </p>
      <ol className="flex flex-col gap-0.5 text-xs text-muted-foreground">
        {props.page.sections.map((section, index) => (
          <li key={`${section.type}-${index}`}>
            <span className="font-medium text-foreground">{blockTitle(section.type)}</span>:{" "}
            {section.purpose}
          </li>
        ))}
      </ol>
    </>
  );
}

function PlanCard(props: {
  readonly plan: SitePlan;
  readonly status: PlanStatus;
  readonly blockTitle: (type: BlockType) => string;
  readonly onBuild: () => void;
}) {
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
        {plannedBranches(props.plan.pages).map(({ page, posts }) => (
          <li key={page.path} className="flex flex-col gap-1 rounded-lg bg-muted/60 px-2.5 py-2">
            <PlannedSections page={page} blockTitle={props.blockTitle} />
            {posts.length > 0 && (
              <ol aria-label={`Posts in ${page.title}`} className="mt-1.5 flex flex-col gap-2">
                {posts.map((post) => (
                  <li key={post.path} className="flex flex-col gap-1 border-l-2 pl-2.5">
                    <PlannedSections page={post} blockTitle={props.blockTitle} />
                  </li>
                ))}
              </ol>
            )}
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
  readonly ready: boolean;
  readonly behind: boolean;
  readonly issues: number;
  readonly onSubmit: () => void;
}) {
  const { ready, behind, issues } = props;
  return (
    <section className="flex flex-col gap-2 rounded-xl border bg-card p-3">
      <h3 className="text-sm font-semibold">
        {ready ? "The draft passes its checks" : `${plural(issues, "thing")} to fix first`}
      </h3>
      {behind && (
        <p className="text-sm text-muted-foreground">
          The draft is behind the live site. It's updated when it's submitted.
        </p>
      )}
      <Button variant={ready ? "default" : "outline"} size="sm" onClick={props.onSubmit}>
        <SendIcon />
        Review and submit
      </Button>
    </section>
  );
}

function ChangesCard(props: {
  readonly changes: ReadonlyArray<Change>;
  readonly undone: boolean;
  readonly working: boolean;
  readonly actions: TurnActions;
}) {
  const shown = props.changes[0]?.at ?? null;
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
        {props.changes.map((change, index) => (
          <li key={index} className={cn("flex gap-1.5", props.undone && "line-through")}>
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

/** A part of Pakshi's reply, as the chat shows it. */
function ReplyPart(props: {
  readonly part: AgentPart;
  readonly context: TurnContext;
  readonly actions: TurnActions;
}) {
  const { part, context, actions } = props;
  switch (part.type) {
    case "text":
      return part.content.trim() === "" ? null : (
        <TextPart
          content={part.content}
          className="typeset typeset-chat"
          components={{
            a: ({ children, ...link }) => (
              <a {...link} target="_blank" rel="noreferrer">
                {children}
              </a>
            ),
          }}
        />
      );
    case "tool-call": {
      const activity = context.working ? <Activity part={part} /> : null;
      const result = resultOf(part);
      switch (part.name) {
        case "ask_user":
          return Option.match(Option.isSome(result) ? readQuestion(part.input) : Option.none(), {
            onNone: () => activity,
            onSome: ({ question, choices }) => (
              <Question
                id={part.id}
                question={question}
                choices={choices}
                context={context}
                onAnswer={actions.answer}
              />
            ),
          });
        case "propose_plan":
          return Option.match(Option.isSome(result) ? readPlan(part.input) : Option.none(), {
            onNone: () => activity,
            onSome: ({ plan }) => (
              <PlanCard
                plan={plan}
                status={context.plans.get(part.id) ?? "replaced"}
                blockTitle={context.blockTitle}
                onBuild={() => actions.build(part.id)}
              />
            ),
          });
        case "prepare_submission":
          return Option.match(Option.flatMap(result, readSubmission), {
            onNone: () => activity,
            onSome: ({ ready, behind, issues }) => (
              <SubmissionCard
                ready={ready}
                behind={behind}
                issues={issues.length}
                onSubmit={actions.submit}
              />
            ),
          });
        case "request_block":
          return Option.match(
            Option.isSome(result) && part.output?.filed === true
              ? readRequest(part.input)
              : Option.none(),
            {
              onNone: () => activity,
              onSome: ({ need }) => (
                <p className="text-sm text-muted-foreground">
                  Requested a block from the platform team: {need}
                </p>
              ),
            },
          );
        default:
          return activity;
      }
    }
    case "thinking":
      return context.working ? (
        <Marker render={<output />}>
          <MarkerIcon>
            <Spinner />
          </MarkerIcon>
          <MarkerContent className="shimmer">Thinking</MarkerContent>
        </Marker>
      ) : null;
    default:
      return null;
  }
}

/** Pakshi's reply in a turn: what it said and did, the turn's changes, and how it ended. */
export function Reply(props: {
  readonly turn: Turn;
  readonly context: TurnContext;
  readonly actions: TurnActions;
}) {
  const { turn, context, actions } = props;
  const changes = changesOf(turn.parts);
  const status = turn.record?.status ?? "working";
  return (
    <Message>
      <MessageContent>
        <p className="text-xs font-semibold text-muted-foreground">Pakshi</p>
        {context.working && turn.parts.length === 0 && (
          <Marker render={<output />}>
            <MarkerIcon>
              <Spinner />
            </MarkerIcon>
            <MarkerContent className="shimmer">Thinking</MarkerContent>
          </Marker>
        )}
        {turn.parts.map((part, index) =>
          // Pakshi shows it's thinking only while that's what it's doing.
          part.type === "thinking" && index !== turn.parts.length - 1 ? null : (
            <ReplyPart key={index} part={part} context={context} actions={actions} />
          ),
        )}
        {changes.length > 0 && (
          <ChangesCard
            changes={changes}
            undone={turn.record?.undone ?? false}
            working={context.working}
            actions={actions}
          />
        )}
        {status !== "working" && status !== "done" && (
          <Marker variant="border" render={<output />}>
            <MarkerContent>{endings[status]}</MarkerContent>
          </Marker>
        )}
      </MessageContent>
    </Message>
  );
}

export { PersonMessage };
