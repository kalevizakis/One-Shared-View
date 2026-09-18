"use client";

import { useTransition } from "react";
import { BellRing, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { sendReminder } from "@/app/actions/updates";
import { CYCLE_STATUS_LABEL, formatDateTime } from "@/lib/domain/status";
import type {
  ProjectWithContext,
  Reminder,
  ReportingCycle,
} from "@/types/database";

interface ReportingReadinessProps {
  cycle: ReportingCycle;
  completeness: number;
  submittedCount: number;
  reportingProjects: number;
  missing: ProjectWithContext[];
  staleCount: number;
  reminders: Reminder[];
  canSendReminders: boolean;
}

export function ReportingReadiness({
  cycle,
  completeness,
  submittedCount,
  reportingProjects,
  missing,
  staleCount,
  reminders,
  canSendReminders,
}: ReportingReadinessProps) {
  const [pending, startTransition] = useTransition();

  const remindedProfileIds = new Set(
    reminders.map((reminder) => reminder.recipient_profile_id),
  );

  function handleRemind(project: ProjectWithContext) {
    if (!project.owner) return;

    const formData = new FormData();
    formData.set("recipientProfileId", project.owner.id);
    formData.set("reportingCycleId", cycle.id);
    formData.set("projectId", project.id);
    formData.set(
      "message",
      `Your weekly update for ${project.name} is outstanding for ${cycle.name}.`,
    );

    startTransition(async () => {
      const result = await sendReminder(formData);
      if (result.error) toast.error(result.error);
      else toast.success(`Reminder sent to ${project.owner?.display_name}.`);
    });
  }

  return (
    <div className="rounded-xl bg-secondary p-5">
      <h2 className="text-lg font-bold">Reporting readiness</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        {cycle.name} · {CYCLE_STATUS_LABEL[cycle.status]} · closes{" "}
        {formatDateTime(cycle.closes_at)}
      </p>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold tabular-nums">{completeness}%</p>
          <p className="text-xs text-muted-foreground">
            {submittedCount} of {reportingProjects} owner updates received
          </p>
        </div>
        {staleCount > 0 ? (
          <div className="text-right">
            <p className="text-3xl font-bold tabular-nums text-status-at-risk">
              {staleCount}
            </p>
            <p className="text-xs text-muted-foreground">
              stale {staleCount === 1 ? "update" : "updates"}
            </p>
          </div>
        ) : null}
      </div>

      <Progress
        value={completeness}
        className="mt-3.5 h-2"
        aria-label={`Reporting completeness ${completeness} percent`}
      />

      <div className="mt-4 space-y-2">
        {missing.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-status-on-track">
            <CheckCircle2 className="size-4" aria-hidden />
            Every project has reported this cycle.
          </p>
        ) : (
          <>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              Outstanding
            </p>
            {missing.map((project) => {
              const reminded = project.owner
                ? remindedProfileIds.has(project.owner.id)
                : false;

              return (
                <div
                  key={project.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {project.name}
                    </p>
                    <p className="truncate text-[0.6875rem] text-muted-foreground">
                      {project.owner?.display_name ?? "No owner assigned"}
                    </p>
                  </div>
                  {canSendReminders && project.owner ? (
                    <Button
                      size="sm"
                      variant={reminded ? "ghost" : "outline"}
                      className="shrink-0"
                      disabled={pending || reminded}
                      onClick={() => handleRemind(project)}
                    >
                      {pending ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : reminded ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : (
                        <BellRing className="size-3.5" />
                      )}
                      {reminded ? "Reminded" : "Remind"}
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
