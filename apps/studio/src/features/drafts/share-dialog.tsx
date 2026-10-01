import type { DraftId, SiteId } from "@repo/contracts/ids";
import type { Audience, DraftSharing, ShareAccess } from "@repo/contracts/sharing";
import { Avatar, AvatarFallback } from "@repo/ui/components/avatar";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { FieldError } from "@repo/ui/components/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@repo/ui/components/input-group";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, CopyIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { previewPath } from "@/features/preview/address";
import { initials } from "@/lib/initials";

import { PersonPicker } from "../people/person-picker";
import { getOrganization } from "../session/functions";
import { getDraftSharing, shareDraft } from "../sites/functions";

const sharingQuery = (site: SiteId, draft: DraftId) =>
  queryOptions({
    queryKey: ["sites", site, "drafts", draft, "sharing"],
    queryFn: () => getDraftSharing({ data: { site, draft } }),
  });

const organizationQuery = queryOptions({
  queryKey: ["organization"],
  queryFn: () => getOrganization(),
  staleTime: Number.POSITIVE_INFINITY,
});

function AccessSelect(props: {
  readonly label: string;
  readonly value: ShareAccess;
  readonly disabled: boolean;
  readonly onChange: (access: ShareAccess) => void;
}) {
  return (
    <NativeSelect
      size="sm"
      aria-label={props.label}
      value={props.value}
      disabled={props.disabled}
      onChange={(event) => props.onChange(event.target.value === "edit" ? "edit" : "view")}
    >
      <NativeSelectOption value="view">Can view</NativeSelectOption>
      <NativeSelectOption value="edit">Can edit</NativeSelectOption>
    </NativeSelect>
  );
}

