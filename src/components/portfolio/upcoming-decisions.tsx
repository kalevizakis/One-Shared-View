import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatMonthDay, isOverdue } from "@/lib/domain/status";
import type { DecisionWithContext } from "@/types/database";

interface UpcomingDecisionsProps {
  decisions: DecisionWithContext[];
}

export function UpcomingDecisions({ decisions }: UpcomingDecisionsProps) {
  return (
    <section
      aria-labelledby="upcoming-decisions-heading"
      className="rounded-xl border border-border bg-card p-5"
    >
      <h2 id="upcoming-decisions-heading" className="text-lg font-bold">
        Upcoming decisions
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Captured across all owner updates this cycle.
      </p>

      {decisions.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No decisions are currently awaiting leadership.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {decisions.slice(0, 5).map((decision) => {
            const overdue = isOverdue(decision.needed_by);
            const date = decision.needed_by
              ? formatMonthDay(decision.needed_by)
              : null;

            return (
              <li key={decision.id} className="flex gap-3 py-3">
                <div
                  className={cn(
                    "flex size-12 shrink-0 flex-col items-center justify-center rounded-lg text-[0.625rem] font-bold leading-tight",
                    overdue
                      ? "bg-status-blocked-bg text-status-blocked"
                      : "bg-accent text-accent-foreground",
                  )}
                  aria-hidden
                >
                  {date ? (
                    <>
                      <span>{date.month}</span>
                      <span className="text-sm">{date.day}</span>
                    </>
                  ) : (
                    <span>TBD</span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-sm font-semibold">{decision.title}</p>
                  <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                    {decision.project ? (
                      <Link
                        href={`/projects/${decision.project.id}`}
                        className="hover:text-primary hover:underline"
                      >
                        {decision.project.name}
                      </Link>
                    ) : null}
                    {decision.owner ? ` · Owner: ${decision.owner.display_name}` : ""}
                    {overdue ? " · Overdue" : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
