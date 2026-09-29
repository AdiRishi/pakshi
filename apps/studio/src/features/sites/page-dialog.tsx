import type { BatchError } from "@repo/contracts/ops";
import { PagePath } from "@repo/contracts/page";
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
import { useMutation } from "@tanstack/react-query";
import { Option, Schema } from "effect";
import { useId, useState } from "react";

import { addressFor } from "./page-address";

const decodePath = Schema.decodeOption(PagePath);

export interface PageValues {
  readonly title: string;
  readonly path: string;
}

/** What the dialog submits: a filled-in title and an address that passed the address rules. */
export interface SubmittedPage {
  readonly title: string;
  readonly path: PagePath;
}

/**
 * Asks for a page's title and address, to create it or rename it. While the
 * address hasn't been edited by hand, a new page's address follows its title.
 * `onSubmit` resolves with the batch's errors, or none when it committed.
 */
export function PageDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly heading: string;
  readonly description: string;
  readonly submitLabel: string;
  readonly initial: PageValues;
  readonly addressPrefix: "/" | "/blog/" | null;
  readonly onSubmit: (values: SubmittedPage) => Promise<ReadonlyArray<BatchError>>;
}) {
  const [values, setValues] = useState(props.initial);
  const [addressEdited, setAddressEdited] = useState(props.addressPrefix === null);
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
  const path = decodePath(values.path);
  const pathProblem = Option.isSome(path)
    ? undefined
    : "Use / followed by lowercase letters, numbers and hyphens, such as /summer-school.";
  const errorsFor = (predicate: (error: BatchError) => boolean) =>
    errors.filter(predicate).map((error) => ({ message: error.message }));
  const titleErrors = errorsFor((error) => error.path[0] === "title");
  const pathErrors = [
    ...(pathProblem !== undefined && values.path !== "" ? [{ message: pathProblem }] : []),
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
            if (titleProblem === undefined && Option.isSome(path))
              mutation.mutate({ title: values.title.trim(), path: path.value });
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
                    path:
                      addressEdited || props.addressPrefix === null
                        ? current.path
                        : addressFor(props.addressPrefix, title),
                  }));
                }}
              />
              <FieldDescription>Shown in search results and browser tabs.</FieldDescription>
              <FieldError errors={titleErrors} />
            </Field>
            <Field data-invalid={pathErrors.length > 0 || undefined}>
              <FieldLabel htmlFor={pathId}>Address</FieldLabel>
              <Input
                id={pathId}
                value={values.path}
                required
                spellCheck={false}
                aria-invalid={pathErrors.length > 0 || undefined}
                onChange={(event) => {
                  setAddressEdited(true);
                  setValues((current) => ({ ...current, path: event.target.value }));
                }}
              />
              <FieldDescription>
                Menu links follow the page when its address changes.
              </FieldDescription>
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
