import { DraftName } from "@repo/contracts/draft";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { useMutation } from "@tanstack/react-query";
import { Option, Schema } from "effect";
import { useId, useState } from "react";

const decodeName = Schema.decodeOption(DraftName);

/**
 * Asks for a draft's name, to start, rename or restore a draft. The dialog
 * closes once `onSubmit` resolves.
 */
export function DraftNameDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly heading: string;
  readonly description: string;
  readonly submitLabel: string;
  readonly initial: string;
  readonly onSubmit: (name: DraftName) => Promise<void>;
}) {
  const [value, setValue] = useState(props.initial);
  const [touched, setTouched] = useState(false);
  const mutation = useMutation({
    mutationFn: props.onSubmit,
    onSuccess: () => props.onOpenChange(false),
  });
  const id = useId();
  const name = decodeName(value);
  const problem = Option.isNone(name)
    ? value.trim() === ""
      ? "Give the draft a name."
      : "Use at most 80 characters."
    : undefined;
  const shown = touched && problem !== undefined;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (Option.isSome(name)) mutation.mutate(name.value);
          }}
          className="flex flex-col gap-6"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{props.heading}</DialogTitle>
            <DialogDescription>{props.description}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={shown || undefined}>
            <FieldLabel htmlFor={id}>Name</FieldLabel>
            <Input
              id={id}
              value={value}
              maxLength={80}
              required
              aria-invalid={shown || undefined}
              onChange={(event) => setValue(event.target.value)}
              onBlur={() => setTouched(true)}
            />
            <FieldDescription>
              Say what the draft changes, such as "Summer event launch" or "Fix the date".
            </FieldDescription>
            <FieldError errors={shown ? [{ message: problem }] : []} />
            {mutation.error !== null && <FieldError>{mutation.error.message}</FieldError>}
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {props.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
