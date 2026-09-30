import { loadBlocks } from "@repo/blocks";
import type { DraftId, MediaId, PageId, SiteId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import type { OpenedDraft } from "@repo/contracts/studio";
import {
  EditorCanvas,
  EditorOutline,
  EditorParticipants,
  EditorProvider,
  EditorSettings,
  type Notice,
  presenceColorCount,
  type SaveStatus,
  useBehind,
  useDraftClosure,
  useEditorStatus,
  useOutdated,
  usePageTitle,
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
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderIcon,
  MonitorIcon,
  MoonIcon,
  SendIcon,
  SmartphoneIcon,
  SunIcon,
  TabletIcon,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/logo";
import { PublishDialog } from "@/features/drafts/publish-dialog";
import { siteDraftsQuery } from "@/features/sites/queries";

import { liveConnection } from "./live-connection";

import siteCss from "@repo/blocks/site.css?url";

const widths = { desktop: null, tablet: 768, mobile: 375 } as const;
type Width = keyof typeof widths;
const widthNames = ["desktop", "tablet", "mobile"] as const satisfies ReadonlyArray<Width>;

const blocksQuery = (lockfile: Parameters<typeof loadBlocks>[0]) =>
  queryOptions({
    queryKey: ["blocks", lockfile],
    queryFn: () => loadBlocks(lockfile),
    staleTime: Number.POSITIVE_INFINITY,
  });

const mediaSrc = (id: MediaId) => `/media/${id}`;

const themeValue = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** The colors the canvas draws with, read from Studio's theme so they match Studio. */
const canvasColors = () => ({
  accent: themeValue("--ring"),
  presence: Array.from({ length: presenceColorCount }, (_, index) =>
    themeValue(`--presence-${index + 1}`),
  ),
});

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
  readonly site: { readonly id: SiteId; readonly name: string };
  readonly draft: { readonly id: DraftId; readonly name: string };
  readonly canPublish: boolean;
}

function Header(props: DraftContext) {
  const status = useEditorStatus();
  const title = usePageTitle();
  const behind = useBehind();
  const closure = useDraftClosure();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [publishing, setPublishing] = useState(false);
  const save = saveCopy[status];
  const toUpdate = () =>
    navigate({
      to: "/sites/$siteId/drafts/$draftId/update",
      params: { siteId: props.site.id, draftId: props.draft.id },
    });
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
          <BreadcrumbItem>
            <BreadcrumbPage>{title || "Untitled"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <output className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        {save.icon}
        {save.label}
      </output>
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
        {props.canPublish && (
          <Button onClick={() => setPublishing(true)}>
            <SendIcon />
            Publish
          </Button>
        )}
      </div>
      <PublishDialog
        site={props.site.id}
        draft={props.draft}
        open={publishing}
        onOpenChange={setPublishing}
        onPublished={async () => {
          toast.success(`${props.draft.name} is published`, {
            description: "It's live within about a minute.",
          });
          await queryClient.invalidateQueries({
            queryKey: siteDraftsQuery(props.site.id).queryKey,
          });
        }}
        onNeedsUpdate={toUpdate}
      />
    </header>
  );
}

/**
 * What happens when the draft stops taking changes: someone published or
 * closed it, or a merge moved it to block versions this editor didn't load.
 */
function DraftStanding(props: DraftContext) {
  const closure = useDraftClosure();
  const outdated = useOutdated();
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

/** Studio's editor screen: the page in the canvas and the settings panel beside it. */
export function EditorPage(props: {
  readonly site: SiteId;
  readonly draft: DraftId;
  readonly page: PageId;
  readonly person: Collaborator;
  readonly opened: Extract<OpenedDraft, { _tag: "Ready" }>;
}) {
  const data = props.opened;
  const { data: definitions } = useSuspenseQuery(blocksQuery(data.draft.lockfile));
  const [width, setWidth] = useState<Width>("desktop");
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const [colors] = useState(canvasColors);
  const [connection] = useState(() => liveConnection(props.site, props.draft));
  const context: DraftContext = {
    person: props.person,
    site: { id: props.site, name: data.draft.settings.name },
    draft: { id: props.draft, name: data.summary.name },
    canPublish: data.can.publish,
  };
  return (
    <EditorProvider
      draft={data.draft}
      live={data.live}
      page={props.page}
      definitions={definitions}
      media={data.media}
      mediaSrc={mediaSrc}
      siteCss={siteCss}
      scheme={scheme}
      person={props.person}
      connection={connection}
      onNotice={showNotice}
    >
      <div className="flex h-screen flex-col">
        <Header {...context} />
        <DraftStanding {...context} />
        <div className="flex min-h-0 flex-1">
          <aside
            aria-label="Structure"
            className="flex w-80 shrink-0 flex-col overflow-y-auto border-r bg-card"
          >
            <EditorOutline />
          </aside>
          <main aria-label="Page canvas" className="flex min-w-0 flex-1 flex-col bg-muted">
            <CanvasToolbar width={width} onWidth={setWidth} scheme={scheme} onScheme={setScheme} />
            <div className="min-h-0 flex-1 p-4">
              <EditorCanvas
                width={widths[width]}
                accent={colors.accent}
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
