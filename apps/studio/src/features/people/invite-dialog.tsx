import type { RoleId } from "@repo/contracts/access";
import { scopeOf } from "@repo/contracts/accounts";
import { EmailAddress } from "@repo/contracts/email";
import type { AccessPlace, SentInvitation } from "@repo/contracts/studio";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Option, Schema } from "effect";
import { CheckIcon, CopyIcon } from "lucide-react";
import { useId, useState } from "react";

import { describeGrant, describeScope } from "@/features/accounts/describe";

import { invitePerson } from "./functions";
import { peopleQuery } from "./queries";

const decodeEmail = Schema.decodeOption(EmailAddress);

/** The role offered first: editing, the most common, where the person may give it. */
const firstRole = (place: AccessPlace | undefined): RoleId =>
  place?.roles.find((role) => role.id === "editor")?.id ?? place?.roles.at(-1)?.id ?? "editor";

/** The link an invitation sends, for the inviter to pass on another way too. */
function SentLink(props: { readonly sent: SentInvitation; readonly onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col gap-6">
      <DialogHeader>
        <DialogTitle>Invitation sent</DialogTitle>
        <DialogDescription>
          We emailed {props.sent.invitation.email} a link to join as{" "}
          {describeGrant(props.sent.invitation.role, props.sent.invitation.scope)}. You can also
          send them the link yourself.
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor={id}>Invitation link</FieldLabel>
        <div className="flex gap-2">
          <Input
            id={id}
            value={props.sent.link}
            readOnly
            onFocus={(event) => event.target.select()}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void navigator.clipboard.writeText(props.sent.link).then(() => setCopied(true))
            }
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <FieldDescription>It works once, for {props.sent.invitation.email} only.</FieldDescription>
      </Field>
      <DialogFooter>
        <Button type="button" onClick={props.onDone}>
          Done
        </Button>
      </DialogFooter>
    </div>
  );
}

/** Invites someone by email with a role somewhere the person may give it. */
export function InviteDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly places: ReadonlyArray<AccessPlace>;
}) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [placeIndex, setPlaceIndex] = useState(0);
  const place = props.places[placeIndex] ?? props.places[0];
  const [role, setRole] = useState<RoleId>(firstRole(place));
  const [touched, setTouched] = useState(false);
  const ids = { email: useId(), place: useId(), role: useId() };
  const mutation = useMutation({
    mutationFn: invitePerson,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: peopleQuery.queryKey }),
        queryClient.invalidateQueries({ queryKey: ["scope-members"] }),
      ]),
  });
  const address = decodeEmail(email);
  const shown = touched && Option.isNone(address);
  const close = (open: boolean) => {
    props.onOpenChange(open);
    if (!open) {
      mutation.reset();
      setEmail("");
      setTouched(false);
    }
  };
  return (
    <Dialog open={props.open} onOpenChange={close}>
      <DialogContent>
        {mutation.data !== undefined ? (
          <SentLink sent={mutation.data} onDone={() => close(false)} />
        ) : (
          <form
            noValidate
            className="flex flex-col gap-6"
            onSubmit={(event) => {
              event.preventDefault();
              setTouched(true);
              if (Option.isSome(address) && place !== undefined)
                mutation.mutate({
                  data: {
                    email: address.value,
                    role,
                    scope: scopeOf(place.scope),
                  },
                });
            }}
          >
            <DialogHeader>
              <DialogTitle>Invite someone</DialogTitle>
              <DialogDescription>
                They get an email with a link to join. You can give only roles whose permissions you
                hold there.
              </DialogDescription>
            </DialogHeader>
            <Field data-invalid={shown || undefined}>
              <FieldLabel htmlFor={ids.email}>Email</FieldLabel>
              <Input
                id={ids.email}
                type="email"
                value={email}
                required
                aria-invalid={shown || undefined}
                onChange={(event) => setEmail(event.target.value)}
                onBlur={() => setTouched(true)}
              />
              <FieldError errors={shown ? [{ message: "Enter an email address." }] : []} />
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.place}>Where</FieldLabel>
              <NativeSelect
                id={ids.place}
                className="w-full"
                value={String(placeIndex)}
                onChange={(event) => {
                  const index = Number(event.target.value);
                  setPlaceIndex(index);
                  const next = props.places[index];
                  if (!next?.roles.some((candidate) => candidate.id === role))
                    setRole(firstRole(next));
                }}
              >
                {props.places.map((candidate, index) => (
                  <NativeSelectOption
                    key={candidate.scope.kind === "organization" ? "org" : candidate.scope.id}
                    value={String(index)}
                  >
                    {describeScope(candidate.scope)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.role}>Role</FieldLabel>
              <NativeSelect
                id={ids.role}
                className="w-full"
                value={role}
                onChange={(event) => {
                  const chosen = place?.roles.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  if (chosen !== undefined) setRole(chosen.id);
                }}
              >
                {(place?.roles ?? []).map((candidate) => (
                  <NativeSelectOption key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {mutation.error !== null && <FieldError>{mutation.error.message}</FieldError>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                Send invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
