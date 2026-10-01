import { authBasePath } from "@repo/contracts/accounts";
import { Button } from "@repo/ui/components/button";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Option, Schema } from "effect";

import { AccountLayout } from "@/features/accounts/account-layout";
import { FormField } from "@/features/accounts/form-field";
import { getOrganization } from "@/features/session/functions";
import { postToStudioApi, readForm, redirectTo } from "@/server/forward";

export const Route = createFileRoute("/forgot-password")({
  validateSearch: Schema.toStandardSchemaV1(
    Schema.Struct({ sent: Schema.optionalKey(Schema.Literal("yes")) }),
  ),
  loader: async () => {
    const organization = await getOrganization();
    if (organization === null) throw redirect({ to: "/set-up" });
    return { organization: organization.name };
  },
  head: () => ({ meta: [{ title: "Reset your password · Pakshi" }] }),
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await readForm(request, Schema.Struct({ email: Schema.String }));
        // Better Auth answers the same whether or not the address has an account.
        if (Option.isSome(form))
          await postToStudioApi(request, `${authBasePath}/request-password-reset`, {
            email: form.value.email,
            redirectTo: new URL("/reset-password", request.url).href,
          });
        return redirectTo(request, "/forgot-password?sent=yes");
      },
    },
  },
  component: function ForgotPassword() {
    const { organization } = Route.useLoaderData();
    const { sent } = Route.useSearch();
    return (
      <AccountLayout
        audience={`${organization} teams`}
        title="Reset your password"
        description="We'll email you a link to choose a new password."
        notice={
          sent === undefined
            ? null
            : {
                kind: "done",
                title: "Check your email",
                text: "If that address has a Pakshi account, a link to reset its password is on its way. It works for one hour.",
              }
        }
        footer={
          <Link to="/sign-in" className="text-primary underline">
            Back to sign in
          </Link>
        }
      >
        <form method="post" className="flex flex-col gap-5">
          <FormField label="Email" name="email" type="email" autoComplete="email" />
          <Button type="submit" size="lg" className="h-11 font-bold">
            Send the link
          </Button>
        </form>
      </AccountLayout>
    );
  },
});
