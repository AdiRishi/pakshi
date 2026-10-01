import { EmailAddress } from "@repo/contracts/email";
import type { FormId, SiteId } from "@repo/contracts/ids";
import type { SiteForm, SiteSettingsView, Viewer } from "@repo/contracts/studio";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/components/empty";
import { FieldError } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Equal, Option, Schema } from "effect";
import { XIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { saveSiteSettings } from "../sites/functions";
import { siteSettingsQuery } from "../sites/queries";
import { SettingsShell } from "./settings-shell";

const decodeEmail = Schema.decodeOption(EmailAddress);

type FormEmails = SiteSettingsView["settings"]["formEmails"];

/** Where a form is, in a few words. */
const whereOf = (form: SiteForm) =>
  form.pages.length === 0
    ? "Not on any page"
    : `On ${new Intl.ListFormat("en", { type: "conjunction" }).format(form.pages)}`;

/** Where each form's new entries are emailed, which takes effect as soon as it's saved. */
export function FormsSettingsPage(props: { readonly viewer: Viewer; readonly site: SiteId }) {
  const { data } = useSuspenseQuery(siteSettingsQuery(props.site));
  return <FormsSettings key={data.revision} viewer={props.viewer} view={data} />;
}

function FormsSettings(props: { readonly viewer: Viewer; readonly view: SiteSettingsView }) {
  const { view } = props;
  const queryClient = useQueryClient();
  const [emails, setEmails] = useState<FormEmails>(view.settings.formEmails);
  const save = useMutation({
    mutationFn: () =>
      saveSiteSettings({
        data: { site: view.site.id, changes: { formEmails: emails }, seen: view.revision },
      }),
    onSuccess: (saved) => {
      queryClient.setQueryData(siteSettingsQuery(view.site.id).queryKey, saved);
      toast.success("Settings saved", { description: "New entries go to these addresses now." });
    },
    onError: (error) => toast.error(error.message),
  });
  const changed = !Equal.equals(emails, view.settings.formEmails);
  const setFor = (form: FormId, addresses: ReadonlyArray<EmailAddress>) =>
    setEmails((current) => ({ ...current, [form]: addresses }));
  return (
    <SettingsShell
      viewer={props.viewer}
      site={view.site}
      page="forms"
      title="Forms and email"
      description="Settings aren't part of any draft. Addresses take effect as soon as you save."
      actions={
        view.can.edit && (
          <Button disabled={!changed || save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        )
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <h3>New entry emails</h3>
          </CardTitle>
          <CardDescription>
            Pakshi emails these addresses about each new entry, with a link to read it in Studio.
            Forms don't send email to the people who fill them in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {view.forms.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No forms yet</EmptyTitle>
                <EmptyDescription>
                  Add a form to a page in a draft, then choose here who hears about its entries.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="flex flex-col divide-y">
              {view.forms.map((form) => (
                <FormAddresses
                  key={form.id}
                  form={form}
                  addresses={emails[form.id] ?? []}
                  editable={view.can.edit}
                  onChange={(addresses) => setFor(form.id, addresses)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        To add a form or change its fields, edit its page in a draft. Changes go live when the draft
        publishes.{" "}
        <Link
          to="/sites/$siteId"
          params={{ siteId: view.site.id }}
          className="font-medium underline underline-offset-4"
        >
          Open Drafts
        </Link>
      </p>
    </SettingsShell>
  );
}

function FormAddresses(props: {
  readonly form: SiteForm;
  readonly addresses: ReadonlyArray<EmailAddress>;
  readonly editable: boolean;
  readonly onChange: (addresses: ReadonlyArray<EmailAddress>) => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState("");
  const [invalid, setInvalid] = useState(false);
  const { form, addresses } = props;
  const add = () => {
    const email = decodeEmail(typed);
    if (Option.isNone(email)) return setInvalid(true);
    if (!addresses.includes(email.value)) props.onChange([...addresses, email.value]);
    setTyped("");
    setInvalid(false);
  };
  return (
    <li className="grid gap-4 py-4 sm:grid-cols-[14rem_1fr]">
      <div className="flex flex-col gap-1">
        <span className="font-medium">{form.name}</span>
        <span className="text-sm text-muted-foreground">{whereOf(form)}</span>
        {!form.live && (
          <Badge variant="outline" className="self-start">
            Only in drafts
          </Badge>
        )}
      </div>
      <div className="flex flex-col gap-2">
        {addresses.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No one yet. A page with this form can't be published until someone is.
          </p>
        )}
        <ul aria-label={`Addresses for ${form.name}`} className="flex flex-wrap gap-2">
          {addresses.map((address) => (
            <li key={address}>
              <Badge variant="secondary" className="gap-1 pr-1">
                {address}
                {props.editable && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Stop emailing ${address} about ${form.name}`}
                    onClick={() =>
                      props.onChange(addresses.filter((current) => current !== address))
                    }
                  >
                    <XIcon />
                  </Button>
                )}
              </Badge>
            </li>
          ))}
        </ul>
        {props.editable && (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              add();
            }}
          >
            <label htmlFor={id} className="sr-only">
              Add an email address for {form.name}
            </label>
            <Input
              id={id}
              type="email"
              placeholder="Add an email address"
              value={typed}
              aria-invalid={invalid || undefined}
              onChange={(event) => {
                setTyped(event.target.value);
                setInvalid(false);
              }}
            />
            <Button type="submit" variant="outline">
              Add
            </Button>
          </form>
        )}
        {invalid && <FieldError>Enter an email address.</FieldError>}
      </div>
    </li>
  );
}
