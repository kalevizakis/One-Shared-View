import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { CyclePicker } from "@/components/portfolio/cycle-picker";
import { ReportBuilder } from "@/components/reports/report-builder";
import {
  buildPortfolioMetrics,
  getCycleById,
  getDecisionsForCycleProjects,
  getProjectsWithContext,
  getReportById,
  getReportingCycles,
  getReportsForCycle,
  getSessionContext,
} from "@/lib/data/queries";
import { canManageReporting, canViewReports } from "@/lib/domain/status";

interface PageProps {
  searchParams: Promise<{ cycle?: string; report?: string }>;
}

export default function ReportsPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<ReportSkeleton />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

async function Reports({ searchParams }: PageProps) {
  const { cycle: cycleParam, report: reportParam } = await searchParams;
  const session = await getSessionContext();
  if (!session) return null;
  if (!canViewReports(session.profile.role)) redirect("/");

  const [cycles, cycle] = await Promise.all([
    getReportingCycles(),
    getCycleById(cycleParam),
  ]);

  if (!cycle) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
        <h1 className="text-lg font-bold">Nothing to report on yet</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          A reporting cycle needs to exist before a leadership report can be
          produced.
        </p>
      </div>
    );
  }

  const [projects, versions] = await Promise.all([
    getProjectsWithContext(cycle.id),
    getReportsForCycle(cycle.id),
  ]);

  const metrics = buildPortfolioMetrics(projects);
  const decisions = await getDecisionsForCycleProjects(
    projects.map((project) => project.id),
  );

  const selected = reportParam
    ? await getReportById(reportParam)
    : (versions[0] ?? null);

  return (
    <div className="space-y-6">
      <div
        data-print="hide"
        className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"
      >
        <div>
          <p className="text-xs font-bold tracking-[0.1em] text-primary uppercase">
            Leadership reporting
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight">
            Leadership report
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Assembled from submitted updates only — every figure traces back to an
            owner.
          </p>
        </div>

        <CyclePicker cycles={cycles} selectedId={cycle.id} basePath="/reports" />
      </div>

      <ReportBuilder
        cycle={cycle}
        projects={projects}
        decisions={decisions}
        metrics={metrics}
        versions={versions}
        selected={selected}
        canManage={
          !session.isPreview && canManageReporting(session.profile.role)
        }
      />
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full max-w-md" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(290px,0.4fr)]">
        <Skeleton className="h-[640px]" />
        <Skeleton className="h-[640px]" />
      </div>
    </div>
  );
}
