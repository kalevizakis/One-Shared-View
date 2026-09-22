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
  getProfileContacts,
  getProfiles,
  getProjectsWithContext,
  getRemindersForCycle,
  getReportingCycles,
  getSessionContext,
} from "@/lib/data/queries";
import { publicAppUrl } from "@/lib/domain/mail";
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

  const canSendReminders =
    !session.isPreview && canManageReporting(session.profile.role);
  const canViewReadiness = canSendReminders || session.isPreview;

  const [projects, profiles, reminders, contacts] = await Promise.all([
    getProjectsWithContext(cycle.id),
    getProfiles(),
    canSendReminders
      ? getRemindersForCycle(cycle.id)
      : Promise.resolve([]),
    canSendReminders
      ? getProfileContacts()
      : Promise.resolve({} as Record<string, never>),
  ]);

  const contactEmails: Record<string, string> = {};
  for (const contact of Object.values(contacts)) {
    contactEmails[contact.profile_id] = contact.email;
  }

  const metrics = buildPortfolioMetrics(projects);
  const decisions = await getOpenDecisions();

  const blockedProject = projects.find(
    (project) =>
      project.currentUpdate?.status === "submitted" &&
      project.currentUpdate.health === "blocked",
  );

  const owners = profiles.filter((profile) =>
    projects.some((project) => project.owner_profile_id === profile.id),
  );

  const isExec = session.profile.role === "exec";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">
            Portfolio Project Status Intelligence
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            A current view of Project delivery, risks, blocks, decisions, and
            leadership asks.
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

      {canViewReadiness ? (
        <ReportingReadiness
          cycle={cycle}
          completeness={metrics.completeness}
          currentSubmittedCount={metrics.currentSubmittedCount}
          reportingProjects={metrics.reportingProjects}
          outstanding={metrics.readinessOutstanding}
          staleCount={metrics.stale.length}
          reminders={reminders}
          contactEmails={contactEmails}
          appUrl={publicAppUrl()}
          canSendReminders={canSendReminders}
        />
      ) : null}

      <ProjectTable projects={projects} owners={owners} />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        {blockedProject ? <ExceptionCallout project={blockedProject} /> : null}
        <div className={blockedProject ? undefined : "xl:col-start-2"}>
          <UpcomingDecisions decisions={decisions} />
        </div>
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
      <Skeleton className="h-[180px]" />
      <Skeleton className="h-[420px]" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <Skeleton className="h-[220px]" />
        <Skeleton className="h-[220px]" />
      </div>
    </div>
  );
}
