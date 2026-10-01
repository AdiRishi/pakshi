import type { SiteId } from "@repo/contracts/ids";
import { restoreDays } from "@repo/contracts/studio";
import { Button } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui/components/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useId, useState } from "react";
import { toast } from "sonner";

import { deleteSite } from "../sites/functions";

/**
 * Deletes a site once its name is typed. It stops serving at once, and an
 * org admin can restore it for 30 days.
 */
export function DeleteSiteCard(props: {
  readonly site: { readonly id: SiteId; readonly name: string };
}) {
  const id = useId();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => deleteSite({ data: { site: props.site.id } }),
    onSuccess: async () => {
      toast.success(`${props.site.name} was deleted`, {
        description: `An org admin can restore it from Home for ${restoreDays} days.`,
      });
      await queryClient.invalidateQueries();
      await navigate({ to: "/" });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>Delete site</h3>
        </CardTitle>
        <CardDescription>
          The site goes offline at once and its domains are released. An org admin can restore it
          within {restoreDays} days; after that its drafts, releases, entries and images are deleted
          for good.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Dialog>
          <DialogTrigger render={<Button variant="destructive" />}>Delete site</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete {props.site.name}?</DialogTitle>
              <DialogDescription>
                It stops serving at once.{" "}
                <Link
                  to="/sites/$siteId/submissions"
                  params={{ siteId: props.site.id }}
                  className="underline underline-offset-4"
                >
                  Export its form entries
                </Link>{" "}
                first if you'll need them.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor={id}>Type the site's name to delete it</FieldLabel>
              <Input id={id} value={typed} onChange={(event) => setTyped(event.target.value)} />
              <FieldDescription>{props.site.name}</FieldDescription>
              {remove.error !== null && <FieldError>{remove.error.message}</FieldError>}
            </Field>
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={typed.trim() !== props.site.name || remove.isPending}
                onClick={() => remove.mutate()}
              >
                Delete site
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
