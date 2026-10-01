import type { RoleId, RoleRef, Scope } from "@repo/contracts/access";
import type { Person, ScopeMembers } from "@repo/contracts/studio";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
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
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UserPlusIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { initials } from "@/lib/initials";

import { changeRole, grantRole, revokeRole } from "./functions";
import { InviteDialog } from "./invite-dialog";
import { PersonPicker } from "./person-picker";
import { scopeMembersQuery } from "./queries";

function PersonCell(props: { readonly person: Person; readonly self: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar className="size-8">
        <AvatarFallback>{initials(props.person.name)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col">
        <span className="font-medium">
          {props.person.name}
          {props.self && " (you)"}
        </span>
        <span className="text-muted-foreground">{props.person.email}</span>
      </div>
    </div>
  );
}

/** Gives someone already in the organization a role here. */
function AddMember(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly scope: Scope;
  readonly name: string;
  readonly roles: ReadonlyArray<RoleRef>;
  readonly exclude: ReadonlyArray<string>;
}) {
  const roleId = useId();
  const [person, setPerson] = useState<Person | null>(null);
  const [role, setRole] = useState<RoleId | undefined>(props.roles[0]?.id);
  const queryClient = useQueryClient();
  const grant = useMutation({
    mutationFn: grantRole,
    onSuccess: () => {
      toast.success(`${person?.name ?? "They"} can now work on ${props.name}`);
      props.onOpenChange(false);
      setPerson(null);
      return queryClient.invalidateQueries({ queryKey: scopeMembersQuery(props.scope).queryKey });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add someone to {props.name}</DialogTitle>
          <DialogDescription>
            Choose someone already in the organization. To add someone new, invite them instead.
          </DialogDescription>
        </DialogHeader>
        {person === null ? (
          <PersonPicker label="Find a person" exclude={props.exclude} onPick={setPerson} />
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <PersonCell person={person} self={false} />
            <Button variant="ghost" size="sm" onClick={() => setPerson(null)}>
              Change
            </Button>
          </div>
        )}
        <Field>
          <FieldLabel htmlFor={roleId}>Role</FieldLabel>
          <NativeSelect
            id={roleId}
            className="w-full"
            value={role ?? ""}
            onChange={(event) =>
              setRole(props.roles.find((candidate) => candidate.id === event.target.value)?.id)
            }
          >
            {props.roles.map((candidate) => (
              <NativeSelectOption key={candidate.id} value={candidate.id}>
                {candidate.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => props.onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={person === null || role === undefined || grant.isPending}
            onClick={() => {
              if (person !== null && role !== undefined)
                grant.mutate({ data: { person: person.id, role, scope: props.scope } });
            }}
          >
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Where an inherited role is managed: its brand's members, or the people screen. */
function ManageLink(props: { readonly from: ScopeMembers["inherited"][number]["from"] }) {
  const { from } = props;
  return from.kind === "brand" ? (
    <Link
      to="/brands/$brandId/members"
      params={{ brandId: from.id }}
      className={buttonVariants({ variant: "link", size: "sm" })}
    >
      Manage in {from.name}
    </Link>
  ) : (
    <Link to="/people" className={buttonVariants({ variant: "link", size: "sm" })}>
      Manage in People
    </Link>
  );
}

/**
 * Who can work on a brand or a site: the roles given here, which can be
 * changed or taken away, and those that reach it from a brand or the
 * organization.
 */
export function MembersPanel(props: { readonly scope: Scope; readonly viewer: Person }) {
  const { data } = useSuspenseQuery(scopeMembersQuery(props.scope));
  const [adding, setAdding] = useState(false);
  const [inviting, setInviting] = useState(false);
  const queryClient = useQueryClient();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: scopeMembersQuery(props.scope).queryKey });
  const change = useMutation({
    mutationFn: changeRole,
    onSuccess: () => {
      toast.success("Role changed");
      return refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const revoke = useMutation({
    mutationFn: revokeRole,
    onSuccess: () => {
      toast.success("Removed");
      return refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const manages = data.roles.length > 0;
  const here = data.scope.kind === "site" ? "this site" : "this brand and its sites";
  return (
    <div className="flex flex-col gap-8">
      {manages && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setAdding(true)}>
            <UserPlusIcon />
            Add someone
          </Button>
          <Button variant="outline" onClick={() => setInviting(true)}>
            Invite by email
          </Button>
        </div>
      )}
      <section aria-labelledby="members-here" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 id="members-here" className="text-lg font-semibold">
            Added to {here}
          </h3>
          <p className="text-sm text-muted-foreground">
            {manages
              ? "Change their role or remove them here. Changes take effect at once."
              : "Only people who manage members here can change these."}
          </p>
        </div>
        {data.direct.length === 0 ? (
          <p className="text-muted-foreground">No one has a role on {here} alone yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.direct.map((member) => {
                const choices = data.roles.some((role) => role.id === member.role.id)
                  ? data.roles
                  : [member.role, ...data.roles];
                return (
                  <TableRow key={`${member.person.id}:${member.role.id}`}>
                    <TableCell>
                      <PersonCell
                        person={member.person}
                        self={member.person.id === props.viewer.id}
                      />
                    </TableCell>
                    <TableCell>
                      {member.removable && manages ? (
                        <NativeSelect
                          aria-label={`Role for ${member.person.name}`}
                          value={member.role.id}
                          disabled={change.isPending}
                          onChange={(event) => {
                            const to = data.roles.find((role) => role.id === event.target.value);
                            if (to !== undefined)
                              change.mutate({
                                data: {
                                  person: member.person.id,
                                  from: member.role.id,
                                  to: to.id,
                                  scope: props.scope,
                                },
                              });
                          }}
                        >
                          {choices.map((role) => (
                            <NativeSelectOption key={role.id} value={role.id}>
                              {role.name}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      ) : (
                        <Badge variant="secondary">{member.role.name}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {member.removable && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={revoke.isPending}
                          onClick={() =>
                            revoke.mutate({
                              data: {
                                person: member.person.id,
                                role: member.role.id,
                                scope: props.scope,
                              },
                            })
                          }
                        >
                          Remove
                          <span className="sr-only"> {member.person.name}</span>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
      {data.inherited.length > 0 && (
        <section aria-labelledby="members-above" className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 id="members-above" className="text-lg font-semibold">
              From {data.scope.kind === "site" ? "its brand or " : ""}the organization
            </h3>
            <p className="text-sm text-muted-foreground">
              They have this access in more places, so change it where it was given.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>
                  <span className="sr-only">Where it's managed</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.inherited.map((member) => (
                <TableRow
                  key={`${member.person.id}:${member.role.id}:${member.from.kind === "organization" ? "" : member.from.id}`}
                >
                  <TableCell>
                    <PersonCell
                      person={member.person}
                      self={member.person.id === props.viewer.id}
                    />
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-col">
                      <span>{member.role.name}</span>
                      <span className="text-xs text-muted-foreground">From {member.from.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <ManageLink from={member.from} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
      <p className="text-sm text-muted-foreground">
        You can give only permissions you hold.{" "}
        <Link to="/roles" className="text-foreground underline underline-offset-4">
          What each role can do
        </Link>
      </p>
      <AddMember
        open={adding}
        onOpenChange={setAdding}
        scope={props.scope}
        name={data.scope.name}
        roles={data.roles}
        exclude={data.direct.map((member) => member.person.id)}
      />
      <InviteDialog
        open={inviting}
        onOpenChange={setInviting}
        places={[{ scope: data.scope, roles: data.roles, permissions: [] }]}
      />
    </div>
  );
}
