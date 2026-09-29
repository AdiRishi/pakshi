import { loadBlocks } from "@repo/blocks";
import type { MediaId, PageId, SiteId } from "@repo/contracts/ids";
import {
  type Connection,
  EditorCanvas,
  type Notice,
  EditorProvider,
  EditorSettings,
  type SaveStatus,
  useEditorCommands,
  useEditorStatus,
  usePageTitle,
} from "@repo/editor";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@repo/ui/components/breadcrumb";
import { Button } from "@repo/ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui/components/tooltip";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderIcon,
  MonitorIcon,
  MoonIcon,
  Redo2Icon,
  SmartphoneIcon,
  SunIcon,
  TabletIcon,
  Undo2Icon,
} from "lucide-react";
import { type ReactNode, useState } from "react";

import { Logo } from "@/components/logo";
import { applyBatch } from "@/features/sites/functions";
import { editorDraftQuery } from "@/features/sites/queries";

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

/** The editor's accent, read from Studio's theme so the canvas outlines match Studio. */
const studioAccent = () =>
  getComputedStyle(document.documentElement).getPropertyValue("--ring").trim();

const saveCopy: Readonly<Record<SaveStatus, { readonly label: string; readonly icon: ReactNode }>> =
  {
    saved: { label: "Saved to the draft", icon: <CircleCheckIcon /> },
    saving: { label: "Saving", icon: <LoaderIcon className="animate-spin" /> },
    retrying: {
      label: "Can't reach Pakshi. Retrying",
      icon: <CircleAlertIcon className="text-destructive" />,
    },
  };

function IconButton(props: {
  readonly label: string;
  readonly shortcut: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={props.label}
            disabled={props.disabled}
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipContent>
        {props.label} ({props.shortcut})
      </TooltipContent>
    </Tooltip>
  );
}

function Toolbar(props: {
  readonly site: { readonly id: SiteId; readonly name: string };
  readonly width: Width;
  readonly onWidth: (width: Width) => void;
  readonly scheme: "light" | "dark";
  readonly onScheme: (scheme: "light" | "dark") => void;
}) {
  const { status, canUndo, canRedo } = useEditorStatus();
  const { undo, redo } = useEditorCommands();
  const title = usePageTitle();
  const save = saveCopy[status];
  return (
    <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b bg-card px-4 py-2">
      <Link to="/" aria-label="Home">
        <Logo />
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
            <BreadcrumbPage>{title || "Untitled"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <output className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        {save.icon}
        {save.label}
      </output>
      <div className="ml-auto flex items-center gap-2">
        <IconButton label="Undo" shortcut="⌘Z" disabled={!canUndo} onClick={undo}>
          <Undo2Icon />
        </IconButton>
        <IconButton label="Redo" shortcut="⇧⌘Z" disabled={!canRedo} onClick={redo}>
          <Redo2Icon />
        </IconButton>
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
    </header>
  );
}

/** Studio's editor screen: the page in the canvas and the settings panel beside it. */
export function EditorPage(props: { readonly site: SiteId; readonly page: PageId }) {
  const { data } = useSuspenseQuery(editorDraftQuery(props.site));
  const { data: definitions } = useSuspenseQuery(blocksQuery(data.draft.lockfile));
  const [width, setWidth] = useState<Width>("desktop");
  const [scheme, setScheme] = useState<"light" | "dark">("light");
  const [accent] = useState(studioAccent);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [connection] = useState<Connection>(() => ({
    send: (batch) => applyBatch({ data: { site: props.site, batch } }),
  }));
  return (
    <EditorProvider
      draft={data.draft}
      page={props.page}
      definitions={definitions}
      media={data.media}
      mediaSrc={mediaSrc}
      connection={connection}
      onNotice={setNotice}
    >
      <div className="flex h-screen flex-col">
        <Toolbar
          site={{ id: props.site, name: data.draft.settings.name }}
          width={width}
          onWidth={setWidth}
          scheme={scheme}
          onScheme={setScheme}
        />
        <div className="flex min-h-0 flex-1">
          <main aria-label="Page canvas" className="relative min-w-0 flex-1 bg-muted p-4">
            <EditorCanvas siteCss={siteCss} width={widths[width]} scheme={scheme} accent={accent} />
            <div aria-live="polite" className="absolute right-8 bottom-8 max-w-sm">
              {notice !== null && (
                <Alert variant="destructive" className="bg-card shadow-md">
                  <CircleAlertIcon />
                  <AlertTitle>{notice.message}</AlertTitle>
                  <AlertDescription>
                    {notice.errors.map((error) => error.message).join(" ")}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setNotice(null)}
                    >
                      Dismiss
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
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
