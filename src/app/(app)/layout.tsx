import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { AccessProblem } from "@/components/layout/access-problem";
import { getSessionContext, SessionUnavailableError } from "@/lib/data/queries";
import type { SessionContext } from "@/lib/data/queries";

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  let session: SessionContext | null;

  try {
    session = await getSessionContext();
  } catch (error) {
    // The session is valid but the roster is unreadable. Redirecting to /login
    // here would fight the middleware and spin forever, so explain it instead.
    if (error instanceof SessionUnavailableError) {
      return <AccessProblem reason={error.reason} />;
    }
    throw error;
  }

  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <AppHeader profile={session.profile} />
      <main
        id="main-content"
        className="mx-auto w-full max-w-[1540px] flex-1 px-4 py-7 sm:px-6 lg:px-10 lg:py-9"
      >
        {children}
      </main>
      <footer
        data-print="hide"
        className="border-t border-border bg-card py-5"
      >
        <div className="mx-auto max-w-[1540px] px-4 text-xs text-muted-foreground sm:px-6 lg:px-10">
          One Shared View · Internal delivery reporting for the CMO Digital LT.
          Access is limited to the roster and every change is recorded in the
          audit trail.
        </div>
      </footer>
    </div>
  );
}
