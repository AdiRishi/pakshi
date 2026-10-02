import { BrandName } from "@repo/contracts/studio";
import { defaultTheme, type HexColor } from "@repo/tokens";
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
import { useId, useState } from "react";

import { createBrand } from "./functions";
import { BrandColor } from "./theme-studio";

const decodeName = Schema.decodeOption(BrandName);

/** Makes a brand from a name and a brand color, then opens its theme. */
export function NewBrandDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [brandColor, setBrandColor] = useState<HexColor>(defaultTheme.brandColor);
  const [touched, setTouched] = useState(false);
  const nameId = useId();
  const mutation = useMutation({
    mutationFn: createBrand,
    onSuccess: ({ id }) => navigate({ to: "/brands/$brandId", params: { brandId: id } }),
  });
  const decoded = decodeName(name);
  const shown = touched && Option.isNone(decoded);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (Option.isSome(decoded))
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
          <BrandColor value={brandColor} disabled={false} onChange={setBrandColor} />
          {mutation.error !== null && <FieldError>{mutation.error.message}</FieldError>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              Create brand
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
