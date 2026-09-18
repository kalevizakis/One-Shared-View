import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { signOut } from "@/app/actions/auth";

/**
 * Shown when someone is signed in but the app cannot load their roster entry.
 * The alternative — redirecting to /login — deadlocks against the middleware,
 * which sees a valid session and sends them straight back here.
 */
export function AccessProblem({ reason }: { reason: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md space-y-5">
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>We can&apos;t open your workspace</AlertTitle>
          <AlertDescription>{reason}</AlertDescription>
        </Alert>

        <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">What to do</p>
          <p className="mt-2">
            This usually means the database setup is incomplete. Ask an
            administrator to confirm the latest database script has been run, then
            sign in again.
          </p>
        </div>

        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            Sign out and try again
          </Button>
        </form>
      </div>
    </main>
  );
}
