import Link from "next/link";
import { Eye } from "lucide-react";

/**
 * Persistent notice that the visitor is in the shared read-only preview.
 *
 * Deliberately NOT dismissible. The point of the banner is that a reviewer never
 * mistakes real portfolio data for sample data, and never wonders why a button
 * did nothing — a bar you can close stops doing that job the moment it is closed.
 * It is a thin strip so it costs almost no vertical space on every screen.
 *
 * `data-print="hide"` keeps it out of the leadership PDF, matching the existing
 * print convention in globals.css: the exported report is a document about the
 * portfolio, not about how it happened to be viewed.
 */
export function PreviewBanner() {
  return (
    <div
      data-print="hide"
      role="status"
      className="border-b border-status-at-risk/30 bg-status-at-risk-bg"
    >
      <div className="mx-auto flex max-w-[1540px] flex-col gap-1 px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:gap-2 sm:px-6 lg:px-10">
        <span className="flex items-center gap-1.5 font-bold text-status-at-risk">
          <Eye className="size-3.5 shrink-0" aria-hidden />
          Read-only preview
        </span>
        <span className="text-foreground/80">
          You are viewing a read-only preview of real portfolio data. Nothing you
          do here can change it.
        </span>
        {/*
          `switch=1` tells the middleware this visit to /login is intentional.
          Without it a session already exists, so /login would redirect straight
          back here and the link would be a dead end.
        */}
        <Link
          href="/login?switch=1"
          className="font-semibold text-primary underline underline-offset-2 hover:no-underline sm:ml-auto"
        >
          Sign in with your NTID to make changes
        </Link>
      </div>
    </div>
  );
}
