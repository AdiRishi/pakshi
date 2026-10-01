import { EmailAddress } from "@repo/contracts/email";
import type { SiteId } from "@repo/contracts/ids";
import type { EntriesFrom } from "@repo/contracts/studio";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Option, Schema } from "effect";
import { useId, useState } from "react";
import { toast } from "sonner";

import { formatDay } from "@/lib/dates";

import { deleteEntriesFor, getEntriesFrom } from "./functions";

const decodeEmail = Schema.decodeOption(EmailAddress);

const entriesCount = (count: number) => (count === 1 ? "1 entry" : `${count} entries`);

/**
 * Finds every entry someone sent from one email address, on any of the
 * site's forms, and deletes them all, for someone who asks for their data to go.
 */
export function DeletePersonDialog(props: {
  readonly site: { readonly id: SiteId; readonly name: string };
}) {
  const id = useId();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [found, setFound] = useState<{
    readonly email: EmailAddress;
    readonly forms: ReadonlyArray<EntriesFrom>;
  } | null>(null);
  const email = decodeEmail(typed);
  const find = useMutation({
    mutationFn: (address: EmailAddress) =>
      getEntriesFrom({ data: { site: props.site.id, email: address } }),
    onSuccess: (forms, address) => setFound({ email: address, forms }),
  });
  const remove = useMutation({
    mutationFn: (address: EmailAddress) =>
      deleteEntriesFor({ data: { site: props.site.id, email: address } }),
    onSuccess: async ({ deleted }) => {
      toast.success(`Deleted ${entriesCount(deleted)}`);
      await queryClient.invalidateQueries({ queryKey: ["sites", props.site.id, "entries"] });
      setOpen(false);
      setTyped("");
      setFound(null);
    },
    onError: (error) => toast.error(error.message),
  });
  const total = found?.forms.reduce((sum, form) => sum + form.entries, 0) ?? 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" />}>Delete a person's data</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete a person's data</DialogTitle>
          <DialogDescription>
            Use this when someone asks you to remove their details. It finds every entry sent from
            their email address on any form on {props.site.name}.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (Option.isSome(email)) find.mutate(email.value);
          }}
        >
          <Field>
            <FieldLabel htmlFor={id}>Their email address</FieldLabel>
            <div className="flex gap-2">
              <Input
                id={id}
                type="email"
                value={typed}
                onChange={(event) => {
                  setTyped(event.target.value);
                  setFound(null);
                }}
              />
              <Button type="submit" variant="outline" disabled={Option.isNone(email)}>
                Find entries
              </Button>
            </div>
            {find.error !== null && <FieldError>{find.error.message}</FieldError>}
          </Field>
        </form>
        {found !== null &&
          (total === 0 ? (
            <p className="text-sm text-muted-foreground">No entries came from {found.email}.</p>
          ) : (
            <>
              <p className="text-sm">
                Found {entriesCount(total)} from this address on{" "}
                {found.forms.length === 1 ? "1 form" : `${found.forms.length} forms`}.
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {found.forms.map((form) => (
                  <li key={form.form} className="flex justify-between gap-4">
                    <span className="font-medium">{form.name}</span>
                    <span className="text-muted-foreground">
                      {entriesCount(form.entries)},{" "}
                      {form.entries === 1
                        ? formatDay(form.latest)
                        : `${formatDay(form.first)} to ${formatDay(form.latest)}`}
                    </span>
                  </li>
                ))}
              </ul>
              <Alert variant="destructive">
                <AlertTitle>This can't be undone</AlertTitle>
                <AlertDescription>
                  The entries are removed for good, including from future exports.
                </AlertDescription>
              </Alert>
            </>
          ))}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={found === null || total === 0 || remove.isPending}
            onClick={() => found !== null && remove.mutate(found.email)}
          >
            Delete {entriesCount(total)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
