import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { daysSince } from "@/lib/domain/status";
import type { ProjectWithContext } from "@/types/database";

interface ExceptionCalloutProps {
  project: ProjectWithContext;
}

/** Surfaces the most urgent blocked project with its ask and accountable owner. */
export function ExceptionCallout({ project }: ExceptionCalloutProps) {
  const update = project.currentUpdate;
  const days = daysSince(update?.submitted_at ?? null);

  return (
    <div
      data-print="break-avoid"
      className="rounded-xl border border-border border-l-[6px] border-l-status-at-risk bg-card p-5"
    >
      <p className="text-[0.6875rem] font-bold tracking-[0.1em] text-status-at-risk uppercase">
        Leadership attention
      </p>
      <h2 className="mt-2 flex items-start gap-2 text-base font-bold">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-status-at-risk"
          aria-hidden
        />
        {update?.blocker_or_risk ?? `${project.name} is blocked`}
      </h2>

      <p className="mt-2 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{project.name}</span>
        {days !== null && days > 0
          ? ` has been blocked for ${days} ${days === 1 ? "day" : "days"}.`
          : " is currently blocked."}
        {update?.leadership_ask ? ` ${update.leadership_ask}` : ""}
      </p>

      {update?.next_action ? (
        <p className="mt-2 text-sm">
          <span className="font-semibold">Next action: </span>
          <span className="text-muted-foreground">{update.next_action}</span>
        </p>
      ) : null}

      <Button asChild size="sm" className="mt-4">
        <Link href={`/projects/${project.id}`}>View project</Link>
      </Button>
    </div>
  );
}
