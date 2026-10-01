import type { BrandId, BlockType } from "@repo/contracts/ids";
import type { BrandView, Viewer } from "@repo/contracts/studio";
import {
  type BrandTheme,
  type ColorScheme,
  type ContrastIssue,
  fontCatalog,
  FontId,
  HexColor,
  NeutralTone,
  PresetId,
  presetTitles,
  resolveTheme,
  type ThemeValues,
  themeValues,
} from "@repo/tokens";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { Field, FieldGroup, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { Switch } from "@repo/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Equal, Schema } from "effect";
import { CircleAlertIcon, CircleCheckIcon, InfoIcon, MoonIcon, SunIcon } from "lucide-react";
import { type ReactNode, Suspense, useId, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";

import { BrandHeader } from "./brand-header";
import { saveBrandLook } from "./functions";
import { brandQuery } from "./queries";
import { ThemePreview, usePreviewSections } from "./theme-preview";

const isHexColor = Schema.is(HexColor);

/** A setting's options, each a value and what to call it. */
type Options<Value extends string> = ReadonlyArray<readonly [Value, string]>;

const typeSizes = [
  ["small", "Small"],
  ["medium", "Medium"],
  ["large", "Large"],
] as const satisfies Options<ThemeValues["typeScale"]>;
const radii = [
  ["none", "None"],
  ["small", "Small"],
  ["medium", "Medium"],
  ["large", "Large"],
] as const satisfies Options<ThemeValues["radius"]>;
const shadows = [
  ["flat", "Flat"],
  ["soft", "Soft"],
  ["raised", "Raised"],
] as const satisfies Options<ThemeValues["shadow"]>;
const densities = [
  ["compact", "Compact"],
  ["comfortable", "Comfortable"],
  ["spacious", "Spacious"],
] as const satisfies Options<ThemeValues["density"]>;
const imageCorners = [
  ["square", "Square"],
  ["rounded", "Rounded"],
  ["extra-rounded", "Extra rounded"],
] as const satisfies Options<ThemeValues["imageCorners"]>;
const tones = [
  ["cool", "Cool"],
  ["neutral", "Neutral"],
  ["warm", "Warm"],
] as const satisfies Options<NeutralTone>;
const fonts: Options<FontId> = FontId.literals.map((font) => [font, fontCatalog[font].family]);

const schemeTitles = { light: "Light", dark: "Dark" } as const;
const surfaceTitles = {
  default: "page background",
  muted: "shaded sections",
  brand: "brand-colored sections",
  inverse: "reversed sections",
} as const;

/** One contrast problem, in words someone choosing colors can act on. */
const describeIssue = (issue: ContrastIssue) =>
  `${schemeTitles[issue.scheme]} mode, ${surfaceTitles[issue.surface]}: ${issue.what.toLowerCase()} have ${issue.ratio}:1 contrast, and need ${issue.required}:1.`;

/** A setting chosen from a few named options, one at a time. */
function Choice<Value extends string>(props: {
  readonly label: string;
  readonly options: Options<Value>;
  readonly value: Value;
  readonly disabled: boolean;
  readonly onChange: (value: Value) => void;
}) {
  const id = useId();
  const { options } = props;
  return (
    <Field orientation="horizontal" className="justify-between">
      <FieldLabel id={id}>{props.label}</FieldLabel>
      <ToggleGroup
        aria-labelledby={id}
        variant="outline"
        size="sm"
        spacing={0}
        value={[props.value]}
        disabled={props.disabled}
        onValueChange={(values) => {
          const [chosen] = values;
          const option = options.find(([value]) => value === chosen);
          if (option !== undefined) props.onChange(option[0]);
        }}
      >
        {options.map(([value, title]) => (
          <ToggleGroupItem key={value} value={value}>
            {title}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Field>
  );
}

/** A setting chosen from a list. */
function Select<Value extends string>(props: {
  readonly label: string;
  readonly options: Options<Value>;
  readonly value: Value;
  readonly disabled: boolean;
  readonly onChange: (value: Value) => void;
}) {
  const id = useId();
  const { options } = props;
  return (
    <Field>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      <NativeSelect
        id={id}
        value={props.value}
        disabled={props.disabled}
        onChange={(event) => {
          const option = options.find(([value]) => value === event.target.value);
          if (option !== undefined) props.onChange(option[0]);
        }}
      >
        {options.map(([value, title]) => (
          <NativeSelectOption key={value} value={value}>
            {title}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  );
}

function Section(props: {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 border-b px-6 py-5 last:border-b-0"
    >
      <div className="flex flex-col gap-1">
        <h2 id={id} className="font-semibold">
          {props.title}
        </h2>
        {props.description !== undefined && (
          <p className="text-sm text-muted-foreground">{props.description}</p>
        )}
      </div>
      {props.children}
    </section>
  );
}

/** The brand color, as a picker and as text, which only takes a whole color. */
export function BrandColor(props: {
  readonly value: HexColor;
  readonly disabled: boolean;
  readonly onChange: (value: HexColor) => void;
}) {
  const id = useId();
  const [text, setText] = useState(props.value);
  return (
    <Field>
      <FieldLabel htmlFor={id}>Brand color</FieldLabel>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label="Pick the brand color"
          value={props.value}
          disabled={props.disabled}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1"
          onChange={(event) => {
            const value = event.target.value.toLowerCase();
            setText(value);
            if (isHexColor(value)) props.onChange(value);
          }}
        />
        <Input
          id={id}
          value={text}
          disabled={props.disabled}
          spellCheck={false}
          onChange={(event) => {
            const value = event.target.value.trim().toLowerCase();
            setText(value);
            if (isHexColor(value)) props.onChange(value);
          }}
        />
      </div>
    </Field>
  );
}

/** The backgrounds Pakshi generated, light and dark, so a brand color's effect shows at a glance. */
function Swatches(props: { readonly colors: ReturnType<typeof resolveTheme>["theme"]["colors"] }) {
  const shades = (["light", "dark"] as const).flatMap((scheme) =>
    (["default", "muted", "brand", "inverse"] as const).map((surface) => ({
      key: `${scheme}-${surface}`,
      label: `${schemeTitles[scheme]}, ${surfaceTitles[surface]}`,
      color: props.colors[scheme][surface].background,
      text: props.colors[scheme][surface].foreground,
    })),
  );
  return (
    <figure className="flex flex-col gap-2">
      <ul className="flex overflow-hidden rounded-md border">
        {shades.map((shade) => (
          <li
            key={shade.key}
            title={shade.label}
            aria-label={shade.label}
            className="flex h-10 flex-1 items-center justify-center text-xs font-semibold"
            style={{ backgroundColor: shade.color, color: shade.text }}
          >
            Aa
          </li>
        ))}
      </ul>
      <figcaption className="text-sm text-muted-foreground">
        Backgrounds Pakshi made from your brand color, in light and dark
      </figcaption>
    </figure>
  );
}

/** Whether every text and button color pair reads clearly, or what doesn't. */
function ContrastCheck(props: { readonly issues: ReadonlyArray<ContrastIssue> }) {
  if (props.issues.length === 0)
    return (
      <Alert>
        <CircleCheckIcon />
        <AlertTitle>Text passes WCAG AA in light and dark</AlertTitle>
        <AlertDescription>Every text and button color pair is easy to read.</AlertDescription>
      </Alert>
    );
  return (
    <Alert variant="destructive">
      <CircleAlertIcon />
      <AlertTitle>Some text is too hard to read, so the theme can't be saved</AlertTitle>
      <AlertDescription>
        <ul className="list-disc pl-4">
          {props.issues.map((issue) => (
            <li key={`${issue.scheme}-${issue.surface}-${issue.color}-${issue.on}`}>
              {describeIssue(issue)}
            </li>
          ))}
        </ul>
        Try a darker brand color.
      </AlertDescription>
    </Alert>
  );
}

function PresetSwatch(props: { readonly preset: PresetId }) {
  const { light } = useMemo(
    () => resolveTheme({ preset: props.preset, changes: {} }).theme.colors,
    [props.preset],
  );
  return (
    <span aria-hidden className="flex h-4 overflow-hidden rounded-sm border">
      {[light.brand.background, light.muted.background, light.default.foreground].map((color) => (
        <span key={color} className="w-2" style={{ backgroundColor: color }} />
      ))}
    </span>
  );
}

/** Theme Studio: a brand's theme, changed and previewed before it's saved as a new revision. */
export function ThemeStudio(props: { readonly viewer: Viewer; readonly brand: BrandId }) {
  const { data } = useSuspenseQuery(brandQuery(props.brand));
  return <ThemeEditor key={data.revision.number} viewer={props.viewer} view={data} />;
}

function ThemeEditor(props: { readonly viewer: Viewer; readonly view: BrandView }) {
  const { view } = props;
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<BrandTheme>(view.look.theme);
  const [scheme, setScheme] = useState<ColorScheme>("light");
  const [only, setOnly] = useState<BlockType | null>(null);
  const values = themeValues(theme);
  const resolved = useMemo(() => resolveTheme(theme), [theme]);
  const changed = !Equal.equals(theme, view.look.theme);
  const disabled = !view.can.edit;
  const set = <K extends keyof ThemeValues>(key: K, value: ThemeValues[K]) =>
    setTheme((current) => ({ ...current, changes: { ...current.changes, [key]: value } }));

  const save = useMutation({
    mutationFn: () =>
      saveBrandLook({
        data: {
          brand: view.brand.id,
          look: { theme, identity: view.look.identity },
          seen: view.revision.number,
        },
      }),
    onSuccess: async (saved) => {
      const drafts = saved.sites.filter((site) => site.draft !== null).length;
      toast.success("Theme saved", {
        description:
          drafts === 0
            ? "No site needed a Brand update draft."
            : `${drafts === 1 ? "1 site has" : `${drafts} sites have`} a Brand update draft to submit.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["brands"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const siteNames = view.sites.map((site) => site.name);
  return (
    <AppShell viewer={props.viewer}>
      <BrandHeader
        brand={view.brand}
        sites={view.sites.length}
        section="theme"
        actions={
          view.can.edit && (
            <>
              {changed && <span className="text-sm text-muted-foreground">Unsaved changes</span>}
              <Button
                variant="outline"
                disabled={!changed || save.isPending}
                onClick={() => setTheme(view.look.theme)}
              >
                Discard
              </Button>
              <Button
                disabled={!changed || resolved.issues.length > 0 || save.isPending}
                onClick={() => save.mutate()}
              >
                Save theme
              </Button>
            </>
          )
        }
      />
      <div className="grid gap-6 px-10 py-8 lg:grid-cols-[24rem_1fr]">
        <Card className="h-fit gap-0 py-0">
          <Section
            title="Start from a preset"
            description="Your changes below are kept on top of the preset."
          >
            <ToggleGroup
              aria-label="Preset"
              variant="outline"
              value={[theme.preset]}
              disabled={disabled}
              onValueChange={(chosen) => {
                const preset = PresetId.literals.find((candidate) => candidate === chosen[0]);
                if (preset !== undefined) setTheme((current) => ({ ...current, preset }));
              }}
            >
              {PresetId.literals.map((preset) => (
                <ToggleGroupItem key={preset} value={preset} className="gap-2">
                  <PresetSwatch preset={preset} />
                  {presetTitles[preset]}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Section>
          <Section
            title="Colors"
            description="Pakshi makes the light and dark palettes from one brand color."
          >
            <FieldGroup className="grid grid-cols-2 gap-4">
              <BrandColor
                key={theme.preset}
                value={values.brandColor}
                disabled={disabled}
                onChange={(value) => set("brandColor", value)}
              />
              <Select
                label="Neutral tone"
                options={tones}
                value={values.neutral}
                disabled={disabled}
                onChange={(value) => set("neutral", value)}
              />
            </FieldGroup>
            <Swatches colors={resolved.theme.colors} />
            <ContrastCheck issues={resolved.issues} />
          </Section>
          <Section title="Fonts and type size">
            <FieldGroup className="grid grid-cols-2 gap-4">
              <Select
                label="Heading font"
                options={fonts}
                value={values.fonts.heading}
                disabled={disabled}
                onChange={(heading) => set("fonts", { ...values.fonts, heading })}
              />
              <Select
                label="Body font"
                options={fonts}
                value={values.fonts.body}
                disabled={disabled}
                onChange={(body) => set("fonts", { ...values.fonts, body })}
              />
              <Select
                label="Type size"
                options={typeSizes}
                value={values.typeScale}
                disabled={disabled}
                onChange={(value) => set("typeScale", value)}
              />
            </FieldGroup>
          </Section>
          <Section title="Shape and depth">
            <Choice
              label="Corners"
              options={radii}
              value={values.radius}
              disabled={disabled}
              onChange={(value) => set("radius", value)}
            />
            <Choice
              label="Shadows"
              options={shadows}
              value={values.shadow}
              disabled={disabled}
              onChange={(value) => set("shadow", value)}
            />
          </Section>
          <Section title="Density">
            <Choice
              label="Spacing"
              options={densities}
              value={values.density}
              disabled={disabled}
              onChange={(value) => set("density", value)}
            />
          </Section>
          <Section title="Imagery">
            <Choice
              label="Image corners"
              options={imageCorners}
              value={values.imageCorners}
              disabled={disabled}
              onChange={(value) => set("imageCorners", value)}
            />
          </Section>
          <Section
            title="Motion"
            description="Visitors who ask their device for less motion never see it."
          >
            <Motion
              checked={values.motion}
              disabled={disabled}
              onChange={(motion) => set("motion", motion)}
            />
          </Section>
        </Card>
        <div className="flex min-w-0 flex-col gap-4">
          <Alert>
            <InfoIcon />
            <AlertTitle>Saving creates a new brand revision</AlertTitle>
            <AlertDescription>
              {siteNames.length === 0
                ? "No site uses this brand yet."
                : `${new Intl.ListFormat("en", { type: "conjunction" }).format(siteNames)} ${siteNames.length === 1 ? "uses" : "use"} this theme as it is. Each site gets a Brand update draft that follows its approval workflow. No live site changes until that draft publishes.`}
            </AlertDescription>
          </Alert>
          <Card className="gap-0 py-0">
            <CardHeader className="flex flex-wrap items-center gap-4 border-b py-3">
              <div className="flex flex-col">
                <CardTitle>
                  <h2>Preview</h2>
                </CardTitle>
                <CardDescription>
                  {changed ? "Your changes, not saved yet" : "The saved theme"}, with each block's
                  starting content
                </CardDescription>
              </div>
              <div className="ml-auto flex items-center gap-3">
                <ToggleGroup
                  aria-label="Color scheme"
                  variant="outline"
                  size="sm"
                  spacing={0}
                  value={[scheme]}
                  onValueChange={(chosen) => {
                    if (chosen[0] === "light" || chosen[0] === "dark") setScheme(chosen[0]);
                  }}
                >
                  <ToggleGroupItem value="light">
                    <SunIcon /> Light
                  </ToggleGroupItem>
                  <ToggleGroupItem value="dark">
                    <MoonIcon /> Dark
                  </ToggleGroupItem>
                </ToggleGroup>
                <Suspense fallback={null}>
                  <BlockFilter value={only} onChange={setOnly} />
                </Suspense>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <Suspense fallback={<Skeleton className="h-[48rem] w-full" />}>
                <ThemePreview
                  brand={view.brand}
                  theme={resolved.theme}
                  identity={view.look.identity}
                  media={view.media}
                  scheme={scheme}
                  only={only}
                />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function Motion(props: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <Field orientation="horizontal" className="justify-between">
      <FieldLabel htmlFor={id}>Fade sections in as visitors scroll</FieldLabel>
      <Switch
        id={id}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onChange}
      />
    </Field>
  );
}

function BlockFilter(props: {
  readonly value: BlockType | null;
  readonly onChange: (value: BlockType | null) => void;
}) {
  const id = useId();
  const sections = usePreviewSections();
  return (
    <div className="flex items-center gap-2">
      <FieldLabel htmlFor={id} className="sr-only">
        Blocks to preview
      </FieldLabel>
      <NativeSelect
        id={id}
        size="sm"
        value={props.value ?? ""}
        onChange={(event) =>
          props.onChange(
            sections.find((section) => section.type === event.target.value)?.type ?? null,
          )
        }
      >
        <NativeSelectOption value="">All blocks</NativeSelectOption>
        {sections.map((section) => (
          <NativeSelectOption key={section.type} value={section.type}>
            {section.title}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}
