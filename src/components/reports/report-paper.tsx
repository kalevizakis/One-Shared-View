import { AlertTriangle } from "lucide-react";
import { HealthBadge } from "@/components/shared/health-badge";
import {
  HEALTH_LABEL,
  formatDate,
  formatShortDate,
  isStale,
  relativeDay,
} from "@/lib/domain/status";
import type {
  DecisionWithContext,
  ProjectWithContext,
  ReportConfiguration,
  ReportingCycle,
} from "@/types/database";

/** The aggregate figures a report quotes — shape matches buildPortfolioMetrics. */
export interface ReportMetrics {
  onTrack: number;
  atRisk: number;
  blocked: number;
  reportingProjects: number;
  submittedCount: number;
  missing: ProjectWithContext[];
  stale: ProjectWithContext[];
}

interface ReportPaperProps {
  title: string;
  audience: string;
  cycle: ReportingCycle;
  narrative: string;
  configuration: ReportConfiguration;
  metrics: ReportMetrics;
  projects: ProjectWithContext[];
  decisions: DecisionWithContext[];
  version?: number;
  generatedAt?: string | null;
}

/**
 * The leadership brief. Content is derived ONLY from updates submitted in the
 * selected cycle; missing and stale sources are disclosed rather than hidden.
 */
export function ReportPaper({
  title,
  audience,
  cycle,
  narrative,
  configuration,
  metrics,
  projects,
  decisions,
  version,
  generatedAt,
}: ReportPaperProps) {
  const submitted = projects.filter(
    (project) => project.currentUpdate?.status === "submitted",
  );
  const exceptions = submitted.filter(
    (project) =>
      project.currentUpdate!.health === "at_risk" ||
      project.currentUpdate!.health === "blocked",
  );
  const highlights = configuration.includeStaleUpdates
    ? submitted
    : submitted.filter(
        (project) => !isStale(project.currentUpdate!.submitted_at),
      );

  return (
    <article
      data-print="paper"
      className="rounded-xl border border-border bg-card p-6 sm:p-8"
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {audience} · {cycle.name}
            {version ? ` · Version ${version}` : ""}
          </p>
          {generatedAt ? (
            <p className="text-xs text-muted-foreground">
              Generated {formatDate(generatedAt)} from {metrics.submittedCount}{" "}
              submitted {metrics.submittedCount === 1 ? "update" : "updates"}.
            </p>
          ) : null}
        </div>

        <dl className="flex gap-6">
          <ReportStat label={HEALTH_LABEL.on_track} value={metrics.onTrack} tone="text-status-on-track" />
          <ReportStat label={HEALTH_LABEL.at_risk} value={metrics.atRisk} tone="text-status-at-risk" />
          <ReportStat label={HEALTH_LABEL.blocked} value={metrics.blocked} tone="text-status-blocked" />
        </dl>
      </header>

      <hr className="my-6 border-border" />

      <section data-print="break-avoid">
        <h3 className="text-lg font-bold">Executive readout</h3>
        <p className="mt-2 max-w-[70ch] text-sm leading-relaxed whitespace-pre-line">
          {narrative?.trim()
            ? narrative
            : buildDefaultNarrative(metrics, exceptions)}
        </p>
      </section>

      {exceptions.length > 0 ? (
        <section className="mt-6" data-print="break-avoid">
          <h3 className="text-lg font-bold">At-risk and blocked initiatives</h3>
          <div className="mt-3 space-y-3">
            {exceptions.map((project) => {
              const update = project.currentUpdate!;
              return (
                <div
                  key={project.id}
                  data-print="break-avoid"
                  className="rounded-lg border border-border border-l-[5px] border-l-status-at-risk p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-bold">{project.name}</h4>
                    <HealthBadge health={update.health} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {update.executive_summary}
                  </p>
                  {update.blocker_or_risk ? (
                    <p className="mt-2 text-sm">
                      <span className="font-semibold">Blocker: </span>
                      {update.blocker_or_risk}
                    </p>
                  ) : null}
                  {configuration.includeLeadershipAsks && update.leadership_ask ? (
                    <p className="mt-1.5 text-sm">
                      <span className="font-semibold">Ask: </span>
                      {update.leadership_ask}
                    </p>
                  ) : null}
                  {update.next_action ? (
                    <p className="mt-1.5 text-sm">
                      <span className="font-semibold">Next action: </span>
                      {update.next_action}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {decisions.length > 0 ? (
        <section className="mt-6" data-print="break-avoid">
          <h3 className="text-lg font-bold">Decisions required</h3>
          <ul className="mt-3 space-y-2">
            {decisions.map((decision) => (
              <li
                key={decision.id}
                className="rounded-lg bg-accent/60 px-4 py-3 text-sm"
              >
                <p className="font-semibold">{decision.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {decision.project?.name ?? "Portfolio"}
                  {decision.needed_by
                    ? ` · Needed by ${formatShortDate(decision.needed_by)}`
                    : ""}
                  {decision.owner ? ` · ${decision.owner.display_name}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {configuration.includeProjectDetail && highlights.length > 0 ? (
        <section className="mt-6">
          <h3 className="text-lg font-bold">Project highlights</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {highlights.map((project) => {
              const update = project.currentUpdate!;
              return (
                <div
                  key={project.id}
                  data-print="break-avoid"
                  className="rounded-lg border border-border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-bold">{project.name}</h4>
                    <HealthBadge health={update.health} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {update.executive_summary}
                  </p>
                  {configuration.includeLeadershipAsks && update.leadership_ask ? (
                    <p className="mt-2 text-sm">
                      <span className="font-semibold">Ask: </span>
                      {update.leadership_ask}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {project.owner?.display_name ?? "Unassigned"} ·{" "}
                    {relativeDay(update.submitted_at)}
                    {isStale(update.submitted_at) ? " · stale" : ""}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {metrics.missing.length > 0 || metrics.stale.length > 0 ? (
        <section className="mt-6" data-print="break-avoid">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <AlertTriangle className="size-4 text-status-at-risk" aria-hidden />
            Source coverage
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            This report draws on {metrics.submittedCount} of{" "}
            {metrics.reportingProjects} reporting projects.
          </p>
          {metrics.missing.length > 0 ? (
            <p className="mt-2 text-sm">
              <span className="font-semibold">Missing updates: </span>
              {metrics.missing.map((project) => project.name).join(", ")}
            </p>
          ) : null}
          {metrics.stale.length > 0 ? (
            <p className="mt-1.5 text-sm">
              <span className="font-semibold">Stale updates: </span>
              {metrics.stale.map((project) => project.name).join(", ")}
            </p>
          ) : null}
        </section>
      ) : null}
    </article>
  );
}

function ReportStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div>
      <dd className={`text-2xl font-bold tabular-nums ${tone}`}>{value}</dd>
      <dt className="text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

function buildDefaultNarrative(
  metrics: ReportMetrics,
  exceptions: ProjectWithContext[],
): string {
  const parts: string[] = [];

  if (metrics.blocked === 0 && metrics.atRisk === 0) {
    parts.push(
      `All ${metrics.submittedCount} reporting projects are on track for this period.`,
    );
  } else {
    parts.push(
      `Portfolio delivery is broadly stable, with ${metrics.onTrack} ${
        metrics.onTrack === 1 ? "project" : "projects"
      } on track.`,
    );
    const names = exceptions.map((project) => project.name).join(" and ");
    if (names) {
      parts.push(`The immediate focus is ${names}.`);
    }
  }

  if (metrics.missing.length > 0) {
    parts.push(
      `${metrics.missing.length} ${
        metrics.missing.length === 1 ? "project has" : "projects have"
      } not yet reported, so this readout is incomplete.`,
    );
  }

  return parts.join(" ");
}
