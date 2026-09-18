import { HealthBadge } from "@/components/shared/health-badge";
import {
  UPDATE_STATUS_LABEL,
  formatDateTime,
  relativeDay,
} from "@/lib/domain/status";
import type { Profile, ProjectUpdate, ReportingCycle } from "@/types/database";

interface UpdateHistoryProps {
  updates: ProjectUpdate[];
  cycles: ReportingCycle[];
  people: Profile[];
}

/** The project's reporting history: who said what, when, and in which cycle. */
export function UpdateHistory({ updates, cycles, people }: UpdateHistoryProps) {
  const cycleName = (id: string) =>
    cycles.find((cycle) => cycle.id === id)?.name ?? "Unknown period";
  const authorName = (id: string | null) =>
    people.find((person) => person.id === id)?.display_name ?? "Unknown author";
  const authorNtid = (id: string | null) =>
    people.find((person) => person.id === id)?.ntid ?? null;

  return (
    <section
      aria-labelledby="history-heading"
      className="rounded-xl border border-border bg-card p-5 sm:p-6"
    >
      <h2 id="history-heading" className="text-lg font-bold">
        Reporting history
      </h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Every submitted and drafted update, newest first.
      </p>

      {updates.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          No updates have been recorded for this project yet.
        </p>
      ) : (
        <ol className="mt-4 space-y-4">
          {updates.map((update) => {
            const ntid = authorNtid(update.author_profile_id);
            return (
              <li
                key={update.id}
                className="border-l-2 border-border pl-4 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold">
                    {cycleName(update.reporting_cycle_id)}
                  </h3>
                  <HealthBadge health={update.health} />
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[0.6875rem] font-semibold">
                    {UPDATE_STATUS_LABEL[update.status]}
                  </span>
                  {update.revision > 1 ? (
                    <span className="text-[0.6875rem] text-muted-foreground">
                      Revision {update.revision}
                    </span>
                  ) : null}
                </div>

                <p className="mt-1 text-xs text-muted-foreground">
                  {authorName(update.author_profile_id)}
                  {ntid ? ` (${ntid})` : ""} ·{" "}
                  {update.submitted_at
                    ? `submitted ${formatDateTime(update.submitted_at)} (${relativeDay(update.submitted_at)})`
                    : `last saved ${formatDateTime(update.updated_at)}`}
                </p>

                <p className="mt-2 text-sm">{update.executive_summary}</p>

                <dl className="mt-2 space-y-1 text-sm">
                  <Detail label="Accomplished" value={update.accomplishments} />
                  <Detail label="Next" value={update.next_steps} />
                  <Detail label="Blocker or risk" value={update.blocker_or_risk} />
                  <Detail label="Leadership ask" value={update.leadership_ask} />
                  <Detail
                    label="Reason for health"
                    value={update.health_change_reason}
                  />
                  <Detail label="Next action" value={update.next_action} />
                </dl>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      <dt className="font-semibold">{label}:</dt>
      <dd className="text-muted-foreground">{value}</dd>
    </div>
  );
}
