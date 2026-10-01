import {
  type CustomRole,
  Permission,
  permissionDetails,
  permissionGroups,
  type Role,
  RoleName,
} from "@repo/contracts/access";
import type { CustomRoleId } from "@repo/contracts/ids";
import type { RolesView, Viewer } from "@repo/contracts/studio";
import { isDefaultRole } from "@repo/domain/access";
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
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@repo/ui/components/card";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Option, Schema } from "effect";
import { CopyIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { describeScope } from "@/features/accounts/describe";

import { deleteRole, saveRole } from "./functions";
import { rolesQuery } from "./queries";

type Summary = RolesView["roles"][number];

/** A role being written: one that exists, or a new one that doesn't yet. */
interface Draft {
  readonly id: CustomRoleId | null;
  readonly name: string;
  readonly description: string;
  readonly permissions: ReadonlySet<Permission>;
}

const draftOf = (role: Role, id: CustomRoleId | null): Draft => ({
  id,
  name: role.name,
  description: role.description,
  permissions: new Set(role.permissions),
});

const decodeName = Schema.decodeUnknownOption(RoleName);

const sameDraft = (a: Draft, b: Draft) =>
  a.name === b.name &&
  a.description === b.description &&
  a.permissions.size === b.permissions.size &&
  Array.from(a.permissions).every((permission) => b.permissions.has(permission));

/** The roles, default then custom, to choose one from. */
function RoleList(props: {
  readonly roles: ReadonlyArray<Summary>;
  readonly chosen: string | null;
  readonly onChoose: (role: Summary) => void;
}) {
  const groups = [
    { title: "Default roles", roles: props.roles.filter((role) => isDefaultRole(role.role.id)) },
    { title: "Custom roles", roles: props.roles.filter((role) => !isDefaultRole(role.role.id)) },
  ];
  return (
    <nav aria-label="Roles" className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{group.title}</h2>
          {group.roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {group.roles.map((summary) => (
                <li key={summary.role.id}>
                  <Button
                    variant="ghost"
                    className="h-auto w-full justify-between py-2 aria-[current=true]:bg-accent"
                    aria-current={props.chosen === summary.role.id}
                    onClick={() => props.onChoose(summary)}
                  >
                    <span className="flex flex-col items-start">
                      <span className="font-medium">{summary.role.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {summary.holders.length === 1
                          ? "1 person"
                          : `${summary.holders.length} people`}
                      </span>
                    </span>
                    <Badge variant="outline">
                      {isDefaultRole(summary.role.id) ? "Default" : "Custom"}
                    </Badge>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
      <p className="text-sm text-muted-foreground">
        Default roles can't be changed. To change one, copy it and change the copy.
      </p>
    </nav>
  );
}

/** The permissions a role holds, grouped by area, as checkboxes when it can be changed. */
function Permissions(props: {
  readonly held: ReadonlySet<Permission>;
  /** The permissions the person may put in a role, or null when the role can't be changed. */
  readonly editable: ReadonlySet<Permission> | null;
  readonly onChange: (held: ReadonlySet<Permission>) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {permissionGroups.map((group) => (
        <FieldSet key={group}>
          <FieldLegend variant="label">{group}</FieldLegend>
          <FieldGroup className="gap-3">
            {Permission.literals
              .filter((permission) => permissionDetails[permission].group === group)
              .map((permission) => {
                const details = permissionDetails[permission];
                const disabled = props.editable === null || !props.editable.has(permission);
                return (
                  <Field
                    key={permission}
                    orientation="horizontal"
                    data-disabled={disabled || undefined}
                  >
                    <Checkbox
                      id={`${id}-${permission}`}
                      checked={props.held.has(permission)}
                      disabled={disabled}
                      onCheckedChange={(checked) => {
                        const next = new Set(props.held);
                        if (checked) next.add(permission);
                        else next.delete(permission);
                        props.onChange(next);
                      }}
                    />
                    <FieldContent>
                      <FieldLabel htmlFor={`${id}-${permission}`} className="font-medium">
                        {details.title}
                      </FieldLabel>
                      <FieldDescription>{details.description}</FieldDescription>
                    </FieldContent>
                  </Field>
                );
              })}
          </FieldGroup>
        </FieldSet>
      ))}
    </div>
  );
}

/** One role: its name, who holds it, and its permissions, which a custom role can change. */
function RoleDetail(props: {
  readonly view: RolesView;
  readonly summary: Summary | null;
  readonly draft: Draft;
  readonly onDraft: (draft: Draft) => void;
  readonly onCopy: () => void;
  readonly onSaved: (role: CustomRole) => void;
  readonly onDeleted: () => void;
}) {
  const ids = { name: useId(), description: useId() };
  const [deleting, setDeleting] = useState(false);
  const [tried, setTried] = useState(false);
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: rolesQuery.queryKey });
  const save = useMutation({
    mutationFn: saveRole,
    onSuccess: (role) => {
      toast.success(props.draft.id === null ? "Role created" : "Role saved");
      setTried(false);
      props.onSaved(role);
      return refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      toast.success("Role deleted");
      props.onDeleted();
      return refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const { draft, summary } = props;
  const custom = draft.id !== null || summary === null;
  const editable = custom && props.view.can.manage ? new Set(props.view.permissions) : null;
  const saved = summary === null ? null : draftOf(summary.role, draft.id);
  const changed = saved === null || !sameDraft(saved, draft);
  const name = decodeName(draft.name);
  const nameProblem = tried && Option.isNone(name) ? "Give the role a name" : null;
  const holders = summary?.holders ?? [];
  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-wrap items-center gap-3">
        <CardTitle className="flex items-center gap-2 text-xl">
          <h2>{summary === null ? "New role" : summary.role.name}</h2>
          <Badge variant="outline">{custom ? "Custom" : "Default"}</Badge>
        </CardTitle>
        {props.view.can.manage && (
          <div className="ml-auto flex gap-2">
            {summary !== null && (
              <Button variant="outline" onClick={props.onCopy}>
                <CopyIcon />
                Copy role
              </Button>
            )}
            {summary !== null && draft.id !== null && (
              <Button variant="outline" onClick={() => setDeleting(true)}>
                <Trash2Icon />
                Delete role
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {editable === null ? (
          <p className="text-muted-foreground">{draft.description}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
            <Field data-invalid={nameProblem !== null || undefined}>
              <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
              <Input
                id={ids.name}
                value={draft.name}
                maxLength={40}
                aria-invalid={nameProblem !== null || undefined}
                onChange={(event) => props.onDraft({ ...draft, name: event.target.value })}
              />
              <FieldError errors={nameProblem === null ? [] : [{ message: nameProblem }]} />
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.description}>Description</FieldLabel>
              <Input
                id={ids.description}
                value={draft.description}
                maxLength={200}
                onChange={(event) => props.onDraft({ ...draft, description: event.target.value })}
              />
            </Field>
          </div>
        )}
        {summary !== null && (
          <p className="text-sm text-muted-foreground">
            {holders.length === 0
              ? "No one has this role."
              : `${holders.length === 1 ? "1 person has" : `${holders.length} people have`} this role: ${holders
                  .map((holder) => `${holder.person.name}, ${describeScope(holder.scope)}`)
                  .join("; ")}.`}{" "}
            {holders.length > 0 && <Link to="/people">See them in People</Link>}
          </p>
        )}
        <Permissions
          held={draft.permissions}
          editable={editable}
          onChange={(permissions) => props.onDraft({ ...draft, permissions })}
        />
        {editable !== null && props.view.permissions.length < Permission.literals.length && (
          <p className="text-sm text-muted-foreground">
            You can put in a role only the permissions you hold across the organization.
          </p>
        )}
      </CardContent>
      {editable !== null && (
        <CardFooter className="flex flex-wrap items-center gap-3 border-t">
          <p className="grow text-sm text-muted-foreground" aria-live="polite">
            {!changed
              ? "Saved."
              : holders.length > 0
                ? "Not saved. Everyone with this role gets the change as soon as you save."
                : "Not saved."}
          </p>
          {saved !== null && (
            <Button variant="outline" disabled={!changed} onClick={() => props.onDraft(saved)}>
              Discard
            </Button>
          )}
          <Button
            disabled={!changed || save.isPending}
            onClick={() => {
              setTried(true);
              if (Option.isSome(name))
                save.mutate({
                  data: {
                    role: draft.id,
                    name: name.value,
                    description: draft.description.trim(),
                    permissions: Array.from(draft.permissions),
                  },
                });
            }}
          >
            {draft.id === null ? "Create role" : "Save"}
          </Button>
        </CardFooter>
      )}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the role {draft.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A role can be deleted only when no one holds it and no approval workflow names it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (draft.id !== null) remove.mutate({ data: { role: draft.id } });
              }}
            >
              Delete role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/** A custom role's ID, or null for a default role. */
const customId = (summary: Summary): CustomRoleId | null =>
  isDefaultRole(summary.role.id) ? null : summary.role.id;

/** Every role and the permissions it holds, and custom roles to make and change. */
export function RolesPage(props: { readonly viewer: Viewer }) {
  const { data } = useSuspenseQuery(rolesQuery);
  const first = data.roles[0];
  const [chosen, setChosen] = useState<string | null>(first?.role.id ?? null);
  const summary = data.roles.find((role) => role.role.id === chosen) ?? null;
  const [draft, setDraft] = useState<Draft | null>(
    first === undefined ? null : draftOf(first.role, customId(first)),
  );
  const choose = (next: Summary) => {
    setChosen(next.role.id);
    setDraft(draftOf(next.role, customId(next)));
  };
  const start = (from: Summary | null) => {
    setChosen(null);
    setDraft({
      id: null,
      name: from === null ? "" : `${from.role.name} (copy)`,
      description: from?.role.description ?? "",
      permissions: new Set(
        (from?.role.permissions ?? []).filter((permission) =>
          data.permissions.includes(permission),
        ),
      ),
    });
  };
  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-2 bg-accent px-10 pt-6 pb-8">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">Roles</h1>
          {data.can.manage && (
            <Button className="ml-auto" variant="outline" onClick={() => start(null)}>
              <PlusIcon />
              New role
            </Button>
          )}
        </div>
        <p className="text-secondary-foreground">
          Permissions decide what a person can do. Roles bundle them for giving access quickly.
          People can give only the permissions they hold.
        </p>
      </header>
      <div className="grid items-start gap-8 px-10 py-8 lg:grid-cols-[16rem_1fr]">
        <RoleList roles={data.roles} chosen={chosen} onChoose={choose} />
        {draft !== null && (
          <RoleDetail
            key={chosen ?? "new"}
            view={data}
            summary={summary}
            draft={draft}
            onDraft={setDraft}
            onCopy={() => start(summary)}
            onSaved={(role) => {
              setChosen(role.id);
              setDraft(draftOf(role, role.id));
            }}
            onDeleted={() => {
              if (first !== undefined) choose(first);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
