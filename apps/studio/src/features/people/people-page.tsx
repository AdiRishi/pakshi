import type { Member, Viewer } from "@repo/contracts/studio";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Field, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { SearchIcon, UserPlusIcon } from "lucide-react";
import { useDeferredValue, useId, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { describeGrant } from "@/features/accounts/describe";
import { formatAgo, formatDay } from "@/lib/dates";
import { initials } from "@/lib/initials";

import { withdrawInvitation } from "./functions";
import { InviteDialog } from "./invite-dialog";
import { PersonSheet } from "./person-sheet";
import { peopleQuery } from "./queries";

const everyone = "";

/** Whether a member matches the search text and the role and brand chosen. */
const matches = (
  member: Member,
  filter: { readonly search: string; readonly role: string; readonly scope: string },
) => {
  const search = filter.search.toLowerCase();
  return (
    (search === "" ||
      member.person.name.toLowerCase().includes(search) ||
      member.person.email.toLowerCase().includes(search)) &&
    (filter.role === everyone || member.grants.some((grant) => grant.role.id === filter.role)) &&
    (filter.scope === everyone ||
      member.grants.some(
        (grant) => grant.scope.kind !== "organization" && grant.scope.id === filter.scope,
      ))
  );
};

/** Everyone who can use Studio, with what they hold, and the invitations still waiting. */
export function PeoplePage(props: { readonly viewer: Viewer }) {
  const { data } = useSuspenseQuery(peopleQuery);
  const [inviting, setInviting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [role, setRole] = useState(everyone);
  const [scope, setScope] = useState(everyone);
  const deferredSearch = useDeferredValue(search.trim());
  const ids = { search: useId(), role: useId(), scope: useId() };
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: withdrawInvitation,
    onSuccess: () => {
      toast.success("Invitation withdrawn");
      return queryClient.invalidateQueries({ queryKey: peopleQuery.queryKey });
    },
  });
  const roles = new Map(
    data.members.flatMap((member) =>
      member.grants.map((grant) => [grant.role.id, grant.role.name]),
    ),
  );
  const scopes = new Map(
    data.members.flatMap((member) =>
      member.grants.flatMap((grant) =>
        grant.scope.kind === "organization" ? [] : [[grant.scope.id, grant.scope.name] as const],
      ),
    ),
  );
  const shown = data.members.filter((member) =>
    matches(member, { search: deferredSearch, role, scope }),
  );
  const member = data.members.find((candidate) => candidate.person.id === open) ?? null;
  const invitable = data.places.filter((place) => place.roles.length > 0);
  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-2 bg-accent px-10 pt-6 pb-8">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">People</h1>
          {invitable.length > 0 && (
            <Button className="ml-auto" onClick={() => setInviting(true)}>
              <UserPlusIcon />
              Invite someone
            </Button>
          )}
        </div>
        <p className="text-secondary-foreground">
          Everyone who can use Studio at {props.viewer.organization}. People join when someone
          invites them, and you can change what anyone holds where you manage members.
        </p>
      </header>
      <div className="flex flex-col gap-10 px-10 py-8">
        <section aria-labelledby="members" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <Field className="w-72">
              <FieldLabel htmlFor={ids.search}>Search people</FieldLabel>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={ids.search}
                  type="search"
                  className="pl-8"
                  placeholder="Name or email"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
            </Field>
            <Field className="w-56">
              <FieldLabel htmlFor={ids.scope}>Brand or site</FieldLabel>
              <NativeSelect
                id={ids.scope}
                className="w-full"
                value={scope}
                onChange={(event) => setScope(event.target.value)}
              >
                <NativeSelectOption value={everyone}>All brands and sites</NativeSelectOption>
                {Array.from(scopes, ([id, name]) => (
                  <NativeSelectOption key={id} value={id}>
                    {name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field className="w-56">
              <FieldLabel htmlFor={ids.role}>Role</FieldLabel>
              <NativeSelect
                id={ids.role}
                className="w-full"
                value={role}
                onChange={(event) => setRole(event.target.value)}
              >
                <NativeSelectOption value={everyone}>All roles</NativeSelectOption>
                {Array.from(roles, ([id, name]) => (
                  <NativeSelectOption key={id} value={id}>
                    {name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <h2 id="members" className="ml-auto text-sm text-muted-foreground" aria-live="polite">
              {shown.length === 1 ? "1 person" : `${shown.length} people`}
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Access</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((member) => (
                <TableRow key={member.person.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback>{initials(member.person.name)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="font-medium">
                          {member.person.name}
                          {member.person.id === props.viewer.user.id && " (you)"}
                        </span>
                        <span className="text-muted-foreground">{member.person.email}</span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {member.grants.length === 0 && member.overrides.length === 0 ? (
                      <span className="text-muted-foreground">No access</span>
                    ) : (
                      <ul className="flex flex-wrap gap-2">
                        {member.grants.map((grant) => (
                          <li
                            key={`${grant.role.id}:${grant.scope.kind === "organization" ? "" : grant.scope.id}`}
                          >
                            <Badge variant="secondary">
                              {describeGrant(grant.role, grant.scope)}
                            </Badge>
                          </li>
                        ))}
                        {member.overrides.length > 0 && (
                          <li>
                            <Badge variant="outline">
                              {member.overrides.length === 1
                                ? "1 override"
                                : `${member.overrides.length} overrides`}
                            </Badge>
                          </li>
                        )}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.lastActive === null ? "Not yet" : formatAgo(member.lastActive)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" onClick={() => setOpen(member.person.id)}>
                      Manage
                      <span className="sr-only"> {member.person.name}'s access</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
        {data.invitations.length > 0 && (
          <section aria-labelledby="invitations" className="flex flex-col gap-3">
            <h2 id="invitations" className="text-lg font-semibold">
              Invited, not joined yet
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Invited by</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">{invitation.email}</TableCell>
                    <TableCell>{describeGrant(invitation.role, invitation.scope)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {invitation.invitedBy.name}, link works until{" "}
                      {formatDay(invitation.expiresAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={withdraw.isPending}
                        onClick={() => withdraw.mutate({ data: { invitation: invitation.id } })}
                      >
                        Withdraw
                        <span className="sr-only"> the invitation for {invitation.email}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}
      </div>
      <InviteDialog open={inviting} onOpenChange={setInviting} places={invitable} />
      <PersonSheet
        viewer={props.viewer}
        member={member}
        places={data.places}
        onClose={() => setOpen(null)}
      />
    </AppShell>
  );
}
