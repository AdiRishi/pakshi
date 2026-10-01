import { type BrandIdentity, type VoiceGuide } from "@repo/contracts/brand";
import type { BrandId, MediaId } from "@repo/contracts/ids";
import type { BrandView, MediaSummary, Viewer } from "@repo/contracts/studio";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@repo/ui/components/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Equal } from "effect";
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";

import { BrandHeader } from "./brand-header";
import { saveBrandLook, saveVoiceGuide } from "./functions";
import { brandQuery } from "./queries";
import { brandMediaSrc } from "./theme-preview";

const slots = [
  { key: "logo", title: "Logo", description: "Shown in site headers on light backgrounds." },
  {
    key: "logoOnDark",
    title: "Logo for dark backgrounds",
    description: "Shown in dark mode and on dark headers. Leave it empty to use the logo.",
  },
  {
    key: "favicon",
    title: "Favicon",
    description: "The icon in browser tabs. Square, at least 512 px.",
  },
] as const satisfies ReadonlyArray<{
  readonly key: keyof BrandIdentity;
  readonly title: string;
  readonly description: string;
}>;

/** Images from the brand's library to choose one from. */
function LibraryPicker(props: {
  readonly brand: BrandId;
  readonly title: string;
  readonly media: ReadonlyArray<MediaSummary>;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPick: (media: MediaId) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose the {props.title.toLowerCase()}</DialogTitle>
          <DialogDescription>From the brand's library.</DialogDescription>
        </DialogHeader>
        {props.media.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>The brand's library is empty</EmptyTitle>
              <EmptyDescription>
                Images uploaded to the brand's library appear here.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="grid grid-cols-3 gap-3">
            {props.media.map((file) => (
              <li key={file.id}>
                <Button
                  variant="outline"
                  className="h-auto w-full flex-col gap-2 p-2"
                  onClick={() => props.onPick(file.id)}
                >
                  <img
                    src={brandMediaSrc(props.brand, file.id)}
                    alt=""
                    className="aspect-video w-full rounded-sm object-contain"
                  />
                  <span className="w-full truncate text-xs">{file.alt || file.id}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function IdentityCard(props: { readonly view: BrandView }) {
  const { view } = props;
  const queryClient = useQueryClient();
  const [identity, setIdentity] = useState(view.look.identity);
  const [picking, setPicking] = useState<keyof BrandIdentity | null>(null);
  const changed = !Equal.equals(identity, view.look.identity);
  const save = useMutation({
    mutationFn: () =>
      saveBrandLook({
        data: {
          brand: view.brand.id,
          look: { theme: view.look.theme, identity },
          seen: view.revision.number,
        },
      }),
    onSuccess: async (saved) => {
      const drafts = saved.sites.filter((site) => site.draft !== null).length;
      toast.success("Identity saved", {
        description: `${drafts === 1 ? "1 site has" : `${drafts} sites have`} a Brand update draft to submit.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (error) => toast.error(error.message),
  });
  const slot = slots.find((candidate) => candidate.key === picking);
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Identity</h2>
        </CardTitle>
        <CardDescription>Shown in site headers and browser tabs.</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-4">
          {slots.map(({ key, title, description }) => {
            const media = identity[key];
            return (
              <li key={key} className="flex items-center gap-4 rounded-md border p-3">
                <div className="flex size-20 shrink-0 items-center justify-center rounded-sm bg-muted">
                  {media === null ? (
                    <span className="text-xs text-muted-foreground">None</span>
                  ) : (
                    <img
                      src={brandMediaSrc(view.brand.id, media)}
                      alt={`The current ${title.toLowerCase()}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-medium">{title}</span>
                  <span className="text-sm text-muted-foreground">{description}</span>
                </div>
                {view.can.edit && (
                  <div className="flex gap-2">
                    {media !== null && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Remove the ${title.toLowerCase()}`}
                        onClick={() => setIdentity((current) => ({ ...current, [key]: null }))}
                      >
                        <XIcon />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`Change the ${title.toLowerCase()}`}
                      onClick={() => setPicking(key)}
                    >
                      Change
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
      {view.can.edit && (
        <CardFooter className="flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">
            Saving a new logo or favicon creates a Brand update draft on every {view.brand.name}{" "}
            site. It follows that site's approval workflow and goes live when it publishes.
          </p>
          <Button disabled={!changed || save.isPending} onClick={() => save.mutate()}>
            Save identity
          </Button>
        </CardFooter>
      )}
      {slot !== undefined && (
        <LibraryPicker
          brand={view.brand.id}
          title={slot.title}
          media={view.media}
          open
          onOpenChange={(open) => !open && setPicking(null)}
          onPick={(media) => {
            setIdentity((current) => ({ ...current, [slot.key]: media }));
            setPicking(null);
          }}
        />
      )}
    </Card>
  );
}

function WordsToAvoid(props: {
  readonly words: ReadonlyArray<string>;
  readonly disabled: boolean;
  readonly onChange: (words: ReadonlyArray<string>) => void;
}) {
  const id = useId();
  const [word, setWord] = useState("");
  const add = () => {
    const trimmed = word.trim();
    if (trimmed === "" || props.words.includes(trimmed)) return;
    props.onChange([...props.words, trimmed]);
    setWord("");
  };
  return (
    <Field>
      <FieldLabel htmlFor={id}>Words to avoid</FieldLabel>
      <FieldDescription>Pakshi never uses these words in what it writes.</FieldDescription>
      <ul className="flex flex-wrap gap-2">
        {props.words.map((avoided) => (
          <li key={avoided}>
            <Badge variant="secondary" className="gap-1 pr-1">
              {avoided}
              {!props.disabled && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${avoided}`}
                  onClick={() => props.onChange(props.words.filter((other) => other !== avoided))}
                >
                  <XIcon />
                </Button>
              )}
            </Badge>
          </li>
        ))}
      </ul>
      {!props.disabled && (
        <div className="flex gap-2">
          <Input
            id={id}
            value={word}
            maxLength={40}
            placeholder="Add a word"
            onChange={(event) => setWord(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              add();
            }}
          />
          <Button variant="outline" onClick={add}>
            Add
          </Button>
        </div>
      )}
    </Field>
  );
}

function VoiceCard(props: { readonly view: BrandView }) {
  const { view } = props;
  const queryClient = useQueryClient();
  const toneId = useId();
  const [voice, setVoice] = useState<Omit<VoiceGuide, "examples">>(view.voice);
  // Each example gets a key of its own while it's edited, so removing one keeps the others' text.
  const [examples, setExamples] = useState(() =>
    view.voice.examples.map((example) => ({ ...example, key: crypto.randomUUID() })),
  );
  const guide: VoiceGuide = {
    ...voice,
    examples: examples.map(({ write, avoid }) => ({ write, avoid })),
  };
  const changed = !Equal.equals(guide, view.voice);
  const disabled = !view.can.edit;
  const complete = examples.every(
    (example) => example.write.trim() !== "" && example.avoid.trim() !== "",
  );
  const save = useMutation({
    mutationFn: () => saveVoiceGuide({ data: { brand: view.brand.id, voice: guide } }),
    onSuccess: async () => {
      toast.success("Voice guide saved");
      await queryClient.invalidateQueries({ queryKey: ["brands", view.brand.id] });
    },
    onError: (error) => toast.error(error.message),
  });
  const setExample = (key: string, part: "write" | "avoid", value: string) =>
    setExamples((current) =>
      current.map((example) => (example.key === key ? { ...example, [part]: value } : example)),
    );
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>Voice guide</h2>
        </CardTitle>
        <CardDescription>
          Pakshi follows this guide in new text it writes on {view.brand.name} sites. Saving takes
          effect straight away and changes no existing pages.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={toneId}>Tone</FieldLabel>
            <Textarea
              id={toneId}
              rows={4}
              maxLength={1000}
              value={voice.tone}
              disabled={disabled}
              onChange={(event) =>
                setVoice((current) => ({ ...current, tone: event.target.value }))
              }
            />
          </Field>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-medium">Examples</legend>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-sm text-muted-foreground">
              <span>Write like this</span>
              <span>Not like this</span>
              <span className="sr-only">Remove</span>
            </div>
            {examples.map((example, index) => (
              <div key={example.key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Textarea
                  aria-label={`Example ${index + 1}, write like this`}
                  rows={2}
                  maxLength={300}
                  value={example.write}
                  disabled={disabled}
                  onChange={(event) => setExample(example.key, "write", event.target.value)}
                />
                <Textarea
                  aria-label={`Example ${index + 1}, not like this`}
                  rows={2}
                  maxLength={300}
                  value={example.avoid}
                  disabled={disabled}
                  onChange={(event) => setExample(example.key, "avoid", event.target.value)}
                />
                {!disabled && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove example ${index + 1}`}
                    onClick={() =>
                      setExamples((current) => current.filter((other) => other.key !== example.key))
                    }
                  >
                    <Trash2Icon />
                  </Button>
                )}
              </div>
            ))}
            {!disabled && examples.length < 20 && (
              <Button
                variant="outline"
                className="w-fit"
                onClick={() =>
                  setExamples((current) => [
                    ...current,
                    { write: "", avoid: "", key: crypto.randomUUID() },
                  ])
                }
              >
                <PlusIcon />
                Add an example
              </Button>
            )}
          </fieldset>
          <WordsToAvoid
            words={voice.wordsToAvoid}
            disabled={disabled}
            onChange={(wordsToAvoid) => setVoice((current) => ({ ...current, wordsToAvoid }))}
          />
        </FieldGroup>
      </CardContent>
      {!disabled && (
        <CardFooter>
          <Button disabled={!changed || !complete || save.isPending} onClick={() => save.mutate()}>
            Save voice guide
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/** A brand's logos, favicon and voice guide. */
export function IdentityVoicePage(props: { readonly viewer: Viewer; readonly brand: BrandId }) {
  const { data } = useSuspenseQuery(brandQuery(props.brand));
  return (
    <AppShell viewer={props.viewer}>
      <BrandHeader brand={data.brand} sites={data.sites.length} section="identity" />
      <div className="grid gap-6 px-10 py-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <IdentityCard key={`identity-${data.revision.number}`} view={data} />
        <VoiceCard key={JSON.stringify(data.voice)} view={data} />
      </div>
    </AppShell>
  );
}
