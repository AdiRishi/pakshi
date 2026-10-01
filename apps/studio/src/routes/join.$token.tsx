import {
  accountsPaths,
  AccountRefusal,
  InvitationToken,
  passwordLength,
} from "@repo/contracts/accounts";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { createFileRoute, Link } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { Option, Schema } from "effect";

import { AccountLayout, type Notice } from "@/features/accounts/account-layout";
import { describeGrant } from "@/features/accounts/describe";
import { FormField } from "@/features/accounts/form-field";
import { getInvitation, getOrganization, getViewer } from "@/features/session/functions";
import { postToStudioApi, readForm, redirectTo } from "@/server/forward";
import { callStudio } from "@/server/studio-rpc";

const decodeToken = Schema.decodeUnknownOption(InvitationToken);
const decodeRefusal = Schema.decodeUnknownOption(Schema.fromJsonString(AccountRefusal));

/** Accepting as the signed-in person, or making the account the invitation is for. */
const JoinForm = Schema.Union([
  Schema.Struct({ intent: Schema.Literal("accept") }),
  Schema.Struct({ intent: Schema.Literal("join"), name: Schema.String, password: Schema.String }),
]);

const problems = {
  failed: {
    kind: "problem",
    title: "Joining didn't finish",
    text: "Pakshi couldn't make your account just now. Try again in a moment.",
  },
  invalid: {
    kind: "problem",
    title: "Check the details",
    text: `Enter your name and a password of at least ${passwordLength.min} characters.`,
  },
} as const satisfies Record<string, Notice>;

/**
 * An invitation's link. Someone new makes their account here; someone with an
 * account signs in and accepts it. Either way they get the invitation's grant.
 */
export const Route = createFileRoute("/join/$token")({
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({ error: Schema.optionalKey(Schema.Literals(["failed", "invalid"])) }),
  ),
  loader: async ({ params }) => {
    const token = decodeToken(params.token);
    const [organization, viewer, invitation] = await Promise.all([
      getOrganization(),
      getViewer(),
      Option.isSome(token)
        ? getInvitation({ data: { token: token.value } })
        : Promise.resolve({ _tag: "Closed" } as const),
    ]);
    return { organization: organization?.name ?? "your organization", viewer, invitation };
  },
  head: () => ({ meta: [{ title: "Join Pakshi" }] }),
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const form = await readForm(request, JoinForm);
        const back = `/join/${params.token}`;
        if (Option.isNone(form)) return redirectTo(request, `${back}?error=invalid`);
        if (form.value.intent === "accept") {
          const accepted = await callStudio({ binding: env.STUDIO_RPC, request }, (studio) =>
            studio.acceptInvitation({ token: InvitationToken.make(params.token) }),
          ).then(
            () => true,
            () => false,
          );
          return redirectTo(request, accepted ? "/" : back);
        }
        const made = await postToStudioApi(request, accountsPaths.join, {
          token: params.token,
          name: form.value.name,
          password: form.value.password,
        });
        if (made.ok) return redirectTo(request, "/", made);
        const refusal = decodeRefusal(await made.text());
        if (Option.isNone(refusal)) return redirectTo(request, `${back}?error=failed`);
        return redirectTo(
          request,
          refusal.value.reason === "invalid" ? `${back}?error=invalid` : back,
        );
      },
    },
  },
  component: function Join() {
    const { organization, viewer, invitation } = Route.useLoaderData();
    const { token } = Route.useParams();
    const { error } = Route.useSearch();
    const audience = `${organization} teams`;
    if (invitation._tag === "Closed")
      return (
        <AccountLayout
          audience={audience}
          title="This invitation doesn't work"
          description="It was used, withdrawn or has expired. Ask the person who invited you to send another."
        >
          <Link to="/sign-in" className={buttonVariants({ variant: "outline" })}>
            Go to sign in
          </Link>
        </AccountLayout>
      );
    const offer = `${invitation.invitedBy.name} invited you to ${invitation.organization} as ${describeGrant(invitation.role, invitation.scope)}.`;
    if (viewer !== null && viewer.user.email.toLowerCase() === invitation.email)
      return (
        <AccountLayout audience={audience} title="Accept the invitation" description={offer}>
          <form method="post">
            <input type="hidden" name="intent" value="accept" />
            <Button type="submit" size="lg" className="h-11 w-full font-bold">
              Accept
            </Button>
          </form>
        </AccountLayout>
      );
    if (viewer !== null)
      return (
        <AccountLayout
          audience={audience}
          title="This invitation is for someone else"
          description={`It was sent to ${invitation.email}, and you're signed in as ${viewer.user.email}. Sign out, then open the link again.`}
        >
          <form method="post" action="/sign-out">
            <Button type="submit" variant="outline" className="w-full">
              Sign out
            </Button>
          </form>
        </AccountLayout>
      );
    if (invitation.accountExists)
      return (
        <AccountLayout
          audience={audience}
          title="Sign in to accept"
          description={`${offer} You already have an account with ${invitation.email}.`}
        >
          <Link
            to="/sign-in"
            search={{ redirect: `/join/${token}` }}
            className={buttonVariants({ size: "lg", className: "h-11 font-bold" })}
          >
            Sign in
          </Link>
        </AccountLayout>
      );
    return (
      <AccountLayout
        audience={audience}
        title={`Join ${invitation.organization} on Pakshi`}
        description={offer}
        notice={error === undefined ? null : problems[error]}
      >
        <form method="post" className="flex flex-col gap-5">
          <input type="hidden" name="intent" value="join" />
          <FormField label="Email" name="email" type="email" value={invitation.email} readOnly />
          <FormField label="Your name" name="name" autoComplete="name" maxLength={80} />
          <FormField
            label="Password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={passwordLength.min}
            maxLength={passwordLength.max}
            description={`At least ${passwordLength.min} characters.`}
          />
          <Button type="submit" size="lg" className="h-11 font-bold">
            Join
          </Button>
        </form>
      </AccountLayout>
    );
  },
});
