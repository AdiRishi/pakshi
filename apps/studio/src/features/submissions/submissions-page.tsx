import type { FormEntry, FormSummary } from "@repo/contracts/entries";
import type { EntryId, FormId, SiteId } from "@repo/contracts/ids";
import type { SiteEntriesView, Viewer } from "@repo/contracts/studio";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@repo/ui/components/alert-dialog";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { formatDay, formatMoment } from "@/lib/dates";

import { SiteHeader } from "../sites/site-header";
import { DeletePersonDialog } from "./delete-person-dialog";
import { deleteEntry } from "./functions";
import { formEntriesQuery, formEntryQuery, siteEntriesQuery } from "./queries";
import type { SubmissionsSearch } from "./submissions-route";

/** What a submissions address asks for: a form, a search within it, and an entry to show. */
export interface SubmissionsPlace {
  readonly form: FormId | null;
  readonly search: string | null;
  readonly entry: EntryId | null;
}

/** A submissions address's search, leaving out what isn't set. */
const searchFor = (form: FormId | null, search: string | null): SubmissionsSearch => {
  if (form === null) return search === null ? {} : { q: search };
  return search === null ? { form } : { form, q: search };
};

const countOf = (form: FormSummary) =>
  `${form.entries === 1 ? "1 entry" : `${form.entries} entries`}${form.latest === null ? "" : `, latest ${formatDay(form.latest)}`}`;

/** Who sent an entry, as far as its answers say: the address they gave, or their first answer. */
const senderOf = (entry: FormEntry) =>
  entry.email ?? entry.fields.find((field) => field.value !== "")?.value ?? "Someone";

const answersOf = (entry: FormEntry) =>
  entry.fields
    .filter((field) => field.value !== "" && field.value.toLowerCase() !== entry.email)
    .map((field) => field.value)
    .join(" · ");

/** Who may see a site's form entries, for someone who may not. */
export function NoSubmissionsAccess(props: { readonly viewer: Viewer; readonly site: SiteId }) {
  return (
    <AppShell viewer={props.viewer}>
      <SiteHeader site={props.site} section="submissions" />
      <Empty className="px-10 py-16">
        <EmptyHeader>
          <EmptyTitle>You can't see this site's form entries</EmptyTitle>
          <EmptyDescription>
            Site admins and submissions viewers can. Ask one of them if you need an entry.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </AppShell>
  );
}

