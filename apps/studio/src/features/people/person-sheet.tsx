import { type Permission, permissionDetails, type RoleId } from "@repo/contracts/access";
import { type NamedScope, scopeOf } from "@repo/contracts/accounts";
import type { AccessPlace, Member, Viewer } from "@repo/contracts/studio";
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
import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemTitle,
} from "@repo/ui/components/item";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { describeScope } from "@/features/accounts/describe";
import { formatAgo, formatDay } from "@/lib/dates";

import { grantRole, removeAllAccess, removeOverride, revokeRole, setOverride } from "./functions";
import { peopleQuery } from "./queries";

const scopeKey = (scope: NamedScope) => (scope.kind === "organization" ? "org" : scope.id);

/** Refreshes the people screen after a change, and says what went wrong when one fails. */
const useAccessChange = <A, R>(
  change: (input: { readonly data: A }) => Promise<R>,
  done: string,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: change,
    onSuccess: () => {
      toast.success(done);
      return queryClient.invalidateQueries({ queryKey: peopleQuery.queryKey });
    },
    onError: (error) => toast.error(error.message),
  });
};

/** Gives the person a role somewhere the viewer controls. */
function AddAccess(props: {
  readonly person: string;
  readonly places: ReadonlyArray<AccessPlace>;
  readonly onDone: () => void;
}) {
  const ids = { place: useId(), role: useId() };
  const [placeIndex, setPlaceIndex] = useState(0);
  const place = props.places[placeIndex];
  const [role, setRole] = useState<RoleId | undefined>(place?.roles[0]?.id);
  const grant = useAccessChange(grantRole, "Access added");
  return (
    <form
      className="flex flex-col gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (place !== undefined && role !== undefined)
          grant.mutate(
            { data: { person: props.person, role, scope: scopeOf(place.scope) } },
            { onSuccess: props.onDone },
          );
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={ids.place}>Where</FieldLabel>
          <NativeSelect
            id={ids.place}
            className="w-full"
            value={String(placeIndex)}
            onChange={(event) => {
              const index = Number(event.target.value);
              setPlaceIndex(index);
              setRole(props.places[index]?.roles[0]?.id);
            }}
          >
            {props.places.map((candidate, index) => (
              <NativeSelectOption key={scopeKey(candidate.scope)} value={String(index)}>
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
            value={role ?? ""}
            onChange={(event) =>
              setRole(place?.roles.find((candidate) => candidate.id === event.target.value)?.id)
            }
          >
            {(place?.roles ?? []).map((candidate) => (
              <NativeSelectOption key={candidate.id} value={candidate.id}>
                {candidate.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      </FieldGroup>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={props.onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={grant.isPending || role === undefined}>
          Add access
        </Button>
      </div>
    </form>
  );
}

/** Switches one permission on or off for the person somewhere the viewer controls. */
function AddOverride(props: {
  readonly person: string;
  readonly places: ReadonlyArray<AccessPlace>;
  readonly onDone: () => void;
}) {
  const ids = { place: useId(), permission: useId(), switch: useId() };
  const [placeIndex, setPlaceIndex] = useState(0);
  const place = props.places[placeIndex];
  const [permission, setPermission] = useState<Permission | undefined>(place?.permissions[0]);
  const [allowed, setAllowed] = useState(true);
  const set = useAccessChange(setOverride, "Override added");
  return (
    <form
      className="flex flex-col gap-4 rounded-lg border p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (place !== undefined && permission !== undefined)
          set.mutate(
            {
              data: { person: props.person, permission, scope: scopeOf(place.scope), allowed },
            },
            { onSuccess: props.onDone },
          );
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={ids.place}>Where</FieldLabel>
          <NativeSelect
            id={ids.place}
            className="w-full"
            value={String(placeIndex)}
            onChange={(event) => {
              const index = Number(event.target.value);
              setPlaceIndex(index);
              setPermission(props.places[index]?.permissions[0]);
            }}
          >
            {props.places.map((candidate, index) => (
              <NativeSelectOption key={scopeKey(candidate.scope)} value={String(index)}>
                {describeScope(candidate.scope)}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.permission}>Permission</FieldLabel>
          <NativeSelect
            id={ids.permission}
            className="w-full"
            value={permission ?? ""}
            onChange={(event) =>
              setPermission(
                place?.permissions.find((candidate) => candidate === event.target.value),
              )
            }
          >
            {(place?.permissions ?? []).map((candidate) => (
              <NativeSelectOption key={candidate} value={candidate}>
                {permissionDetails[candidate].title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field orientation="horizontal" className="justify-between">
          <FieldLabel id={ids.switch}>Switch it</FieldLabel>
          <ToggleGroup
            aria-labelledby={ids.switch}
            variant="outline"
            size="sm"
            spacing={0}
            value={[allowed ? "on" : "off"]}
            onValueChange={(values) => {
              const [chosen] = values;
              if (chosen !== undefined) setAllowed(chosen === "on");
            }}
          >
            <ToggleGroupItem value="on">On</ToggleGroupItem>
            <ToggleGroupItem value="off">Off</ToggleGroupItem>
          </ToggleGroup>
        </Field>
      </FieldGroup>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={props.onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={set.isPending || permission === undefined}>
          Add override
        </Button>
      </div>
    </form>
  );
}

/**
 * One person's access, in a panel beside the people list: the roles they
 * hold where, the overrides on top, and what the viewer may change.
 */
export function PersonSheet(props: {
  readonly viewer: Viewer;
  readonly member: Member | null;
  readonly places: ReadonlyArray<AccessPlace>;
  readonly onClose: () => void;
}) {
  const [adding, setAdding] = useState<"access" | "override" | null>(null);
  const [removingAll, setRemovingAll] = useState(false);
  const revoke = useAccessChange(revokeRole, "Access removed");
  const unset = useAccessChange(removeOverride, "Override removed");
  const removeAll = useAccessChange(removeAllAccess, "All access removed");
  const { member } = props;
  const self = member?.person.id === props.viewer.user.id;
  const grantable = props.places.filter((place) => place.roles.length > 0);
  const overridable = props.places.filter((place) => place.permissions.length > 0);
  const everythingRemovable =
    member !== null &&
    member.grants.length + member.overrides.length > 0 &&
    member.grants.every((grant) => grant.removable) &&
    member.overrides.every((override) => override.removable);
  return (
    <Sheet
      open={member !== null}
      onOpenChange={(open) => {
        if (!open) {
          setAdding(null);
          props.onClose();
        }
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {member !== null && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle>
                {member.person.name}
                {self && " (you)"}
              </SheetTitle>
              <SheetDescription>
                {member.person.email}.{" "}
                {member.lastActive === null
                  ? "Hasn't signed in yet."
                  : `Last active ${formatAgo(member.lastActive)}.`}
              </SheetDescription>
            </SheetHeader>
            <section aria-labelledby="person-access" className="flex flex-col gap-3 px-4">
              <div className="flex flex-col gap-1">
                <h3 id="person-access" className="font-semibold">
                  Access
                </h3>
                <p className="text-muted-foreground">
                  A role applies to the whole organization, a brand and all its sites, or one site.
                </p>
              </div>
              {member.grants.length === 0 ? (
                <p className="text-muted-foreground">
                  {member.person.name} holds no roles, so they can't work on anything in Studio.
                </p>
              ) : (
                <ItemGroup className="gap-2">
                  {member.grants.map((grant) => (
                    <Item key={`${grant.role.id}:${scopeKey(grant.scope)}`} variant="outline">
                      <ItemContent>
                        <ItemTitle>{grant.role.name}</ItemTitle>
                        <ItemDescription>{describeScope(grant.scope)}</ItemDescription>
                      </ItemContent>
                      {grant.removable && (
                        <ItemActions>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={revoke.isPending}
                            onClick={() =>
                              revoke.mutate({
                                data: {
                                  person: member.person.id,
                                  role: grant.role.id,
                                  scope: scopeOf(grant.scope),
                                },
                              })
                            }
                          >
                            Remove
                            <span className="sr-only">
                              {" "}
                              {grant.role.name}, {describeScope(grant.scope)}
                            </span>
                          </Button>
                        </ItemActions>
                      )}
                    </Item>
                  ))}
                </ItemGroup>
              )}
              {adding === "access" ? (
                <AddAccess
                  person={member.person.id}
                  places={grantable}
                  onDone={() => setAdding(null)}
                />
              ) : (
                grantable.length > 0 && (
                  <Button variant="outline" onClick={() => setAdding("access")}>
                    <PlusIcon />
                    Add access
                  </Button>
                )
              )}
              <p className="text-sm text-muted-foreground">
                You can give only permissions you hold, on places where you manage members.
              </p>
            </section>
            <section aria-labelledby="person-overrides" className="flex flex-col gap-3 px-4">
              <div className="flex flex-col gap-1">
                <h3 id="person-overrides" className="font-semibold">
                  Overrides
                </h3>
                <p className="text-muted-foreground">
                  An override switches one permission on or off for one person, and beats any role.
                </p>
              </div>
              {member.overrides.length > 0 && (
                <ItemGroup className="gap-2">
                  {member.overrides.map((override) => (
                    <Item
                      key={`${override.permission}:${scopeKey(override.scope)}`}
                      variant="outline"
                    >
                      <ItemContent>
                        <ItemTitle>{permissionDetails[override.permission].title}</ItemTitle>
                        <ItemDescription>
                          <Badge variant={override.allowed ? "secondary" : "outline"}>
                            Switched {override.allowed ? "on" : "off"}
                          </Badge>{" "}
                          {describeScope(override.scope)}
                        </ItemDescription>
                        {override.setBy !== null && override.setAt !== null && (
                          <ItemDescription>
                            Added by {override.setBy.name} on {formatDay(override.setAt)}
                          </ItemDescription>
                        )}
                      </ItemContent>
                      {override.removable && (
                        <ItemActions>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={unset.isPending}
                            onClick={() =>
                              unset.mutate({
                                data: {
                                  person: member.person.id,
                                  permission: override.permission,
                                  scope: scopeOf(override.scope),
                                },
                              })
                            }
                          >
                            Remove
                            <span className="sr-only">
                              {" "}
                              the override of {permissionDetails[override.permission].title}
                            </span>
                          </Button>
                        </ItemActions>
                      )}
                    </Item>
                  ))}
                </ItemGroup>
              )}
              {adding === "override" ? (
                <AddOverride
                  person={member.person.id}
                  places={overridable}
                  onDone={() => setAdding(null)}
                />
              ) : (
                overridable.length > 0 && (
                  <Button variant="outline" onClick={() => setAdding("override")}>
                    <PlusIcon />
                    Add override
                  </Button>
                )
              )}
            </section>
            {everythingRemovable && !self && (
              <section className="mt-auto flex flex-col gap-2 border-t p-4">
                <Button variant="destructive" onClick={() => setRemovingAll(true)}>
                  Remove all access
                </Button>
                <p className="text-sm text-muted-foreground">
                  {member.person.name} can't work on anything in Studio until someone gives them
                  access again.
                </p>
              </section>
            )}
            <AlertDialog open={removingAll} onOpenChange={setRemovingAll}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove all of {member.person.name}'s access?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Their roles and overrides go at once, and anything they have open in Studio
                    stops saving.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep their access</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => removeAll.mutate({ data: { person: member.person.id } })}
                  >
                    Remove all access
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
