import { Suspense } from "react";
import { Lock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { CyclePicker } from "@/components/portfolio/cycle-picker";
import { UpdateForm } from "@/components/updates/update-form";
import {
  getCycleById,
  getMilestones,
  getProfiles,
  getProjectsWithContext,
  getReportingCycles,
  getSessionContext,
  getUpdateForCycle,
} from "@/lib/data/queries";
import { CYCLE_STATUS_LABEL, canEditProject } from "@/lib/domain/status";

interface PageProps {
  searchParams: Promise<{ cycle?: string; project?: string }>;
}

export default function MyUpdatePage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<FormSkeleton />}>
      <MyUpdate searchParams={searchParams} />
    </Suspense>
  );
}

async function MyUpdate({ searchParams }: PageProps) {
  const { cycle: cycleParam, project: projectParam } = await searchParams;
  const session = await getSessionContext();
  if (!session) return null;

  const [cycles, cycle] = await Promise.all([
    getReportingCycles(),
    getCycleById(cycleParam),
  ]);

  if (!cycle) {
    return (
      <Notice
        title="No reporting cycle is open"
        body="An administrator needs to open a reporting cycle before updates can be submitted."
      />
    );
  }

  const [allProjects, people] = await Promise.all([
    getProjectsWithContext(cycle.id),
    getProfiles(),
  ]);

  const { role, id: profileId } = session.profile;

  // Projects this person may report on; leads and admins see the whole portfolio.
  const editable = allProjects.filter((project) =>
    canEditProject(role, profileId, project.owner_profile_id, project.lead_profile_id),
  );
  const visible = editable.length > 0 ? editable : allProjects;

  if (visible.length === 0) {
    return (
      <Notice
        title="No projects assigned"
        body="You are not currently the owner of any project. An administrator can assign one to you."
      />
    );
  }

  const selectedProject =
    visible.find((project) => project.id === projectParam) ?? visible[0];

  const [existingUpdate, milestones] = await Promise.all([
    getUpdateForCycle(selectedProject.id, cycle.id),
    getMilestones(selectedProject.id),
  ]);

  const nextMilestone =
    milestones.find((milestone) => milestone.status !== "complete") ?? null;

  const cycleLocked = cycle.status === "locked" || cycle.status === "closed";
  const canEdit = canEditProject(
    role,
    profileId,
    selectedProject.owner_profile_id,
    selectedProject.lead_profile_id,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.1em] text-primary uppercase">
            Owner workspace
          </p>
          <h1 className="mt-1.5 text-3xl font-bold tracking-tight">
            Weekly project update
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Update once — the portfolio, the leadership report, and the project
            history all refresh automatically.
          </p>
        </div>

        <CyclePicker
          cycles={cycles}
          selectedId={cycle.id}
          basePath="/my-update"
        />
      </div>

      {cycleLocked ? (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>
            {cycle.name} is {CYCLE_STATUS_LABEL[cycle.status].toLowerCase()}.
            Updates for this period can no longer be changed.
          </AlertDescription>
        </Alert>
      ) : null}

      <UpdateForm
        projects={visible}
        cycle={cycle}
        people={people.filter((person) => person.active)}
        initialProjectId={selectedProject.id}
        existingUpdate={existingUpdate}
        nextMilestone={nextMilestone}
        readOnly={!canEdit || cycleLocked}
      />
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function FormSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full max-w-md" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
        <Skeleton className="h-[620px]" />
        <Skeleton className="h-[620px]" />
      </div>
    </div>
  );
}
