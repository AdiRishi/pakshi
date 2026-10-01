import { BlockExample, BlockNeed, type BlockRequests } from "@repo/contracts/studio";
import { Badge } from "@repo/ui/components/badge";
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
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Textarea } from "@repo/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Option, Schema } from "effect";
import { useId, useState } from "react";
import { toast } from "sonner";

import { formatDay } from "@/lib/dates";

import { closeBlockRequest, requestBlock } from "./functions";
import { blockRequestsQuery } from "./queries";

const decodeNeed = Schema.decodeUnknownOption(BlockNeed);
const decodeExample = Schema.decodeUnknownOption(BlockExample);
const anySite = "";

/** Asks the platform team for a block, in the person's own words. */
export function RequestBlockDialog(props: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly sites: BlockRequests["sites"];
}) {
  const ids = { need: useId(), site: useId(), example: useId() };
  const [need, setNeed] = useState("");
  const [site, setSite] = useState<string>(anySite);
  const [example, setExample] = useState("");
  const [tried, setTried] = useState(false);
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: requestBlock,
    onSuccess: () => {
      toast.success("Request sent to the platform team");
      props.onOpenChange(false);
      setNeed("");
      setExample("");
      setTried(false);
      return queryClient.invalidateQueries({ queryKey: blockRequestsQuery.queryKey });
    },
    onError: (error) => toast.error(error.message),
  });
  const decodedNeed = decodeNeed(need);
  const decodedExample = decodeExample(example);
  const needProblem = tried && Option.isNone(decodedNeed);
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            setTried(true);
            if (Option.isSome(decodedNeed) && Option.isSome(decodedExample))
              send.mutate({
                data: {
                  site: props.sites.find((candidate) => candidate.id === site)?.id ?? null,
                  need: decodedNeed.value,
                  example: decodedExample.value,
                },
              });
          }}
        >
          <DialogHeader>
            <DialogTitle>Request a new block</DialogTitle>
            <DialogDescription>
              Describe what visitors should see and do. No technical details needed.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <Field data-invalid={needProblem || undefined}>
              <FieldLabel htmlFor={ids.need}>What do you need?</FieldLabel>
              <Textarea
                id={ids.need}
                value={need}
                rows={5}
                maxLength={2000}
                aria-invalid={needProblem || undefined}
                onChange={(event) => setNeed(event.target.value)}
              />
              <FieldError
                errors={needProblem ? [{ message: "Say what visitors should see and do." }] : []}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.site}>Which site is it for?</FieldLabel>
              <NativeSelect
                id={ids.site}
                className="w-full"
                value={site}
                onChange={(event) => setSite(event.target.value)}
              >
                <NativeSelectOption value={anySite}>Any site</NativeSelectOption>
                {props.sites.map((candidate) => (
                  <NativeSelectOption key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor={ids.example}>Show an example (optional)</FieldLabel>
              <Input
                id={ids.example}
                value={example}
                maxLength={500}
                onChange={(event) => setExample(event.target.value)}
              />
              <FieldDescription>A link to a page that does something similar.</FieldDescription>
            </Field>
          </FieldGroup>
          <p className="text-sm text-muted-foreground">
            The platform team reads every request. When the new block ships, it appears in this
            catalog and Pakshi can use it on your pages.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => props.onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={send.isPending}>
              Send request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The block requests a person may see: theirs, or every one for the platform team. */
export function BlockRequestList(props: { readonly data: BlockRequests }) {
  const queryClient = useQueryClient();
  const close = useMutation({
    mutationFn: closeBlockRequest,
    onSuccess: () => {
      toast.success("Request closed");
      return queryClient.invalidateQueries({ queryKey: blockRequestsQuery.queryKey });
    },
    onError: (error) => toast.error(error.message),
  });
  const { requests, can } = props.data;
  if (requests.length === 0 && !can.close) return null;
  return (
    <section aria-labelledby="block-requests" className="flex flex-col gap-3">
      <h2 id="block-requests" className="text-lg font-semibold">
        {can.close ? "Block requests" : "Your block requests"}
      </h2>
      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one has asked for a block yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asked for</TableHead>
              <TableHead>For</TableHead>
              <TableHead>By</TableHead>
              <TableHead>
                <span className="sr-only">Status</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request) => (
              <TableRow key={request.id}>
                <TableCell className="max-w-xl whitespace-normal">
                  <p>{request.need}</p>
                  {request.example !== "" && (
                    <p className="text-muted-foreground">Example: {request.example}</p>
                  )}
                  {request.nearest !== null && (
                    <p className="text-muted-foreground">Closest block: {request.nearest}</p>
                  )}
                </TableCell>
                <TableCell>{request.site?.name ?? "Any site"}</TableCell>
                <TableCell className="text-muted-foreground">
                  {request.requestedBy.name}, {formatDay(request.requestedAt)}
                </TableCell>
                <TableCell className="text-right">
                  {request.closedAt !== null ? (
                    <Badge variant="secondary">Closed {formatDay(request.closedAt)}</Badge>
                  ) : can.close ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={close.isPending}
                      onClick={() => close.mutate({ data: { request: request.id } })}
                    >
                      Close
                      <span className="sr-only"> the request from {request.requestedBy.name}</span>
                    </Button>
                  ) : (
                    <Badge variant="outline">Open</Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
