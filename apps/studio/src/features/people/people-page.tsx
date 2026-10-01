import type { Viewer } from "@repo/contracts/studio";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { describeGrant } from "@/features/accounts/describe";
import { formatDay } from "@/lib/dates";

import { withdrawInvitation } from "./functions";
import { InviteDialog } from "./invite-dialog";
import { peopleQuery } from "./queries";

/** Everyone who can use Studio, with what they hold, and the invitations still waiting. */
export function PeoplePage(props: { readonly viewer: Viewer }) {
  const { data } = useSuspenseQuery(peopleQuery);
  const [inviting, setInviting] = useState(false);
  const queryClient = useQueryClient();
  const withdraw = useMutation({
    mutationFn: withdrawInvitation,
    onSuccess: () => {
      toast.success("Invitation withdrawn");
      return queryClient.invalidateQueries({ queryKey: peopleQuery.queryKey });
    },
  });
  return (
    <AppShell viewer={props.viewer}>
      <header className="flex flex-col gap-2 bg-accent px-10 pt-6 pb-8">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="text-3xl font-semibold tracking-tight">People</h1>
          {data.places.length > 0 && (
            <Button className="ml-auto" onClick={() => setInviting(true)}>
              <UserPlusIcon />
              Invite someone
            </Button>
          )}
        </div>
        <p className="text-secondary-foreground">
          Everyone who can use Studio at {props.viewer.organization}. People join when someone
          invites them.
        </p>
      </header>
      <div className="flex flex-col gap-10 px-10 py-8">
        <section aria-labelledby="members" className="flex flex-col gap-3">
          <h2 id="members" className="text-lg font-semibold">
            {data.members.length === 1 ? "1 person" : `${data.members.length} people`}
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Person</TableHead>
                <TableHead>Access</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.members.map((member) => (
                <TableRow key={member.person.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {member.person.name}
                        {member.person.id === props.viewer.user.id && " (you)"}
                      </span>
                      <span className="text-muted-foreground">{member.person.email}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <ul className="flex flex-wrap gap-2">
                      {member.grants.map((grant) => (
                        <li
                          key={`${grant.role}:${grant.scope.kind === "organization" ? "" : grant.scope.id}`}
                        >
                          <Badge variant="secondary">
                            {describeGrant(grant.role, grant.scope)}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
        {data.invitations.length > 0 && (
          <section aria-labelledby="invitations" className="flex flex-col gap-3">
            <h2 id="invitations" className="text-lg font-semibold">
              Invited, not joined yet
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Invited by</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">{invitation.email}</TableCell>
                    <TableCell>{describeGrant(invitation.role, invitation.scope)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {invitation.invitedBy.name}, link works until{" "}
                      {formatDay(invitation.expiresAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={withdraw.isPending}
                        onClick={() => withdraw.mutate({ data: { invitation: invitation.id } })}
                      >
                        Withdraw
                        <span className="sr-only"> the invitation for {invitation.email}</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}
      </div>
      <InviteDialog open={inviting} onOpenChange={setInviting} places={data.places} />
    </AppShell>
  );
}
