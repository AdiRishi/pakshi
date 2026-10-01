import type { SiteId } from "@repo/contracts/ids";
import type { MediaRef } from "@repo/contracts/references";
import { SiteName } from "@repo/contracts/settings";
import type { SiteSettingsView, Viewer } from "@repo/contracts/studio";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Equal, Option, Schema } from "effect";
import { useId, useState } from "react";
import { toast } from "sonner";

import { siteMediaSrc } from "../media/addresses";
import { LibraryPicker } from "../media/library-picker";
import { saveSiteSettings } from "../sites/functions";
import { siteSettingsQuery } from "../sites/queries";
import { DeleteSiteCard } from "./delete-site";
import { SettingsShell } from "./settings-shell";

const decodeName = Schema.decodeOption(SiteName);

/** A site's name and default sharing image, which go live with its next publish. */
export function GeneralSettingsPage(props: { readonly viewer: Viewer; readonly site: SiteId }) {
  const { data } = useSuspenseQuery(siteSettingsQuery(props.site));
  return <GeneralSettings key={data.revision} viewer={props.viewer} view={data} />;
}

function GeneralSettings(props: { readonly viewer: Viewer; readonly view: SiteSettingsView }) {
  const { view } = props;
  const queryClient = useQueryClient();
  const id = useId();
  const [name, setName] = useState<string>(view.settings.name);
  const [sharingImage, setSharingImage] = useState(view.settings.sharingImage);
  const [picking, setPicking] = useState(false);
  const decoded = decodeName(name);
  const changed =
    name !== view.settings.name || !Equal.equals(sharingImage, view.settings.sharingImage);
  const save = useMutation({
    mutationFn: (changes: { readonly name: string; readonly sharingImage: MediaRef | null }) =>
      saveSiteSettings({ data: { site: view.site.id, changes, seen: view.revision } }),
    onSuccess: (saved) => {
      queryClient.setQueryData(siteSettingsQuery(view.site.id).queryKey, saved);
      toast.success("Settings saved", {
        description: "They reach the live site with its next publish.",
      });
    },
    onError: (error) => toast.error(error.message),
  });
  const image = view.media.find((file) => file.id === sharingImage?.id);
  const disabled = !view.can.edit;
  return (
    <SettingsShell
      viewer={props.viewer}
      site={view.site}
      page="general"
      title="General"
      description="Site settings aren't part of any draft. What you save here reaches the live site with the next publish."
      actions={
        view.can.edit && (
          <Button
            disabled={!changed || Option.isNone(decoded) || save.isPending}
            onClick={() =>
              Option.isSome(decoded) && save.mutate({ name: decoded.value, sharingImage })
            }
          >
            Save changes
          </Button>
        )
      }
    >
      <Card>
        <CardHeader>
          <CardTitle>
            <h3>Name and sharing</h3>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={Option.isNone(decoded) || undefined}>
              <FieldLabel htmlFor={`${id}-name`}>Site name</FieldLabel>
              <Input
                id={`${id}-name`}
                value={name}
                maxLength={80}
                disabled={disabled}
                aria-invalid={Option.isNone(decoded) || undefined}
                onChange={(event) => setName(event.target.value)}
              />
              <FieldDescription>
                The end of every page title. Search results show: Opening hours ·{" "}
                {Option.getOrElse(decoded, () => view.settings.name)}
              </FieldDescription>
              {Option.isNone(decoded) && <FieldError>Name the site.</FieldError>}
            </Field>
            <Field>
              <FieldLabel>Default sharing image</FieldLabel>
              <div className="flex items-center gap-4 rounded-md border p-3">
                <div className="flex aspect-video w-28 shrink-0 items-center justify-center rounded-sm bg-muted">
                  {sharingImage === null ? (
                    <span className="text-xs text-muted-foreground">None</span>
                  ) : (
                    <img
                      src={siteMediaSrc(view.site.id, sharingImage.id)}
                      alt={image?.alt ?? ""}
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>
                <span className="grow text-sm text-muted-foreground">
                  {image === undefined ? "" : `${image.alt || image.id}. `}Shown when a page that
                  has no image of its own is shared.
                </span>
                {view.can.edit && (
                  <div className="flex gap-2">
                    {sharingImage !== null && (
                      <Button variant="ghost" size="sm" onClick={() => setSharingImage(null)}>
                        Remove
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label="Change the default sharing image"
                      onClick={() => setPicking(true)}
                    >
                      Change
                    </Button>
                  </div>
                )}
              </div>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h3>Theme</h3>
          </CardTitle>
          <CardDescription>
            This site uses the {view.brand.name} brand's theme and identity. When the brand changes
            them, a Brand update draft appears in Drafts and goes through approval like any other
            change.
          </CardDescription>
        </CardHeader>
        {props.viewer.brands && (
          <CardContent>
            <Link
              to="/brands/$brandId"
              params={{ brandId: view.brand.id }}
              className="text-sm font-medium underline underline-offset-4"
            >
              Open the {view.brand.name} brand
            </Link>
          </CardContent>
        )}
      </Card>
      {view.can.delete && <DeleteSiteCard site={view.site} />}
      <LibraryPicker
        title="Choose the default sharing image"
        description="From the site's library and its brand's."
        media={view.media}
        src={(media) => siteMediaSrc(view.site.id, media)}
        open={picking}
        onOpenChange={setPicking}
        onPick={(file) => {
          setSharingImage({ $ref: "media", id: file.id, alt: file.alt });
          setPicking(false);
        }}
      />
    </SettingsShell>
  );
}
