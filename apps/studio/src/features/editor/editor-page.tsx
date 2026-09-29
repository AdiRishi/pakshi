import { loadBlocks } from "@repo/blocks";
import type { MediaId, PageId, SiteId } from "@repo/contracts/ids";
import {
  type Connection,
  EditorCanvas,
  EditorOutline,
  EditorProvider,
  EditorSettings,
  type Notice,
  type SaveStatus,
  useEditorStatus,
  usePageTitle,
  useToolbarCommands,
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
  SmartphoneIcon,
  SunIcon,
  TabletIcon,
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

function Header(props: { readonly site: { readonly id: SiteId; readonly name: string } }) {
  const status = useEditorStatus();
  const title = usePageTitle();
  const save = saveCopy[status];
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
            <BreadcrumbPage>{title || "Untitled"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <output className="flex items-center gap-2 text-sm text-muted-foreground [&_svg]:size-4">
        {save.icon}
        {save.label}
      </output>
    </header>
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
      siteCss={siteCss}
      scheme={scheme}
      connection={connection}
      onNotice={setNotice}
    >
      <div className="flex h-screen flex-col">
        <Header site={{ id: props.site, name: data.draft.settings.name }} />
        <div className="flex min-h-0 flex-1">
          <aside
            aria-label="Structure"
            className="flex w-80 shrink-0 flex-col overflow-y-auto border-r bg-card"
          >
            <EditorOutline />
          </aside>
          <main aria-label="Page canvas" className="flex min-w-0 flex-1 flex-col bg-muted">
            <CanvasToolbar width={width} onWidth={setWidth} scheme={scheme} onScheme={setScheme} />
            <div className="relative min-h-0 flex-1 p-4">
              <EditorCanvas width={widths[width]} accent={accent} />
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
