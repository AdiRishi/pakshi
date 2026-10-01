import { Timestamp } from "@repo/contracts/release";
import type { SuccessMetrics, Viewer } from "@repo/contracts/studio";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Field, FieldLabel } from "@repo/ui/components/field";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CircleAlertIcon, CircleCheckIcon, CircleDashedIcon } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

import { AppShell } from "@/components/app-shell";

import { successMetricsQuery } from "./queries";

const day = 24 * 60 * 60 * 1000;

const periods = {
  month: { title: "Last 30 days", days: 30 },
  quarter: { title: "Last 90 days", days: 90 },
  year: { title: "Last 12 months", days: 365 },
} as const;
type Period = keyof typeof periods;

const isPeriod = (value: string): value is Period => Object.hasOwn(periods, value);

/**
 * Where a period starts: the start of a UTC day, so the server and the
 * browser ask for the same figures.
 */
export const periodStart = (period: Period) =>
  Timestamp.make(
    new Date(Math.floor(Date.now() / day) * day - periods[period].days * day).toISOString(),
  );

const oneDecimal = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });

/** Whether a metric meets its target, said in words as well as by its icon. */
type Standing = "met" | "missed" | "unmeasured";

const standingCopy = {
  met: { icon: CircleCheckIcon, label: "On target", className: "text-success-foreground" },
  missed: { icon: CircleAlertIcon, label: "Off target", className: "text-warning-foreground" },
  unmeasured: {
    icon: CircleDashedIcon,
    label: "Nothing to measure yet",
    className: "text-muted-foreground",
  },
};

/** One metric: its figure, what it's measured over, and its target. */
function Metric(props: {
  readonly title: string;
  readonly value: string;
  readonly over: string;
  readonly target: string;
  readonly standing: Standing;
}) {
  const standing = standingCopy[props.standing];
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{props.title}</h2>
        </CardTitle>
        <CardDescription>{props.over}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-3xl font-semibold tabular-nums">{props.value}</p>
        <p className={`flex items-center gap-1.5 text-sm ${standing.className}`}>
          <standing.icon className="size-4" aria-hidden />
          {standing.label}
          <span className="text-muted-foreground">· target {props.target}</span>
        </p>
      </CardContent>
    </Card>
  );
}

const measured = (value: number | null, format: (value: number) => string) =>
  value === null ? "Not measured yet" : format(value);

const against = (value: number | null, meets: (value: number) => boolean): Standing =>
  value === null ? "unmeasured" : meets(value) ? "met" : "missed";

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** The block requests, month by month, against the sites people worked on. */
function BlockRequests(props: { readonly months: SuccessMetrics["blockRequests"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Block requests</h2>
        </CardTitle>
        <CardDescription>
          Requests per active site each month. Target: falling month over month.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead className="text-right">Requests</TableHead>
              <TableHead className="text-right">Active sites</TableHead>
              <TableHead className="text-right">Per active site</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.months.map((month) => (
              <TableRow key={month.month}>
                <TableCell>
                  {new Date(`${month.month}-01T00:00:00Z`).toLocaleDateString("en-GB", {
                    month: "long",
                    year: "numeric",
                    timeZone: "UTC",
                  })}
                </TableCell>
                <TableCell className="text-right tabular-nums">{month.requests}</TableCell>
                <TableCell className="text-right tabular-nums">{month.activeSites}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {month.activeSites === 0
                    ? "None active"
                    : oneDecimal.format(month.requests / month.activeSites)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Whether Pakshi works for the people who use it, as the product spec measures it. */
export function MetricsPage(props: { readonly viewer: Viewer }) {
  const periodId = useId();
  const [period, setPeriod] = useState<Period>("quarter");
  const [since, setSince] = useState(() => periodStart("quarter"));
  const { data } = useQuery({ ...successMetricsQuery(since), placeholderData: keepPreviousData });
  let body: ReactNode = <p className="text-muted-foreground">Working out the metrics…</p>;
  if (data !== undefined) {
    const { agentSuccess } = data;
    const kept = agentSuccess.turns === 0 ? null : agentSuccess.kept / agentSuccess.turns;
    body = (
      <>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Metric
            title="Time to launch"
            value={measured(
              data.timeToLaunch.median,
              (days) => `${oneDecimal.format(days)} business days`,
            )}
            over={`Site created to first publish, median of ${plural(data.timeToLaunch.sites, "site")}.`}
            target="10 business days or less"
            standing={against(data.timeToLaunch.median, (days) => days <= 10)}
          />
          <Metric
            title="Time to change"
            value={measured(
              data.timeToChange.median,
              (minutes) => `${oneDecimal.format(minutes)} minutes`,
            )}
            over={`Draft started to submitted, median of ${plural(data.timeToChange.drafts, "draft")}.`}
            target="15 minutes or less"
            standing={against(data.timeToChange.median, (minutes) => minutes <= 15)}
          />
          <Metric
            title="Approval turnaround"
            value={measured(
              data.approvalTurnaround.median,
              (days) => `${oneDecimal.format(days)} business days`,
            )}
            over={`Submitted to final decision, median of ${plural(data.approvalTurnaround.submissions, "submission")}.`}
            target="1 business day or less"
            standing={against(data.approvalTurnaround.median, (days) => days <= 1)}
          />
          <Metric
            title="Agent success"
            value={measured(kept, (share) => `${Math.round(share * 100)}%`)}
            over={`Pakshi's turns that changed a draft and weren't undone: ${agentSuccess.kept} of ${agentSuccess.turns}.`}
            target="75% or more"
            standing={against(kept, (share) => share >= 0.75)}
          />
          <Metric
            title="Untracked changes"
            value={String(data.untrackedChanges)}
            over="Times a site served something no publish or rollback made."
            target="0"
            standing={data.untrackedChanges === 0 ? "met" : "missed"}
          />
        </div>
        <BlockRequests months={data.blockRequests} />
      </>
    );
  }
  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-2 bg-accent px-10 pt-6 pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Metrics</h1>
        <p className="text-secondary-foreground">
          Whether Pakshi lets your teams launch and change sites quickly and safely, measured from
          what they do in Studio.
        </p>
      </header>
      <div className="flex flex-col gap-6 px-10 py-8">
        <Field className="w-56">
          <FieldLabel htmlFor={periodId}>Period</FieldLabel>
          <NativeSelect
            id={periodId}
            className="w-full"
            value={period}
            onChange={(event) => {
              if (!isPeriod(event.target.value)) return;
              setPeriod(event.target.value);
              setSince(periodStart(event.target.value));
            }}
          >
            {Object.entries(periods).map(([value, { title }]) => (
              <NativeSelectOption key={value} value={value}>
                {title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        {body}
      </div>
    </AppShell>
  );
}
