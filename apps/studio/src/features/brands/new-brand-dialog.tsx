import type { BrandId } from "@repo/contracts/ids";
import { BrandName } from "@repo/contracts/studio";
import { defaultTheme, type HexColor, resolveTheme } from "@repo/tokens";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Option, Schema } from "effect";
import { useId, useMemo, useState } from "react";

import { BrandColor } from "./brand-color";
import { BrandSpecimen } from "./brand-specimen";

const decodeName = Schema.decodeOption(BrandName);

/** Makes a brand on the default theme in its color, and returns its ID. */
export type CreateBrand = (input: {
  readonly data: { readonly name: typeof BrandName.Type; readonly brandColor: HexColor };
}) => Promise<{ readonly id: BrandId }>;

/**
 * Makes a brand from a name and a brand color, showing the brand as it will
 * start, then opens its theme.
 */
export function NewBrandDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly create: CreateBrand;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState<HexColor>(defaultTheme.brandColor);
  const [touched, setTouched] = useState(false);
  const nameId = useId();
  const mutation = useMutation({
    mutationFn: props.create,
    onSuccess: ({ id }) => navigate({ to: "/brands/$brandId", params: { brandId: id } }),
  });
  const decoded = decodeName(name);
  const shown = touched && Option.isNone(decoded);
  const resolved = useMemo(() => resolveTheme({ ...defaultTheme, brandColor }), [brandColor]);
  const unreadable = resolved.issues.length > 0;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (Option.isSome(decoded) && !unreadable)
              mutation.mutate({ data: { name: decoded.value, brandColor } });
          }}
        >
          <DialogHeader>
            <DialogTitle>New brand</DialogTitle>
            <DialogDescription>
              Pakshi makes the brand's light and dark palettes from its color. Change the fonts and
              the rest of the theme in Theme Studio next.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 sm:grid-cols-[1fr_minmax(0,20rem)]">
            <div className="flex flex-col gap-6">
              <Field data-invalid={shown || undefined}>
                <FieldLabel htmlFor={nameId}>Name</FieldLabel>
                <Input
                  id={nameId}
                  value={name}
                  maxLength={80}
                  required
                  aria-invalid={shown || undefined}
                  onChange={(event) => setName(event.target.value)}
                  onBlur={() => setTouched(true)}
                />
                <FieldError errors={shown ? [{ message: "Name the brand." }] : []} />
              </Field>
              <BrandColor
                value={brandColor}
                disabled={false}
                onChange={setBrandColor}
                error={
                  unreadable
                    ? "This color is too light to read on light pages. Pick a darker one."
                    : undefined
                }
              />
              {mutation.error !== null && <FieldError>{mutation.error.message}</FieldError>}
            </div>
            <BrandSpecimen
              theme={resolved.theme}
              logo={null}
              name={<p>{name.trim() === "" ? "Your brand" : name.trim()}</p>}
              className="aspect-video self-start rounded-lg ring-1 ring-foreground/10"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={unreadable || mutation.isPending}>
              Create brand
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
