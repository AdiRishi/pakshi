import type { SiteId } from "@repo/contracts/ids";
import type { LibraryImage, MediaLibraryView, Viewer } from "@repo/contracts/studio";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/components/empty";
import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@repo/ui/components/sheet";
import { Textarea } from "@repo/ui/components/textarea";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { UploadIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { formatDay } from "@/lib/dates";

import { SiteHeader } from "../sites/site-header";
import { siteMediaSrc } from "./addresses";
import { getMediaLibrary, saveAltText } from "./functions";
import { type Library, uploadImage } from "./upload";

export const mediaLibraryQuery = (site: SiteId) =>
  queryOptions({
    queryKey: ["sites", site, "media"],
    queryFn: () => getMediaLibrary({ data: { site } }),
  });

const sizeOf = (bytes: number) =>
  bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const pagesOf = (image: LibraryImage) =>
  image.usedOn.length === 1 ? "1 page" : `${image.usedOn.length} pages`;

const usageOf = (image: LibraryImage) =>
  image.usedOn.length === 0 ? "not used yet" : `on ${pagesOf(image)}`;

const nameOf = (image: LibraryImage) => image.name || image.id;

/** Uploads the files someone chooses, one at a time, and says how it went. */
function UploadButton(props: { readonly library: Library; readonly onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (files: ReadonlyArray<File>) => {
      for (const file of files) await uploadImage(file, props.library);
      return files.length;
    },
    onSuccess: (count) => {
      toast.success(count === 1 ? "Image uploaded" : `${count} images uploaded`, {
        description: "Add alt text before a page that shows it is submitted.",
      });
      props.onUploaded();
    },
    onError: (error) => {
      toast.error(error.message);
      props.onUploaded();
    },
  });
  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          upload.mutate(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Button disabled={upload.isPending} onClick={() => input.current?.click()}>
        <UploadIcon />
        {upload.isPending ? "Uploading" : "Upload"}
      </Button>
    </>
  );
}

