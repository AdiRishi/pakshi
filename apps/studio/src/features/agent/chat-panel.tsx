import type { Activity, Source } from "@repo/contracts/agent";
import type { DraftId, SiteId } from "@repo/contracts/ids";
import { useDeselect, usePage, useSelected, useShowBlock } from "@repo/editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/ui/components/alert-dialog";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { ScrollArea } from "@repo/ui/components/scroll-area";
import { Spinner } from "@repo/ui/components/spinner";
import { Textarea } from "@repo/ui/components/textarea";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowUpIcon,
  FileTextIcon,
  PaperclipIcon,
  RotateCcwIcon,
  SparklesIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

import { Conversation } from "./conversation";
import { TurnView } from "./turn-view";

/** The file types Pakshi reads, for the file picker. */
const accepted = ".pdf,.docx,.txt,.md,.csv,.html";

/**
 * The chat with Pakshi about the draft: the conversation so far, each turn
 * as it streams, and a composer that sends the selected block along.
 */
export function ChatPanel(props: {
  readonly site: SiteId;
  readonly draft: { readonly id: DraftId; readonly name: string };
  /** Opens the submit dialog, which a person uses to submit. */
  readonly onSubmit: () => void;
}) {
  const [conversation] = useState(
    () =>
      new Conversation({
        site: props.site,
        draft: props.draft.id,
        onNotice: (message) => toast.info(message),
      }),
  );
  useEffect(() => conversation.connect(), [conversation]);
  const state = useSyncExternalStore(conversation.subscribe, conversation.getState);
  const page = usePage();
  const selected = useSelected();
  const deselect = useDeselect();
  const showBlock = useShowBlock();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<ReadonlyArray<Source>>([]);
  const [attaching, setAttaching] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const inputId = useId();
  const working = state.turns.some((turn) => turn.status === "working");
  const last = state.turns.at(-1);

  // Keep the newest of the conversation in view as it streams.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [last]);

  const send = () => {
    const message = text.trim();
    if (message === "" || working || state.status !== "open") return;
    conversation.send({
      _tag: "Send",
      text: message,
      sources: attached.map((source) => source.id),
      page,
      selected,
    });
    setText("");
    setAttached([]);
  };

  const attach = async (files: FileList | null) => {
    const file = files?.[0];
    if (file === undefined) return;
    setAttaching(true);
    const result = await conversation.attach(file);
    setAttaching(false);
    if (fileInput.current !== null) fileInput.current.value = "";
    if (result.ok) setAttached((current) => [...current, result.source]);
    else toast.error(result.reason);
  };

  const show = (at: NonNullable<Activity["at"]>) => {
    if (at.page === page) {
      if (at.block !== null) showBlock(at.page, at.block);
      return;
    }
    navigate({
      to: "/sites/$siteId/drafts/$draftId/pages/$pageId",
      params: { siteId: props.site, draftId: props.draft.id, pageId: at.page },
    }).catch(() => toast.error("That page couldn't be opened."));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-5 p-4">
          <div className="flex items-start gap-2">
            <p className="text-xs text-muted-foreground">
              Pakshi only changes the {props.draft.name} draft. Nothing goes live until it's
              approved.
            </p>
            {state.turns.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger
                  render={<Button variant="ghost" size="xs" className="shrink-0" />}
                >
                  <RotateCcwIcon />
                  New conversation
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Start a new conversation?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Pakshi forgets this conversation, its plan and the documents attached to it.
                      Everything it changed stays in the draft.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => conversation.send({ _tag: "Clear" })}>
                      Start again
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          {state.status === "connecting" && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              Opening the conversation
            </p>
          )}
          {state.status === "open" && state.turns.length === 0 && (
            <Empty className="border-0 p-2">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SparklesIcon />
                </EmptyMedia>
                <EmptyTitle>Ask Pakshi</EmptyTitle>
                <EmptyDescription>
                  Describe a change, such as "add a section about our opening hours", or the site
                  you want built. Select a block first to change just that block.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          <ol aria-label="Conversation with Pakshi" className="flex flex-col gap-6">
            {state.turns.map((turn) => (
              <TurnView
                key={turn.id}
                turn={turn}
                actions={{
                  answer: (part, answer) =>
                    conversation.send({ _tag: "Answer", turn: turn.id, part, answer, page }),
                  build: (part) => conversation.send({ _tag: "Build", turn: turn.id, part, page }),
                  undo: () => conversation.send({ _tag: "Undo", turn: turn.id }),
                  show,
                  submit: props.onSubmit,
                }}
              />
            ))}
          </ol>
          <div ref={end} />
        </div>
      </ScrollArea>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
        className="flex flex-col gap-2 border-t bg-card p-3"
      >
        {(selected !== null || attached.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {selected !== null && (
              <span className="flex items-center gap-1 rounded-md bg-accent py-0.5 pr-0.5 pl-2 text-xs font-medium text-accent-foreground">
                About: {selected.title}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Clear selection"
                  onClick={deselect}
                >
                  <XIcon />
                </Button>
              </span>
            )}
            {attached.map((source) => (
              <span
                key={source.id}
                className="flex items-center gap-1 rounded-md border py-0.5 pr-0.5 pl-2 text-xs font-medium"
              >
                <FileTextIcon aria-hidden className="size-3.5 text-muted-foreground" />
                {source.name}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${source.name}`}
                  onClick={() =>
                    setAttached((current) => current.filter((found) => found.id !== source.id))
                  }
                >
                  <XIcon />
                </Button>
              </span>
            ))}
          </div>
        )}
        <label htmlFor={inputId} className="sr-only">
          Message Pakshi
        </label>
        <Textarea
          id={inputId}
          value={text}
          placeholder={
            selected === null
              ? "Describe a change to this page"
              : `Ask Pakshi to change the ${selected.title}`
          }
          rows={2}
          className="max-h-40 resize-none"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              send();
            }
          }}
        />
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={accepted}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => void attach(event.target.files)}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={attaching}
            onClick={() => fileInput.current?.click()}
          >
            {attaching ? <Spinner /> : <PaperclipIcon />}
            Attach a document
          </Button>
          {working ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => conversation.send({ _tag: "Stop" })}
            >
              <SquareIcon />
              Stop
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon-sm"
              className="ml-auto"
              aria-label="Send"
              disabled={text.trim() === "" || state.status !== "open"}
            >
              <ArrowUpIcon />
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
