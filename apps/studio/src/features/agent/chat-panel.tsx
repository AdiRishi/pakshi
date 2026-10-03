import type { Change, Source } from "@repo/contracts/agent";
import type { DraftId, SiteId } from "@repo/contracts/ids";
import { useBlockTitle, useDeselect, usePage, useSelected, useShowBlock } from "@repo/editor";
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
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@repo/ui/components/attachment";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@repo/ui/components/input-group";
import { Marker, MarkerContent, MarkerIcon } from "@repo/ui/components/marker";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@repo/ui/components/message-scroller";
import { Spinner } from "@repo/ui/components/spinner";
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
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { type Agent, plansOf } from "./agent";
import { PersonMessage, Reply, type TurnContext } from "./turn-view";

/** The file types Pakshi reads, for the file picker. */
const accepted = ".pdf,.docx,.txt,.md,.csv,.html";

/**
 * The chat with Pakshi about the draft: the conversation so far, each turn
 * as it streams, and a composer that sends the selected block along.
 */
export function ChatPanel(props: {
  readonly site: SiteId;
  readonly draft: { readonly id: DraftId; readonly name: string };
  readonly agent: Agent;
  /** Opens the submit dialog, which a person uses to submit. */
  readonly onSubmit: () => void;
}) {
  const { agent } = props;
  const page = usePage();
  const selected = useSelected();
  const deselect = useDeselect();
  const showBlock = useShowBlock();
  const blockTitle = useBlockTitle();
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [attached, setAttached] = useState<ReadonlyArray<Source>>([]);
  const [attaching, setAttaching] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const plans = plansOf(agent.turns);

  const send = (message: string, builds: string | null = null) =>
    agent.send(message, {
      sources: attached.map((source) => source.id),
      page,
      selected,
      builds,
    });

  const submit = () => {
    const message = text.trim();
    if (message === "" || agent.working || agent.status !== "open") return;
    send(message);
    setText("");
    setAttached([]);
  };

  const attach = async (files: FileList | null) => {
    const file = files?.[0];
    if (file === undefined) return;
    setAttaching(true);
    const result = await agent.attach(file);
    setAttaching(false);
    if (fileInput.current !== null) fileInput.current.value = "";
    if (result.ok) setAttached((current) => [...current, result.source]);
    else toast.error(result.reason);
  };

  const show = (at: Change["at"]) => {
    if (at.page === page) {
      if (at.block !== null) showBlock(at.page, at.block);
      return;
    }
    navigate({
      to: "/sites/$siteId/drafts/$draftId/pages/$pageId",
      params: { siteId: props.site, draftId: props.draft.id, pageId: at.page },
    }).catch(() => toast.error("That page couldn't be opened."));
  };

  const contextOf = (index: number): TurnContext => {
    const last = index === agent.turns.length - 1;
    return {
      last,
      working: last && agent.working,
      answer: agent.turns[index + 1]?.text ?? null,
      plans,
      blockTitle,
    };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start gap-2 border-b px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Pakshi only changes the {props.draft.name} draft. Nothing goes live until it's approved.
        </p>
        {agent.turns.length > 0 && (
          <AlertDialog>
            <AlertDialogTrigger render={<Button variant="ghost" size="xs" className="shrink-0" />}>
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
                <AlertDialogAction onClick={agent.clear}>Start again</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent aria-label="Conversation with Pakshi" className="gap-5 p-4">
              {agent.status === "connecting" && (
                <Marker render={<output />}>
                  <MarkerIcon>
                    <Spinner />
                  </MarkerIcon>
                  <MarkerContent>Opening the conversation</MarkerContent>
                </Marker>
              )}
              {agent.status !== "connecting" && agent.turns.length === 0 && (
                <Empty className="border-0 p-2">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <SparklesIcon />
                    </EmptyMedia>
                    <EmptyTitle>Ask Pakshi</EmptyTitle>
                    <EmptyDescription>
                      Describe a change, such as "add a section about our opening hours", or the
                      site you want built. Select a block first to change just that block.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {agent.turns.flatMap((turn, index) => {
                const context = contextOf(index);
                return [
                  <MessageScrollerItem key={turn.id} messageId={turn.id} scrollAnchor>
                    <PersonMessage
                      text={turn.text}
                      sources={turn.record?.sources ?? []}
                      about={turn.record?.selected?.title ?? null}
                    />
                  </MessageScrollerItem>,
                  <MessageScrollerItem key={`${turn.id}-reply`} messageId={`${turn.id}-reply`}>
                    <Reply
                      turn={turn}
                      context={context}
                      actions={{
                        answer: (answer) => send(answer),
                        build: (call) => send("Build the plan.", call),
                        undo: () => {
                          if (turn.record !== null) agent.undo(turn.record.id);
                        },
                        show,
                        submit: props.onSubmit,
                      }}
                    />
                  </MessageScrollerItem>,
                ];
              })}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-2 border-t bg-card p-3"
      >
        {(selected !== null || attached.length > 0) && (
          <AttachmentGroup>
            {selected !== null && (
              <Attachment size="xs">
                <AttachmentContent>
                  <AttachmentTitle>About: {selected.title}</AttachmentTitle>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction aria-label="Clear selection" onClick={deselect}>
                    <XIcon />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            )}
            {attached.map((source) => (
              <Attachment key={source.id} size="xs">
                <AttachmentMedia>
                  <FileTextIcon />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>{source.name}</AttachmentTitle>
                </AttachmentContent>
                <AttachmentActions>
                  <AttachmentAction
                    aria-label={`Remove ${source.name}`}
                    onClick={() =>
                      setAttached((current) => current.filter((found) => found.id !== source.id))
                    }
                  >
                    <XIcon />
                  </AttachmentAction>
                </AttachmentActions>
              </Attachment>
            ))}
            {attaching && (
              <Attachment size="xs" state="uploading">
                <AttachmentMedia>
                  <Spinner />
                </AttachmentMedia>
                <AttachmentContent>
                  <AttachmentTitle>Attaching</AttachmentTitle>
                </AttachmentContent>
              </Attachment>
            )}
          </AttachmentGroup>
        )}
        <label htmlFor={inputId} className="sr-only">
          Message Pakshi
        </label>
        <InputGroup>
          <InputGroupTextarea
            id={inputId}
            value={text}
            placeholder={
              selected === null
                ? "Describe a change to this page"
                : `Ask Pakshi to change the ${selected.title}`
            }
            rows={2}
            className="max-h-40"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <InputGroupAddon align="block-end">
            <input
              ref={fileInput}
              type="file"
              accept={accepted}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => void attach(event.target.files)}
            />
            <InputGroupButton
              type="button"
              size="sm"
              disabled={attaching}
              onClick={() => fileInput.current?.click()}
            >
              <PaperclipIcon />
              Attach a document
            </InputGroupButton>
            {agent.working ? (
              <InputGroupButton
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                onClick={agent.stop}
              >
                <SquareIcon />
                Stop
              </InputGroupButton>
            ) : (
              <InputGroupButton
                type="submit"
                variant="default"
                size="icon-sm"
                className="ml-auto"
                aria-label="Send"
                disabled={text.trim() === "" || agent.status !== "open"}
              >
                <ArrowUpIcon />
              </InputGroupButton>
            )}
          </InputGroupAddon>
        </InputGroup>
      </form>
    </div>
  );
}
