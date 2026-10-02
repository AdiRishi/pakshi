import type { SiteId } from "@repo/contracts/ids";
import {
  Hostname,
  type SiteDomain,
  type SiteDomainsView,
  type Viewer,
} from "@repo/contracts/studio";
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
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Option, Schema } from "effect";
import { CopyIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { formatMoment } from "@/lib/dates";

import { addDomain, checkDomains, getSiteDomains, removeDomain } from "../sites/functions";
import { siteOverviewQuery } from "../sites/queries";
import { SettingsShell } from "./settings-shell";

export const siteDomainsQuery = (site: SiteId) =>
  queryOptions({
    queryKey: ["sites", site, "domains"],
    queryFn: () => getSiteDomains({ data: { site } }),
  });

const decodeHostname = Schema.decodeOption(Hostname);

/**
 * Keeps a domains view the server sent, so the page shows it without asking
 * again, and has the overview above it look again for the site's address.
 */
const useSaved = (site: SiteId) => {
  const queryClient = useQueryClient();
  return (view: SiteDomainsView) => {
    queryClient.setQueryData(siteDomainsQuery(site).queryKey, view);
    return queryClient.invalidateQueries({ queryKey: siteOverviewQuery(site).queryKey });
  };
};

function AddDomainDialog(props: { readonly site: SiteId }) {
  const id = useId();
  const saved = useSaved(props.site);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [tried, setTried] = useState(false);
  const decoded = decodeHostname(typed);
  const add = useMutation({
    mutationFn: (hostname: Hostname) => addDomain({ data: { site: props.site, hostname } }),
    onSuccess: (view) => {
      setOpen(false);
      setTyped("");
      setTried(false);
      return saved(view);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>Add domain</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a domain</DialogTitle>
          <DialogDescription>
            Once its DNS records are in place, Pakshi connects it and turns on HTTPS. It doesn't
            need approval.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            setTried(true);
            if (Option.isSome(decoded)) add.mutate(decoded.value);
          }}
        >
          <Field data-invalid={(tried && Option.isNone(decoded)) || undefined}>
            <FieldLabel htmlFor={id}>Domain</FieldLabel>
            <Input
              id={id}
              value={typed}
              placeholder="www.example.org"
              spellCheck={false}
              aria-invalid={(tried && Option.isNone(decoded)) || undefined}
              onChange={(event) => setTyped(event.target.value)}
            />
            <FieldDescription>
              Start with a word, such as www. Your DNS provider can send the plain domain there.
            </FieldDescription>
            {tried && Option.isNone(decoded) && (
              <FieldError>
                Enter an address with a word before the domain, such as www.example.org.
              </FieldError>
            )}
            {add.error !== null && <FieldError>{add.error.message}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              Add domain
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CopyButton(props: { readonly value: string; readonly label: string }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={`Copy ${props.label}`}
      onClick={() =>
        void navigator.clipboard.writeText(props.value).then(() => toast.success("Copied"))
      }
    >
      <CopyIcon />
    </Button>
  );
}

/** What someone does to connect a waiting domain: its records, and checking for them. */
function FinishConnecting(props: {
  readonly site: SiteId;
  readonly domain: SiteDomain;
  readonly editable: boolean;
}) {
  const saved = useSaved(props.site);
  const check = useMutation({
    mutationFn: () => checkDomains({ data: { site: props.site } }),
    onSuccess: (view) => {
      const now = view.domains.find((domain) => domain.hostname === props.domain.hostname);
      if (now?.status === "active") toast.success(`${props.domain.hostname} is connected`);
      else
        toast.info("Not yet", {
          description: "The records aren't there yet. DNS can take a while.",
        });
      return saved(view);
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>Finish connecting {props.domain.hostname}</h3>
        </CardTitle>
        <CardDescription>
          Add these records where the domain's DNS is managed. Your IT team or domain company can
          help. The TXT record proves you own the address, and works only for this request.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.domain.records.map((record) => (
              <TableRow key={record.type}>
                <TableCell className="font-medium">{record.type}</TableCell>
                <TableCell className="font-mono text-sm">
                  {record.name}
                  <CopyButton value={record.name} label={`the ${record.type} name`} />
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {record.value}
                  <CopyButton value={record.value} label={`the ${record.type} value`} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center gap-3">
          <p className="grow text-sm text-muted-foreground">
            Pakshi checks every few minutes
            {props.domain.checkedAt === null
              ? "."
              : `, and last checked at ${formatMoment(props.domain.checkedAt)}.`}
          </p>
          {props.editable && (
            <Button variant="outline" disabled={check.isPending} onClick={() => check.mutate()}>
              Check now
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** Where visitors find a site: its Pakshi address, and its own domains. */
export function DomainsPage(props: { readonly viewer: Viewer; readonly site: SiteId }) {
  const { data } = useSuspenseQuery(siteDomainsQuery(props.site));
  const saved = useSaved(props.site);
  const [removing, setRemoving] = useState<SiteDomain | null>(null);
  const remove = useMutation({
    mutationFn: (hostname: string) => removeDomain({ data: { site: props.site, hostname } }),
    onSuccess: (view) => {
      setRemoving(null);
      return saved(view);
    },
    onError: (error) => toast.error(error.message),
  });
  const waiting = data.domains.filter((domain) => domain.status === "pending");
  return (
    <SettingsShell
      viewer={props.viewer}
      site={data.site}
      page="domains"
      title="Domains"
      description="Where visitors find this site. Domain changes take effect at once and don't need approval."
      actions={data.can.edit && <AddDomainDialog site={props.site} />}
    >
      <Card className="gap-0 py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6">Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-0 px-6">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.domains.map((domain) => (
                <TableRow key={domain.hostname}>
                  <TableCell className="px-6">
                    <div className="flex flex-col">
                      <span className="font-medium">{domain.hostname}</span>
                      <span className="text-xs text-muted-foreground">
                        Added {formatMoment(domain.addedAt)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {domain.status === "active" ? (
                      <Badge variant="secondary">Active</Badge>
                    ) : (
                      <Badge variant="warning">Waiting for DNS</Badge>
                    )}
                  </TableCell>
                  <TableCell className="px-6">
                    {data.can.edit && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${domain.hostname}`}
                        onClick={() => setRemoving(domain)}
                      >
                        <Trash2Icon />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {data.platform !== null && (
                <TableRow>
                  <TableCell className="px-6">
                    <div className="flex flex-col">
                      <span className="font-medium">{data.platform}</span>
                      <span className="text-xs text-muted-foreground">
                        Pakshi address. Always works, even alongside your own.
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">Active</Badge>
                  </TableCell>
                  <TableCell className="px-6" />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {waiting.map((domain) => (
        <FinishConnecting
          key={domain.hostname}
          site={props.site}
          domain={domain}
          editable={data.can.edit}
        />
      ))}
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="font-medium">Why www and not the plain domain?</dt>
          <dd className="text-muted-foreground">
            Pakshi connects addresses that start with a word, like www. Your DNS provider sends the
            plain address there.
          </dd>
        </div>
        <div>
          <dt className="font-medium">One site per address</dt>
          <dd className="text-muted-foreground">
            A domain belongs to one site. To move it, remove it from the other site first.
          </dd>
        </div>
      </dl>
      {removing !== null && (
        <AlertDialog open onOpenChange={(open) => !open && setRemoving(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {removing.hostname}?</AlertDialogTitle>
              <AlertDialogDescription>
                It stops showing this site at once. You can add it again later, with new records.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate(removing.hostname)}
              >
                Remove domain
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </SettingsShell>
  );
}
