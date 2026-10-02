import type { BatchError } from "@repo/contracts/ops";
import { PagePath, Slug, slugFor } from "@repo/contracts/page";
import { entryAddress } from "@repo/contracts/snapshot";
import { Button } from "@repo/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@repo/ui/components/input-group";
import { useMutation } from "@tanstack/react-query";
import { Option, Schema } from "effect";
import { useId, useState } from "react";

const decodePath = Schema.decodeOption(PagePath);
const decodeSlug = Schema.decodeOption(Slug);

export interface PageValues {
  readonly title: string;
  /** The page's address, or an entry's slug. */
  readonly address: string;
}

/**
 * Where the dialog's address goes: a whole address, or the slug of an entry
 * below its collection's address. A new page's address follows its title
 * until it's edited by hand.
 */
export interface AddressMode {
  readonly under: PagePath | null;
  readonly followsTitle: boolean;
}

/**
 * Asks for a page's title and address, to create it or rename it.
 * `onSubmit` takes a filled-in title and an address or slug that passed its
 * rules, and resolves with the batch's errors, or none when it committed.
 */
export function PageDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly heading: string;
  readonly description: string;
  readonly submitLabel: string;
  readonly initial: PageValues;
  readonly address: AddressMode;
  /** What happens to the address later, under its field. */
  readonly addressHint: string;
  readonly onSubmit: (values: PageValues) => Promise<ReadonlyArray<BatchError>>;
}) {
  const { under } = props.address;
  const [values, setValues] = useState(props.initial);
  const [addressEdited, setAddressEdited] = useState(!props.address.followsTitle);
  const [errors, setErrors] = useState<ReadonlyArray<BatchError>>([]);
  const mutation = useMutation({
    mutationFn: props.onSubmit,
    onSuccess: (found) => {
      setErrors(found);
      if (found.length === 0) props.onOpenChange(false);
    },
  });
  const titleId = useId();
  const pathId = useId();

  const titleProblem = values.title.trim() === "" ? "Give the page a title." : undefined;
  const address = under === null ? decodePath(values.address) : decodeSlug(values.address);
  const pathProblem = Option.isSome(address)
    ? undefined
    : under === null
      ? "Use / followed by lowercase letters, numbers and hyphens, such as /summer-school."
      : "Use lowercase letters, numbers and hyphens, such as dates-announced.";
  const errorsFor = (predicate: (error: BatchError) => boolean) =>
    errors.filter(predicate).map((error) => ({ message: error.message }));
  const titleErrors = errorsFor((error) => error.path[0] === "title");
  const pathErrors = [
    ...(pathProblem !== undefined && values.address !== "" ? [{ message: pathProblem }] : []),
    ...errorsFor((error) => error.rule === "path-taken"),
  ];
  const otherErrors = errorsFor(
    (error) => error.path[0] !== "title" && error.rule !== "path-taken",
  );

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (titleProblem === undefined && Option.isSome(address))
              mutation.mutate({ title: values.title.trim(), address: address.value });
          }}
          className="flex flex-col gap-6"
          noValidate
        >
          <DialogHeader>
            <DialogTitle>{props.heading}</DialogTitle>
            <DialogDescription>{props.description}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={titleErrors.length > 0 || undefined}>
              <FieldLabel htmlFor={titleId}>Title</FieldLabel>
              <Input
                id={titleId}
                value={values.title}
                maxLength={70}
                required
                aria-invalid={titleErrors.length > 0 || undefined}
                onChange={(event) => {
                  const title = event.target.value;
                  setValues((current) => ({
                    title,
                    address: addressEdited
                      ? current.address
                      : `${under === null ? "/" : ""}${slugFor(title) ?? ""}`,
                  }));
                }}
              />
              <FieldDescription>Shown in search results and browser tabs.</FieldDescription>
              <FieldError errors={titleErrors} />
            </Field>
            <Field data-invalid={pathErrors.length > 0 || undefined}>
              <FieldLabel htmlFor={pathId}>Address</FieldLabel>
              {under === null ? (
                <Input
                  id={pathId}
                  value={values.address}
                  required
                  spellCheck={false}
                  aria-invalid={pathErrors.length > 0 || undefined}
                  onChange={(event) => {
                    setAddressEdited(true);
                    setValues((current) => ({ ...current, address: event.target.value }));
                  }}
                />
              ) : (
                <InputGroup>
                  <InputGroupAddon>
                    <InputGroupText>{entryAddress(under, "")}</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id={pathId}
                    value={values.address}
                    required
                    spellCheck={false}
                    aria-invalid={pathErrors.length > 0 || undefined}
                    onChange={(event) => {
                      setAddressEdited(true);
                      setValues((current) => ({ ...current, address: event.target.value }));
                    }}
                  />
                </InputGroup>
              )}
              <FieldDescription>{props.addressHint}</FieldDescription>
              <FieldError errors={pathErrors} />
            </Field>
            <FieldError errors={otherErrors} />
            {mutation.error !== null && (
              <FieldError>{mutation.error.message} Your changes weren't saved.</FieldError>
            )}
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending || titleProblem !== undefined || pathProblem !== undefined
              }
            >
              {props.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
