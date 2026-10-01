import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/card";
import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Logo } from "@/components/logo";

/** A notice above a signed-out form: something went wrong, or something worked. */
export type Notice = {
  readonly kind: "problem" | "done";
  readonly title: string;
  readonly text: string;
};

/**
 * The frame for everything someone does before they're signed in: setting
 * Pakshi up, signing in, resetting a password and accepting an invitation.
 */
export function AccountLayout(props: {
  /** Who Pakshi is for, such as the organization's name. */
  readonly audience: string;
  readonly title: string;
  readonly description: ReactNode;
  readonly notice?: Notice | null;
  readonly footer?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-card">
      <section
        aria-label="About Pakshi"
        className="hidden flex-col bg-linear-to-b from-primary/70 via-primary/40 to-accent px-14 pt-10 pb-32 lg:flex lg:w-1/2"
      >
        <Logo />
        <p className="mt-auto max-w-xl text-4xl leading-tight font-semibold tracking-tight">
          Pakshi is where {props.audience} build and update their websites.
        </p>
      </section>
      <main className="flex grow flex-col items-center justify-center p-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>
              <h1 className="text-2xl font-semibold tracking-tight">{props.title}</h1>
            </CardTitle>
            <CardDescription>{props.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {props.notice && (
              <Alert variant={props.notice.kind === "problem" ? "destructive" : "default"}>
                {props.notice.kind === "problem" ? <CircleAlertIcon /> : <CircleCheckIcon />}
                <AlertTitle>{props.notice.title}</AlertTitle>
                <AlertDescription>{props.notice.text}</AlertDescription>
              </Alert>
            )}
            {props.children}
          </CardContent>
          {props.footer && (
            <CardFooter className="border-t text-sm text-muted-foreground">
              {props.footer}
            </CardFooter>
          )}
        </Card>
      </main>
    </div>
  );
}
