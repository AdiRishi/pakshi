import type { DraftId, PageId, SiteId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import { pageName } from "@repo/contracts/page";
import type { OpenedDraft, SiteAbilities } from "@repo/contracts/studio";
import {
  EditorCanvas,
  EditorOutline,
  EditorParticipants,
  EditorProvider,
  EditorSettings,
  type Notice,
  type SaveStatus,
  useAccessEnded,
  useBehind,
  useDraftClosure,
  useDraftView,
  useEditorStatus,
  useOutdated,
  usePage,
  useShowBlock,
  useToolbarCommands,
} from "@repo/editor";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Badge } from "@repo/ui/components/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/breadcrumb";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  ListTreeIcon,
  LoaderIcon,
  MonitorIcon,
  MoonIcon,
  SmartphoneIcon,
  SparklesIcon,
  SunIcon,
  TabletIcon,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/logo";
import { useAgent } from "@/features/agent/agent";
import { ChatPanel } from "@/features/agent/chat-panel";
import { standing } from "@/features/approvals/describe";
import { blocksQuery } from "@/features/blocks/blocks-query";
import { ChecksButton } from "@/features/checks/checks-button";
import type { ShownBlock } from "@/features/checks/issues";
import { DraftActions } from "@/features/drafts/draft-actions";
import { uploadImage } from "@/features/media/upload";
import { draftImage } from "@/features/preview/address";
import { suggestAltText } from "@/features/sites/functions";

import { canvasColors } from "./canvas-colors";
import { liveConnection } from "./live-connection";

import siteCss from "@repo/blocks/site.css?url";

const widths = { desktop: null, tablet: 768, mobile: 375 } as const;
type Width = keyof typeof widths;
const widthNames = ["desktop", "tablet", "mobile"] as const satisfies ReadonlyArray<Width>;

const showNotice = (notice: Notice) =>
  toast.warning(notice.title, { description: notice.description });

const saveCopy: Readonly<Record<SaveStatus, { readonly label: string; readonly icon: ReactNode }>> =
  {
    saved: { label: "Saved to the draft", icon: <CircleCheckIcon /> },
    saving: { label: "Saving", icon: <LoaderIcon className="animate-spin" /> },
    offline: {
      label: "Can't reach Pakshi. Reconnecting",
      icon: <CircleAlertIcon className="text-destructive" />,
    },
  };

interface DraftContext {
  readonly person: Collaborator;
  readonly submitting: boolean;
  readonly onSubmittingChange: (open: boolean) => void;
  readonly site: { readonly id: SiteId; readonly name: string };
  readonly draft: { readonly id: DraftId; readonly name: string };
  readonly can: SiteAbilities;
  readonly review: OpenedReady["summary"]["review"];
}

type OpenedReady = Extract<OpenedDraft, { _tag: "Ready" }>;