function ImageDetails(props: {
  readonly view: MediaLibraryView;
  readonly image: LibraryImage;
  readonly editable: boolean;
  readonly onClose: () => void;
}) {
  const { image } = props;
  const id = useId();
  const queryClient = useQueryClient();
  const [alt, setAlt] = useState(image.alt);
  const save = useMutation({
    mutationFn: () => saveAltText({ data: { site: props.view.site.id, media: image.id, alt } }),
    onSuccess: async () => {
      toast.success("Alt text saved", {
        description: "It's suggested wherever the image is placed next.",
      });
      await queryClient.invalidateQueries({
        queryKey: mediaLibraryQuery(props.view.site.id).queryKey,
      });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Sheet open onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{nameOf(image)}</SheetTitle>
          <SheetDescription>
            {image.width} by {image.height} pixels, {sizeOf(image.size)}. Uploaded
            {image.uploadedBy === null ? "" : ` by ${image.uploadedBy}`} on{" "}
            {formatDay(image.uploadedAt)}.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-6 overflow-y-auto px-4">
          <img
            src={siteMediaSrc(props.view.site.id, image.id)}
            alt=""
            className="max-h-64 w-full rounded-md bg-muted object-contain"
          />
          <Field>
            <FieldLabel htmlFor={id}>Alt text</FieldLabel>
            <Textarea
              id={id}
              value={alt}
              maxLength={250}
              disabled={!props.editable}
              onChange={(event) => setAlt(event.target.value)}
            />
            <FieldDescription>
              Describe what the image shows for people who can't see it. Each place the image is
              used keeps its own alt text; this is what's suggested when it's placed.
            </FieldDescription>
          </Field>
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">
              {image.usedOn.length === 0 ? "Not used yet" : `Used on ${pagesOf(image)}`}
            </h3>
            {image.usedOn.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {image.usedOn.map((page) => (
                  <li key={page}>
                    <Badge variant="secondary">{page}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="text-sm text-muted-foreground">
            Files never change. To use a different image, upload it and swap it in where you want
            it. An image nothing uses is deleted three months after it was last used.
          </p>
        </div>
        {props.editable && (
          <SheetFooter>
            <Button disabled={alt === image.alt || save.isPending} onClick={() => save.mutate()}>
              Save
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** A site's image library and its brand's: uploads, alt text, and where each image is used. */
export function MediaPage(props: { readonly viewer: Viewer; readonly site: SiteId }) {
  const { data } = useSuspenseQuery(mediaLibraryQuery(props.site));
  const queryClient = useQueryClient();
  const searchId = useId();
  const [shown, setShown] = useState<"site" | "brand">("site");
  const [search, setSearch] = useState("");
  const [missingAlt, setMissingAlt] = useState(false);
  const [open, setOpen] = useState<LibraryImage | null>(null);
  const images = shown === "site" ? data.siteImages : data.brandImages;
  const editable = shown === "site" ? data.can.editSite : data.can.editBrand;
  const needle = search.trim().toLowerCase();
  const listed = images.filter(
    (image) =>
      (!missingAlt || image.alt === "") &&
      (needle === "" ||
        image.name.toLowerCase().includes(needle) ||
        image.alt.toLowerCase().includes(needle)),
  );
  const withoutAlt = images.filter((image) => image.alt === "").length;
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: mediaLibraryQuery(props.site).queryKey });
  return (
    <AppShell viewer={props.viewer}>
      <SiteHeader
        site={data.site}
        section="media"
        description="Images this site's pages can show, from its own library and its brand's."
      />
      <div className="flex flex-col gap-6 px-10 py-8">
        <div className="flex flex-wrap items-center gap-4">
          <ToggleGroup
            aria-label="Library"
            variant="outline"
            value={[shown]}
            onValueChange={(value: ReadonlyArray<string>) =>
              setShown(value[0] === "brand" ? "brand" : "site")
            }
          >
            <ToggleGroupItem value="site">This site ({data.siteImages.length})</ToggleGroupItem>
            <ToggleGroupItem value="brand">
              {data.brand.name} library ({data.brandImages.length})
            </ToggleGroupItem>
          </ToggleGroup>
          {shown === "brand" && (
            <p className="text-sm text-muted-foreground">
              The logo and favicon are set on the{" "}
              <Link
                to="/brands/$brandId/identity"
                params={{ brandId: data.brand.id }}
                className="underline underline-offset-4"
              >
                brand
              </Link>
              .
            </p>
          )}
          <div className="ml-auto">
            {editable && (
              <UploadButton
                library={
                  shown === "site"
                    ? { kind: "site", id: data.site.id }
                    : { kind: "brand", id: data.brand.id }
                }
                onUploaded={refresh}
              />
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={searchId} className="sr-only">
            Search images
          </label>
          <Input
            id={searchId}
            type="search"
            className="max-w-sm"
            placeholder="Search by file name or alt text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Button
            variant={missingAlt ? "secondary" : "outline"}
            aria-pressed={missingAlt}
            onClick={() => setMissingAlt((current) => !current)}
          >
            Missing alt text ({withoutAlt})
          </Button>
        </div>
        {listed.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{images.length === 0 ? "No images yet" : "No images match"}</EmptyTitle>
              <EmptyDescription>
                {images.length === 0
                  ? "Upload images here, or from the editor when you place one."
                  : "Try another search."}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
            {listed.map((image) => (
              <li key={image.id}>
                <button
                  type="button"
                  className="flex w-full flex-col gap-2 rounded-lg border bg-card p-2 text-left hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  onClick={() => setOpen(image)}
                >
                  <span className="relative block">
                    <img
                      src={siteMediaSrc(data.site.id, image.id)}
                      alt=""
                      loading="lazy"
                      className="aspect-video w-full rounded-md bg-muted object-cover"
                    />
                    {image.alt === "" && (
                      <Badge variant="warning" className="absolute top-2 left-2">
                        No alt text
                      </Badge>
                    )}
                  </span>
                  <span className="truncate text-sm font-medium">{nameOf(image)}</span>
                  <span className="text-xs text-muted-foreground">
                    {sizeOf(image.size)}, {usageOf(image)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {open !== null && (
        <ImageDetails
          key={open.id}
          view={data}
          image={open}
          editable={editable}
          onClose={() => setOpen(null)}
        />
      )}
    </AppShell>
  );
}
