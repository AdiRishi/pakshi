import { AuditKind, auditKinds, type AuditQuery, type AuditRow } from "@repo/contracts/audit";
import { now, Timestamp } from "@repo/contracts/release";
import type { Viewer } from "@repo/contracts/studio";
import { auditEventTitles, describeAuditEvent } from "@repo/domain/audit";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Checkbox } from "@repo/ui/components/checkbox";
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@repo/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useInfiniteQuery, useSuspenseQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { Fragment, useId, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { formatDay, formatTime } from "@/lib/dates";
import { initials } from "@/lib/initials";

import { auditFiltersQuery, auditLogQuery } from "./queries";

const day = 24 * 60 * 60 * 1000;

const periods = {
  today: { title: "Today", since: () => new Date(new Date().setHours(0, 0, 0, 0)) },
  week: { title: "Last 7 days", since: () => new Date(Date.now() - 7 * day) },
  month: { title: "Last 30 days", since: () => new Date(Date.now() - 30 * day) },
  year: { title: "Last 12 months", since: () => new Date(Date.now() - 365 * day) },
  all: { title: "All time", since: () => null },
} as const;
type Period = keyof typeof periods;

const isPeriod = (value: string): value is Period => Object.hasOwn(periods, value);

/** A period with the moment it starts, fixed when it's chosen so the query stays the same. */
const rangeOf = (period: Period) => {
  const since = periods[period].since();
  return { period, since: since === null ? null : Timestamp.make(since.toISOString()) };
};

const anyone = "";

/** A day's heading, such as "Today, 28 September 2026". */
const dayHeading = (at: Timestamp) => {
  const date = formatDay(at);
  return date === formatDay(now()) ? `Today, ${date}` : date;
};

/** The audit log's rows, a heading for each day they fall on. */
function Rows(props: { readonly rows: ReadonlyArray<AuditRow> }) {
  return (
    <TableBody>
      {props.rows.map((row, index) => {
        const previous = props.rows[index - 1];
        const heading =
          previous === undefined || formatDay(previous.entry.at) !== formatDay(row.entry.at);
        const { actor, event } = row.entry;
        return (
          <Fragment key={row.entry.id}>
            {heading && (
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead colSpan={5} scope="colgroup" className="h-8 text-xs">
                  {dayHeading(row.entry.at)}
                </TableHead>
              </TableRow>
            )}
            <TableRow>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatTime(row.entry.at)}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar className="size-6">
                    <AvatarFallback className="text-xs">
                      {actor === null ? "P" : initials(actor.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{actor?.name ?? "Pakshi"}</span>
                </div>
              </TableCell>
              <TableCell>{auditEventTitles[event._tag]}</TableCell>
              <TableCell>{row.site ?? row.brand ?? ""}</TableCell>
              <TableCell className="max-w-md whitespace-normal">
                {describeAuditEvent(event)}
              </TableCell>
            </TableRow>
          </Fragment>
        );
      })}
    </TableBody>
  );
}

/** Everything people and Pakshi did in Studio, filtered by who, where, when and what. */
export function AuditPage(props: { readonly viewer: Viewer }) {
  const { data: filters } = useSuspenseQuery(auditFiltersQuery);
  const ids = { person: useId(), site: useId(), period: useId() };
  const [person, setPerson] = useState(anyone);
  const [site, setSite] = useState(anyone);
  const [range, setRange] = useState(() => rangeOf("month"));
  const [kinds, setKinds] = useState<ReadonlySet<AuditKind>>(new Set());
  const query: AuditQuery = {
    person: person === anyone ? null : person,
    site: filters.sites.find((candidate) => candidate.id === site)?.id ?? null,
    kinds: AuditKind.literals.filter((kind) => kinds.has(kind)),
    since: range.since,
    until: null,
  };
  const log = useInfiniteQuery(auditLogQuery(query));
  const rows = log.data?.pages.flatMap((page) => page.rows) ?? [];
  const total = log.data?.pages[0]?.total;
  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-2 bg-accent px-10 pt-6 pb-8">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Audit log</h1>
          <a
            className={buttonVariants({ variant: "outline", className: "ml-auto" })}
            href={`/exports/audit?query=${encodeURIComponent(JSON.stringify(query))}`}
            download
          >
            <DownloadIcon />
            Export
          </a>
        </div>
        <p className="text-secondary-foreground">
          Everything people and Pakshi did in Studio, with who, when and what. Nobody can change or
          delete an entry.
        </p>
      </header>
      <div className="grid items-start gap-8 px-10 py-8 lg:grid-cols-[16rem_1fr]">
        <Card>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={ids.person}>Person</FieldLabel>
                <NativeSelect
                  id={ids.person}
                  className="w-full"
                  value={person}
                  onChange={(event) => setPerson(event.target.value)}
                >
                  <NativeSelectOption value={anyone}>Everyone</NativeSelectOption>
                  {filters.people.map((candidate) => (
                    <NativeSelectOption key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.site}>Site</FieldLabel>
                <NativeSelect
                  id={ids.site}
                  className="w-full"
                  value={site}
                  onChange={(event) => setSite(event.target.value)}
                >
                  <NativeSelectOption value={anyone}>All sites</NativeSelectOption>
                  {filters.sites.map((candidate) => (
                    <NativeSelectOption key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field>
                <FieldLabel htmlFor={ids.period}>Date range</FieldLabel>
                <NativeSelect
                  id={ids.period}
                  className="w-full"
                  value={range.period}
                  onChange={(event) => {
                    if (isPeriod(event.target.value)) setRange(rangeOf(event.target.value));
                  }}
                >
                  {Object.entries(periods).map(([value, { title }]) => (
                    <NativeSelectOption key={value} value={value}>
                      {title}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <FieldSet>
                <FieldLegend variant="label">Type of event</FieldLegend>
                <FieldGroup className="gap-2">
                  {AuditKind.literals.map((kind) => (
                    <Field key={kind} orientation="horizontal">
                      <Checkbox
                        id={`${ids.period}-${kind}`}
                        checked={kinds.has(kind)}
                        onCheckedChange={(checked) =>
                          setKinds((held) => {
                            const next = new Set(held);
                            if (checked) next.add(kind);
                            else next.delete(kind);
                            return next;
                          })
                        }
                      />
                      <FieldLabel htmlFor={`${ids.period}-${kind}`} className="font-normal">
                        {auditKinds[kind].title}
                      </FieldLabel>
                    </Field>
                  ))}
                </FieldGroup>
              </FieldSet>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                {total === undefined
                  ? "Finding events…"
                  : total === 1
                    ? "1 event matches"
                    : `${total} events match`}
              </p>
            </FieldGroup>
          </CardContent>
        </Card>
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Person</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Site</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <Rows rows={rows} />
          </Table>
          {rows.length === 0 && !log.isPending && (
            <p className="p-6 text-center text-muted-foreground">No events match.</p>
          )}
          {log.hasNextPage && (
            <div className="flex justify-center p-4">
              <Button
                variant="outline"
                disabled={log.isFetchingNextPage}
                onClick={() => void log.fetchNextPage()}
              >
                Show older events
              </Button>
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
