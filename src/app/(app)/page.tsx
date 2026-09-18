import { Suspense } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatCard } from "@/components/shared/stat-card";
import { CyclePicker } from "@/components/portfolio/cycle-picker";
import { ProjectTable } from "@/components/portfolio/project-table";
import { ReportingReadiness } from "@/components/portfolio/reporting-readiness";
import { ExceptionCallout } from "@/components/portfolio/exception-callout";
import { UpcomingDecisions } from "@/components/portfolio/upcoming-decisions";
import {
  buildPortfolioMetrics,
  getCycleById,
  getOpenDecisions,
  getProfiles,
  getProjectsWithContext,
  getRemindersForCycle,
  getReportingCycles,
  getSessionContext,
} from "@/lib/data/queries";
import { canManageReporting } from "@/lib/domain/status";

interface PageProps {
  searchParams: Promise<{ cycle?: string }>;
}

export default function PortfolioPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: PageProps) {
  const { cycle: cycleParam } = await searchParams;
  const session = await getSessionContext();
  if (!session) return null;

  const [cycles, cycle] = await Promise.all([
    getReportingCycles(),
    getCycleById(cycleParam),
  ]);

  if (!cycle) {
    return (
      <EmptyState
        title="No reporting cycle configured"
        body="An administrator needs to create a reporting cycle before updates can be collected."
      />
    );
  }

  const [projects, profiles, reminders] = await Promise.all([
    getProjectsWithContext(cycle.id),
    getProfiles(),
    getRemindersForCycle(cycle.id),
  ]);

  const metrics = buildPortfolioMetrics(projects);
  const decisions = await getOpenDecisions();

  const blockedProject = projects.find(
    (project) =>
      project.currentUpdate?.status === "submitted" &&
      project.currentUpdate.health === "blocked",
  );

  const leads = profiles.filter((profile) =>
    projects.some((project) => project.lead_profile_id === profile.id),
  );

  const isExec = session.profile.role === "exec";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.1em] text-primary uppercase">
            Delivery intelligence
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight">
            Portfolio health
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A current view of delivery, decisions, and leadership asks.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <CyclePicker cycles={cycles} selectedId={cycle.id} basePath="/" />
          {isExec ? (
            <Button asChild>
              <Link href="/reports">
                <FileText className="size-4" />
                Leadership report
              </Link>
            </Button>
          ) : (
            <Button asChild>
              <Link href={`/my-update?cycle=${cycle.id}`}>Submit update</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active projects"
          value={metrics.activeProjects}
          hint={`${metrics.reportingProjects} reporting`}
        />
        <StatCard label="On track" value={metrics.onTrack} tone="on-track" />
        <StatCard label="At risk" value={metrics.atRisk} tone="at-risk" />
        <StatCard label="Blocked" value={metrics.blocked} tone="blocked" />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <ProjectTable projects={projects} leads={leads} />

        <aside className="space-y-4">
          <ReportingReadiness
            cycle={cycle}
            completeness={metrics.completeness}
            submittedCount={metrics.submittedCount}
            reportingProjects={metrics.reportingProjects}
            missing={metrics.missing}
            staleCount={metrics.stale.length}
            reminders={reminders}
            canSendReminders={canManageReporting(session.profile.role)}
          />

          {blockedProject ? <ExceptionCallout project={blockedProject} /> : null}

          <UpcomingDecisions decisions={decisions} />
        </aside>
      </div>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full max-w-md" />
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-[96px]" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[420px]" />
      </div>
    </div>
  );
}
