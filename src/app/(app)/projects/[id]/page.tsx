import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HealthBadge } from "@/components/shared/health-badge";
import { UpdateHistory } from "@/components/projects/update-history";
import {
  getCurrentCycle,
  getMilestones,
  getProfiles,
  getProjectById,
  getProjectDecisions,
  getReportingCycles,
  getSessionContext,
  getUpdateHistory,
} from "@/lib/data/queries";
import {
  LIFECYCLE_LABEL,
  MILESTONE_STATUS_LABEL,
  canEditProject,
  formatShortDate,
  isOverdue,
  relativeDay,
} from "@/lib/domain/status";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await getSessionContext();
  if (!session) return null;

  const project = await getProjectById(id);
  if (!project) notFound();

  const [updates, milestones, decisions, people, cycles, currentCycle] =
    await Promise.all([
      getUpdateHistory(id),
      getMilestones(id),
      getProjectDecisions(id),
      getProfiles(),
      getReportingCycles(),
      getCurrentCycle(),
    ]);

  const owner = people.find((person) => person.id === project.owner_profile_id);
  const lead = people.find((person) => person.id === project.lead_profile_id);
  const latest = updates.find((update) => update.status === "submitted") ?? null;
  const openDecisions = decisions.filter((decision) => decision.status === "open");

  const canEdit = canEditProject(
    session.profile.role,
    session.profile.id,
    project.owner_profile_id,
    project.lead_profile_id,
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to portfolio
        </Link>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            {latest ? (
              <HealthBadge health={latest.health} />
            ) : project.current_health ? (
              <HealthBadge health={project.current_health} />
            ) : null}
          </div>
          <p className="mt-2 max-w-[70ch] text-sm text-muted-foreground">
            {project.description ?? "No description recorded for this project."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Owner: {owner?.display_name ?? "Unassigned"}
            {owner ? ` (${owner.ntid})` : ""} · Lead:{" "}
            {lead?.display_name ?? "Unassigned"} ·{" "}
            {LIFECYCLE_LABEL[project.lifecycle_status]}
            {latest?.submitted_at
              ? ` · Last update ${relativeDay(latest.submitted_at)}`
              : " · No update submitted"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && currentCycle ? (
            <Button asChild>
              <Link href={`/my-update?cycle=${currentCycle.id}&project=${project.id}`}>
                <Pencil className="size-4" />
                Update this project
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="outline">
            <Link href="/reports">
              <FileText className="size-4" />
              Leadership report
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(290px,0.7fr)]">
        <UpdateHistory updates={updates} cycles={cycles} people={people} />

        <aside className="space-y-4">
          <section
            aria-labelledby="milestones-heading"
            className="rounded-xl border border-border bg-card p-5"
          >
            <h2 id="milestones-heading" className="text-lg font-bold">
              Milestones
            </h2>
            {milestones.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No milestones recorded.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {milestones.map((milestone) => {
                  const overdue =
                    milestone.status !== "complete" &&
                    isOverdue(milestone.target_date);
                  return (
                    <li key={milestone.id} className="py-2.5">
                      <p className="text-sm font-semibold">{milestone.name}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock className="size-3.5 shrink-0" aria-hidden />
                        {formatShortDate(milestone.target_date)} ·{" "}
                        {MILESTONE_STATUS_LABEL[milestone.status]}
                        {overdue ? " · Overdue" : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section
            aria-labelledby="project-decisions-heading"
            className="rounded-xl border border-border bg-card p-5"
          >
            <h2 id="project-decisions-heading" className="text-lg font-bold">
              Decisions required
            </h2>
            {openDecisions.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nothing is currently awaiting a leadership decision.
              </p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {openDecisions.map((decision) => {
                  const decisionOwner = people.find(
                    (person) => person.id === decision.decision_owner_profile_id,
                  );
                  return (
                    <li
                      key={decision.id}
                      className="rounded-lg bg-accent/60 px-3.5 py-2.5"
                    >
                      <p className="text-sm font-semibold">{decision.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {decision.needed_by
                          ? `Needed by ${formatShortDate(decision.needed_by)}`
                          : "No date set"}
                        {decisionOwner ? ` · ${decisionOwner.display_name}` : ""}
                        {isOverdue(decision.needed_by) ? " · Overdue" : ""}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-xl bg-secondary p-5">
            <h2 className="text-base font-bold">Audit trail</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Every change to this project and its updates is recorded with the
              NTID that made it.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link href={`/audit?entity=project_updates`}>View audit history</Link>
            </Button>
          </section>
        </aside>
      </div>
    </div>
  );
}