/** The link to copy, and a button that copies it and says so. */
function PreviewLink(props: { readonly site: SiteId; readonly draft: DraftId }) {
  const link = `${window.location.origin}${previewPath(props.site, props.draft)}`;
  const copy = useMutation({ mutationFn: () => navigator.clipboard.writeText(link) });
  const copied = copy.isSuccess;
  return (
    <InputGroup>
      <InputGroupInput
        aria-label="Preview link"
        readOnly
        value={link}
        className="font-mono text-xs"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton onClick={() => copy.mutate()}>
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
          {copied ? "Copied" : "Copy link"}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

/**
 * Shares a draft like a document: with named people, everyone in the
 * organization, or anyone with the preview link, each with view or edit
 * access. Changes apply when the person saves them.
 */
export function ShareDialog(props: {
  readonly site: SiteId;
  readonly draft: { readonly id: DraftId; readonly name: string };
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const query = sharingQuery(props.site, props.draft.id);
  const current = useQuery({ ...query, enabled: props.open });
  const organization = useQuery(organizationQuery);
  const queryClient = useQueryClient();
  const [edited, setEdited] = useState<DraftSharing | null>(null);
  const close = () => {
    setEdited(null);
    save.reset();
    props.onOpenChange(false);
  };
  const save = useMutation({
    mutationFn: (sharing: DraftSharing) =>
      shareDraft({ data: { site: props.site, draft: props.draft.id, sharing } }),
    onSuccess: async (view) => {
      queryClient.setQueryData(query.queryKey, view);
      await queryClient.invalidateQueries({ queryKey: ["sites", props.site, "drafts"] });
      close();
    },
  });
  const view = current.data;
  const sharing = edited ?? view?.sharing;
  const canShare = view?.can.share ?? false;
  const change = (next: DraftSharing) => setEdited(next);
  const audiences: ReadonlyArray<{ readonly value: Audience; readonly label: string }> = [
    { value: "people", label: "Only people added" },
    {
      value: "organization",
      label: `Everyone at ${organization.data?.name ?? "your organization"}`,
    },
    { value: "link", label: "Anyone with the link" },
  ];

  return (
    <Dialog open={props.open} onOpenChange={(open) => (open ? props.onOpenChange(true) : close())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share "{props.draft.name}"</DialogTitle>
          <DialogDescription>
            Sharing covers this draft only. It never lets anyone submit or publish it.
          </DialogDescription>
        </DialogHeader>
        {view === undefined || sharing === undefined ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading sharing">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {canShare && (
              <PersonPicker
                label="Add people"
                exclude={[view.owner.id, ...sharing.people.map((share) => share.person.id)]}
                onPick={(person) =>
                  change({ ...sharing, people: [...sharing.people, { person, access: "view" }] })
                }
              />
            )}
            <section aria-labelledby="people-title" className="flex flex-col gap-3">
              <h3 id="people-title" className="text-sm font-semibold">
                People with access
              </h3>
              <ul className="flex flex-col gap-3">
                <li className="flex items-center gap-3">
                  <Avatar className="size-8">
                    <AvatarFallback>{initials(view.owner.name)}</AvatarFallback>
                  </Avatar>
                  <span className="grow text-sm">{view.owner.name}</span>
                  <span className="text-sm text-muted-foreground">Started the draft</span>
                </li>
                {sharing.people.map((share) => (
                  <li key={share.person.id} className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback>{initials(share.person.name)}</AvatarFallback>
                    </Avatar>
                    <span className="flex grow flex-col text-sm">
                      <span>{share.person.name}</span>
                      <span className="text-xs text-muted-foreground">{share.person.email}</span>
                    </span>
                    <AccessSelect
                      label={`Access for ${share.person.name}`}
                      value={share.access}
                      disabled={!canShare}
                      onChange={(access) =>
                        change({
                          ...sharing,
                          people: sharing.people.map((other) =>
                            other.person.id === share.person.id ? { ...other, access } : other,
                          ),
                        })
                      }
                    />
                    {canShare && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove ${share.person.name}`}
                        onClick={() =>
                          change({
                            ...sharing,
                            people: sharing.people.filter(
                              (other) => other.person.id !== share.person.id,
                            ),
                          })
                        }
                      >
                        <XIcon />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
            <section aria-labelledby="general-title" className="flex flex-col gap-3">
              <h3 id="general-title" className="text-sm font-semibold">
                General access
              </h3>
              <div className="flex flex-wrap items-center gap-3">
                <NativeSelect
                  aria-label="Who else can open this draft"
                  value={sharing.general.audience}
                  disabled={!canShare}
                  onChange={(event) => {
                    const audience = audiences.find(
                      (option) => option.value === event.target.value,
                    );
                    if (audience !== undefined)
                      change({
                        ...sharing,
                        general: { ...sharing.general, audience: audience.value },
                      });
                  }}
                >
                  {audiences.map((option) => (
                    <NativeSelectOption key={option.value} value={option.value}>
                      {option.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {sharing.general.audience !== "people" && (
                  <AccessSelect
                    label={
                      sharing.general.audience === "link"
                        ? "Access for anyone with the link"
                        : "Access for everyone in the organization"
                    }
                    value={sharing.general.access}
                    disabled={!canShare}
                    onChange={(access) =>
                      change({ ...sharing, general: { ...sharing.general, access } })
                    }
                  />
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                People who can edit this site's pages can always open its drafts. Anyone without a
                Pakshi account can only view, even from a link shared for editing.
              </p>
            </section>
            <section aria-labelledby="link-title" className="flex flex-col gap-2">
              <h3 id="link-title" className="text-sm font-semibold">
                Preview link
              </h3>
              <PreviewLink site={props.site} draft={props.draft.id} />
              <p className="text-sm text-muted-foreground">
                Shows the latest saved version to anyone it's shared with. Search engines never list
                it.
              </p>
            </section>
          </div>
        )}
        {(save.error ?? current.error) !== null && (
          <FieldError>{(save.error ?? current.error)?.message}</FieldError>
        )}
        <DialogFooter>
          {canShare && edited !== null ? (
            <>
              <Button variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button disabled={save.isPending} onClick={() => save.mutate(edited)}>
                {save.isPending ? "Saving" : "Save"}
              </Button>
            </>
          ) : (
            <Button onClick={close}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