/** A site's forms, the entries of one of them, and one entry when it's open. */
export function SubmissionsPage(props: {
  readonly viewer: Viewer;
  readonly site: SiteId;
  readonly place: SubmissionsPlace;
}) {
  const { data } = useSuspenseQuery(siteEntriesQuery(props.site));
  const form = data.forms.find((candidate) => candidate.id === props.place.form) ?? data.forms[0];
  return (
    <AppShell viewer={props.viewer}>
      <SiteHeader site={props.site} section="submissions" />
      {form === undefined ? (
        <Empty className="px-10 py-16">
          <EmptyHeader>
            <EmptyTitle>No forms yet</EmptyTitle>
            <EmptyDescription>
              Add a form to a page in a draft. Once it's published, what visitors send appears here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="flex flex-col gap-6 px-10 py-8">
          <p className="max-w-prose text-secondary-foreground">
            What visitors send with the site's forms. Pakshi's agent never reads them.
          </p>
          <div className="grid gap-8 lg:grid-cols-[16rem_1fr]">
            <nav aria-label="Forms" className="flex flex-col gap-1">
              {data.forms.map((candidate) => (
                <Link
                  key={candidate.id}
                  to="/sites/$siteId/submissions"
                  params={{ siteId: props.site }}
                  search={{ form: candidate.id }}
                  aria-current={candidate.id === form.id ? "page" : undefined}
                  className={buttonVariants({
                    variant: "ghost",
                    className:
                      "h-auto flex-col items-start gap-0.5 py-2 aria-[current=page]:bg-accent",
                  })}
                >
                  <span className="font-medium">{candidate.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {countOf(candidate)}
                  </span>
                </Link>
              ))}
              <p className="mt-4 text-xs text-muted-foreground">
                Forms are edited in drafts. Where new entries are emailed is set in the site's{" "}
                <Link
                  to="/sites/$siteId/settings/forms"
                  params={{ siteId: props.site }}
                  className="underline underline-offset-4"
                >
                  settings
                </Link>
                .
              </p>
            </nav>
            <FormEntries view={data} form={form} place={props.place} />
          </div>
        </div>
      )}
      {props.place.entry !== null && (
        <EntrySheet view={data} entry={props.place.entry} place={props.place} />
      )}
    </AppShell>
  );
}

function FormEntries(props: {
  readonly view: SiteEntriesView;
  readonly form: FormSummary;
  readonly place: SubmissionsPlace;
}) {
  const { view, form, place } = props;
  const navigate = useNavigate();
  const searchId = useId();
  const [typed, setTyped] = useState(place.search ?? "");
  const find = useMutation({
    mutationFn: (search: string) =>
      navigate({
        to: "/sites/$siteId/submissions",
        params: { siteId: view.site.id },
        search: searchFor(form.id, search === "" ? null : search),
      }),
  });
  const entries = useInfiniteQuery({
    ...formEntriesQuery(view.site.id, form.id, place.search),
    placeholderData: keepPreviousData,
  });
  const shown = entries.data?.pages.flatMap((page) => page.entries) ?? [];
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-start gap-4">
        <div className="flex grow flex-col gap-1">
          <CardTitle>
            <h2 className="text-xl">{form.name}</h2>
          </CardTitle>
          <p className="text-sm text-muted-foreground">{countOf(form)}. Newest first.</p>
        </div>
        <div className="flex gap-2">
          {view.can.export && form.entries > 0 && (
            <a
              href={`/exports/${view.site.id}/${form.id}`}
              download
              className={buttonVariants({ variant: "outline" })}
            >
              Export CSV
            </a>
          )}
          {view.can.delete && <DeletePersonDialog site={view.site} />}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <search>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              find.mutate(typed.trim());
            }}
          >
            <label htmlFor={searchId} className="sr-only">
              Search entries
            </label>
            <Input
              id={searchId}
              type="search"
              placeholder="Search the answers"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </form>
        </search>
        {shown.length === 0 && !entries.isPending ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {place.search === null ? "Nothing has been sent yet." : "No entries match that search."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">Received</TableHead>
                <TableHead className="w-56">From</TableHead>
                <TableHead>Answers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground">
                    {formatMoment(entry.receivedAt)}
                  </TableCell>
                  <TableCell>
                    <Link
                      to="/sites/$siteId/submissions/$entryId"
                      params={{ siteId: view.site.id, entryId: entry.id }}
                      search={searchFor(form.id, place.search)}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {senderOf(entry)}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-0 truncate text-muted-foreground">
                    {answersOf(entry)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {entries.hasNextPage && (
          <Button
            variant="outline"
            className="self-center"
            disabled={entries.isFetchingNextPage}
            onClick={() => void entries.fetchNextPage()}
          >
            Show older entries
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function EntrySheet(props: {
  readonly view: SiteEntriesView;
  readonly entry: EntryId;
  readonly place: SubmissionsPlace;
}) {
  const { view, place } = props;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const entry = useQuery(formEntryQuery(view.site.id, props.entry));
  const [confirming, setConfirming] = useState(false);
  const close = () =>
    navigate({
      to: "/sites/$siteId/submissions",
      params: { siteId: view.site.id },
      search: searchFor(place.form, place.search),
    });
  const remove = useMutation({
    mutationFn: () => deleteEntry({ data: { site: view.site.id, entry: props.entry } }),
    onSuccess: async () => {
      toast.success("Entry deleted");
      await queryClient.invalidateQueries({ queryKey: ["sites", view.site.id, "entries"] });
      await close();
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Sheet open onOpenChange={(open) => !open && void close()}>
      <SheetContent className="w-full sm:max-w-lg">
        {entry.data === undefined ? (
          <SheetHeader>
            <SheetTitle>{entry.isError ? "This entry isn't here" : "Opening the entry"}</SheetTitle>
            <SheetDescription>
              {entry.isError ? entry.error.message : "One moment."}
            </SheetDescription>
          </SheetHeader>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>{senderOf(entry.data)}</SheetTitle>
              <SheetDescription>
                {entry.data.formName}, {formatMoment(entry.data.receivedAt)}, from {entry.data.page}
              </SheetDescription>
            </SheetHeader>
            <dl className="flex flex-col gap-4 overflow-y-auto px-4">
              {entry.data.fields.map((field) => (
                <div key={field.id} className="flex flex-col gap-1">
                  <dt className="text-sm text-muted-foreground">{field.label}</dt>
                  <dd className="whitespace-pre-wrap">{field.value || "No answer"}</dd>
                </div>
              ))}
            </dl>
            <SheetFooter className="flex-row gap-2">
              {entry.data.email !== null && (
                <a
                  href={`mailto:${entry.data.email}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Reply by email
                </a>
              )}
              {view.can.delete && (
                <Button variant="destructive" onClick={() => setConfirming(true)}>
                  Delete this entry
                </Button>
              )}
            </SheetFooter>
            <AlertDialog open={confirming} onOpenChange={setConfirming}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
                  <AlertDialogDescription>
                    It's removed for good, including from future exports.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                  >
                    Delete entry
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