function Header(props: DraftContext & { readonly checks: ReactNode }) {
  const status = useEditorStatus();
  const view = useDraftView();
  const page = view.pages[usePage()];
  const title = page === undefined || page.meta.title === "" ? "Untitled" : page.meta.title;
  const collection = page?.type === "entry" ? (view.pages[page.collection] ?? null) : null;
  const behind = useBehind();
  const closure = useDraftClosure();
  const save = saveCopy[status];
  const review = props.review === null ? null : standing(props.review);
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-card px-4 py-2">
      <Link to="/" aria-label="Home">
        <Logo variant="mark" />
      </Link>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<Link to="/sites/$siteId" params={{ siteId: props.site.id }} />}
            >
              {props.site.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink
              render={
                <Link
                  to="/sites/$siteId/drafts/$draftId"
                  params={{ siteId: props.site.id, draftId: props.draft.id }}
                />
              }
            >
              {props.draft.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {collection !== null && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink
                  render={
                    <Link
                      to="/sites/$siteId/drafts/$draftId/pages/$pageId"
                      params={{
                        siteId: props.site.id,
                        draftId: props.draft.id,
                        pageId: collection.id,
                      }}
                    />
                  }
                >
                  {pageName(collection)}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <output className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        {save.icon}
        {save.label}
      </output>
      {review !== null && props.review?.status._tag !== "Published" && (
        <Badge variant={review.variant}>{review.label}</Badge>
      )}
      {behind && closure === null && (
        <div className="flex items-center gap-2">
          <Badge variant="warning">Behind the live site</Badge>
          <Link
            to="/sites/$siteId/drafts/$draftId/update"
            params={{ siteId: props.site.id, draftId: props.draft.id }}
            className={buttonVariants({ variant: "link", size: "sm" })}
          >
            Update draft
          </Link>
        </div>
      )}
      <div className="ml-auto flex items-center gap-3">
        <EditorParticipants />
        {props.checks}
        <DraftActions
          site={props.site.id}
          draft={props.draft}
          can={props.can}
          onPublished={() => Promise.resolve()}
          submitting={props.submitting}
          onSubmittingChange={props.onSubmittingChange}
        />
      </div>
    </header>
  );
}

/**
 * What happens when the draft stops taking changes: someone published or
 * closed it, a merge moved it to block versions this editor didn't load, or
 * its sharing no longer lets the person edit it.
 */
function DraftStanding(props: DraftContext) {
  const closure = useDraftClosure();
  const outdated = useOutdated();
  const accessEnded = useAccessEnded();
  if (accessEnded)
    return (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You can no longer edit this draft</AlertDialogTitle>
            <AlertDialogDescription>
              Its sharing changed, and it's no longer shared with you for editing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              nativeButton={false}
              render={<Link to="/" className={buttonVariants()} />}
            >
              Go to Studio
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  const who = closure === null || closure.by.id === props.person.id ? "You" : closure.by.name;
  if (outdated)
    return (
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>This draft now uses newer block versions</AlertDialogTitle>
            <AlertDialogDescription>
              Someone brought changes from the live site into it that need newer versions of some
              blocks. Open the draft again to keep editing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => window.location.reload()}>
              Open it again
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  if (closure === null) return null;
  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {closure.release === null ? `${who} closed this draft` : `${who} published this draft`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {closure.release === null
              ? "Its changes won't go live, and it takes no more edits."
              : "Its changes are live within about a minute, and it takes no more edits."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            nativeButton={false}
            render={
              <Link
                to="/sites/$siteId"
                params={{ siteId: props.site.id }}
                className={buttonVariants()}
              />
            }
          >
            Back to drafts
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Undo and redo, the page's address, and how wide and in which scheme the canvas shows it. */
function CanvasToolbar(props: {
  readonly width: Width;
  readonly onWidth: (width: Width) => void;
  readonly scheme: "light" | "dark";
  readonly onScheme: (scheme: "light" | "dark") => void;
}) {
  const commands = useToolbarCommands();
  return (
    <div className="flex items-center gap-3 border-b bg-card px-3 py-1.5">
      <div className="flex items-center gap-1">
        {commands.map((command) => (
          <Tooltip key={command.title}>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={command.title}
                  aria-keyshortcuts={command.ariaKeyShortcuts}
                  disabled={command.disabled}
                  onClick={command.run}
                />
              }
            >
              {command.icon !== undefined && <command.icon />}
            </TooltipTrigger>
            <TooltipContent>
              {command.title}
              {command.shortcut !== undefined && ` (${command.shortcut})`}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-2">
        <ToggleGroup
          aria-label="Page width"
          value={[props.width]}
          onValueChange={(values) => {
            const width = widthNames.find((key) => values.includes(key));
            if (width !== undefined) props.onWidth(width);
          }}
        >
          <ToggleGroupItem value="desktop" aria-label="Desktop width">
            <MonitorIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="tablet" aria-label="Tablet width">
            <TabletIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="mobile" aria-label="Phone width">
            <SmartphoneIcon />
          </ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup
          aria-label="Color scheme"
          value={[props.scheme]}
          onValueChange={(values) => {
            const scheme = (["light", "dark"] as const).find((key) => values.includes(key));
            if (scheme !== undefined) props.onScheme(scheme);
          }}
        >
          <ToggleGroupItem value="light" aria-label="Light">
            <SunIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value="dark" aria-label="Dark">
            <MoonIcon />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
    </div>
  );
}

/**
 * Selects the block or field the editor was opened to show, such as an issue
 * the checks found on this page, then lets the address forget it.
 */
function ShowOnOpen(props: { readonly show: ShownBlock | null; readonly onShown: () => void }) {
  const page = usePage();
  const showBlock = useShowBlock();
  const shown = useRef<ShownBlock | null>(null);
  const { show, onShown } = props;
  useEffect(() => {
    if (show === null || shown.current === show) return;
    shown.current = show;
    showBlock(page, show.block, show.path);
    onShown();
  }, [show, page, showBlock, onShown]);
  return null;
}

/** Studio's editor screen: the page in the canvas and the settings panel beside it. */
export function EditorPage(props: {
  readonly site: SiteId;
  readonly draft: DraftId;
  readonly page: PageId;
  readonly person: Collaborator;
  readonly opened: OpenedReady;
  /** The block or field to select once the page opens, or null for none. */
  readonly show: ShownBlock | null;
  readonly onShown: () => void;
}) {
  const data = props.opened;
  const { data: definitions } = useSuspenseQuery(blocksQuery(data.draft.lockfile));
  const [width, setWidth] = useState<Width>("desktop");
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const [colors] = useState(canvasColors);
  const [connection] = useState(() => liveConnection(props.site, props.draft));
  const [mediaSrc] = useState(() => draftImage(props.site, props.draft));
  const [submitting, setSubmitting] = useState(false);
  const agent = useAgent(props.site, props.draft);
  const [beside, setBeside] = useState<"agent" | "outline">("agent");
  const context: DraftContext = {
    person: props.person,
    submitting,
    onSubmittingChange: setSubmitting,
    site: { id: props.site, name: data.settings.name },
    draft: { id: props.draft, name: data.summary.name },
    can: data.can,
    review: data.summary.review,
  };
  return (
    <EditorProvider
      draft={data.draft}
      live={data.live}
      page={props.page}
      definitions={definitions}
      media={data.media}
      mediaSrc={mediaSrc}
      suggestAltText={(media, block) =>
        suggestAltText({ data: { site: props.site, draft: props.draft, media, block } })
      }
      uploadImage={
        data.can.upload ? (file) => uploadImage(file, { kind: "site", id: props.site }) : null
      }
      siteCss={siteCss}
      settings={data.settings}
      scheme={scheme}
      person={props.person}
      connection={connection}
      onNotice={showNotice}
    >
      <div className="flex h-screen flex-col">
        <Header
          {...context}
          checks={
            <ChecksButton
              site={props.site}
              draft={props.draft}
              contracts={definitions}
              agent={agent}
              onShowPakshi={() => setBeside("agent")}
            />
          }
        />
        <DraftStanding {...context} />
        <ShowOnOpen show={props.show} onShown={props.onShown} />
        <div className="flex min-h-0 flex-1">
          <aside
            aria-label="Assistant and outline"
            className="flex w-80 shrink-0 flex-col border-r bg-card"
          >
            <Tabs
              value={beside}
              onValueChange={(value: "agent" | "outline") => setBeside(value)}
              className="min-h-0 flex-1 gap-0"
            >
              <TabsList variant="line" className="w-full shrink-0 justify-start border-b px-3">
                <TabsTrigger value="agent" className="flex-none">
                  <SparklesIcon />
                  Ask Pakshi
                </TabsTrigger>
                <TabsTrigger value="outline" className="flex-none">
                  <ListTreeIcon />
                  Outline
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="agent"
                keepMounted
                className="flex min-h-0 flex-1 flex-col data-hidden:hidden"
              >
                <ChatPanel
                  site={props.site}
                  draft={context.draft}
                  agent={agent}
                  onSubmit={() => setSubmitting(true)}
                />
              </TabsContent>
              <TabsContent value="outline" className="min-h-0 flex-1 overflow-y-auto">
                <EditorOutline />
              </TabsContent>
            </Tabs>
          </aside>
          <main aria-label="Page canvas" className="flex min-w-0 flex-1 flex-col bg-muted">
            <CanvasToolbar width={width} onWidth={setWidth} scheme={scheme} onScheme={setScheme} />
            <div className="min-h-0 flex-1 p-4">
              <EditorCanvas
                width={widths[width]}
                accent={colors.accent}
                warning={colors.warning}
                presence={colors.presence}
              />
            </div>
          </main>
          <aside aria-label="Settings" className="w-96 shrink-0 overflow-y-auto border-l bg-card">
            <EditorSettings />
          </aside>
        </div>
      </div>
    </EditorProvider>
  );
}
