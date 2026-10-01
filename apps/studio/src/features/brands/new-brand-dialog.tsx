import { BrandName } from "@repo/contracts/studio";
import { type HexColor, PresetId, presets, presetTitles } from "@repo/tokens";
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
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Option, Schema } from "effect";
import { useId, useState } from "react";

import { createBrand } from "./functions";
import { BrandColor } from "./theme-studio";

const decodeName = Schema.decodeOption(BrandName);

/** Makes a brand from a name, a preset and a brand color, then opens its theme. */
export function NewBrandDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<PresetId>("civic");
  const [brandColor, setBrandColor] = useState<HexColor>(presets.civic.brandColor);
  const [touched, setTouched] = useState(false);
  const ids = { name: useId(), preset: useId() };
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
              mutation.mutate({ data: { name: decoded.value, preset, brandColor } });
          }}
        >
          <DialogHeader>
            <DialogTitle>New brand</DialogTitle>
            <DialogDescription>
              Start from a preset and the brand's color. You can change everything in Theme Studio
              next.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={shown || undefined}>
            <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
            <Input
              id={ids.name}
              value={name}
              maxLength={80}
              required
              aria-invalid={shown || undefined}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setTouched(true)}
            />
            <FieldError errors={shown ? [{ message: "Name the brand." }] : []} />
          </Field>
          <Field>
            <FieldLabel htmlFor={ids.preset}>Preset</FieldLabel>
            <NativeSelect
              id={ids.preset}
              className="w-full"
              value={preset}
              onChange={(event) => {
                const chosen = PresetId.literals.find(
                  (candidate) => candidate === event.target.value,
                );
                if (chosen === undefined) return;
                setPreset(chosen);
                setBrandColor(presets[chosen].brandColor);
              }}
            >
              {PresetId.literals.map((candidate) => (
                <NativeSelectOption key={candidate} value={candidate}>
                  {presetTitles[candidate]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <BrandColor key={preset} value={brandColor} disabled={false} onChange={setBrandColor} />
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
