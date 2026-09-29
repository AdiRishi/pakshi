import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { CircleAlertIcon } from "lucide-react";

import { Logo } from "@/components/logo";

export function SignInPage(props: { readonly organizationName: string; readonly failed: boolean }) {
  return (
    <div className="flex min-h-screen bg-card">
      <section
        aria-label="About Pakshi"
        className="hidden flex-col bg-linear-to-b from-primary/70 via-primary/40 to-accent px-14 pt-10 pb-32 lg:flex lg:w-1/2"
      >
        <Logo />
        <p className="mt-auto max-w-xl text-4xl leading-tight font-semibold tracking-tight">
          Pakshi is where {props.organizationName} teams build and update their websites.
        </p>
      </section>
      <main className="flex grow flex-col items-center justify-center p-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              <h1 className="text-2xl font-semibold tracking-tight">Sign in to Pakshi</h1>
            </CardTitle>
            <CardDescription>
              Use your {props.organizationName} account. Pakshi has no separate password.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {props.failed && (
              <Alert variant="destructive">
                <CircleAlertIcon />
                <AlertTitle>Sign-in didn't finish</AlertTitle>
                <AlertDescription>Try again, or contact your IT service desk.</AlertDescription>
              </Alert>
            )}
            <a
              href="/sign-in/start"
              className={buttonVariants({ size: "lg", className: "h-11 w-full font-bold" })}
            >
              Continue with {props.organizationName} account
            </a>
          </CardContent>
          <CardFooter className="border-t text-sm text-muted-foreground">
            Can't get in? Contact the IT service desk about your account. If you can sign in but
            can't see your site, ask your team's Pakshi admin for access.
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}
