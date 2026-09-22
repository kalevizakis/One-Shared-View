"use client";

import { useState, useTransition } from "react";
import { BellRing, CheckCircle2, Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { confirmReminderSent } from "@/app/actions/updates";
import { buildReminderMailto } from "@/lib/domain/mail";
import {
  CYCLE_STATUS_LABEL,
  formatDateTime,
  isStale,
} from "@/lib/domain/status";
import type {
  ProjectWithContext,
  Reminder,
  ReportingCycle,
} from "@/types/database";

interface ReportingReadinessProps {
  cycle: ReportingCycle;
  completeness: number;
  currentSubmittedCount: number;
  reportingProjects: number;
  outstanding: ProjectWithContext[];
  staleCount: number;
  reminders: Reminder[];
  /** profile_id -> verified corporate email. Empty when the viewer cannot read contacts. */
  contactEmails: Record<string, string>;
  /** Deployed app origin for the draft body, or null when unavailable / localhost. */
  appUrl: string | null;
  canSendReminders: boolean;
}

export function ReportingReadiness({
  cycle,
  completeness,
  currentSubmittedCount,
  reportingProjects,
  outstanding,
  staleCount,
  reminders,
  contactEmails,
  appUrl,
  canSendReminders,
}: ReportingReadinessProps) {
  const [pending, startTransition] = useTransition();
  /** Project ids whose mailto draft has been opened and await "Mark sent". */
  const [awaitingConfirm, setAwaitingConfirm] = useState<Set<string>>(
    () => new Set(),
  );

  // Per project + recipient for this cycle — not recipient alone — so one
  // owner's second outstanding project stays remindable.
  const remindedProjectIds = new Set(
    reminders
      .filter((reminder) => reminder.project_id)
      .map((reminder) => reminder.project_id as string),
  );

  function openDraft(project: ProjectWithContext) {
    if (!project.owner) return;
    const email = contactEmails[project.owner.id];
    if (!email) {
      toast.error(
        "No reminder email is configured for this owner. Ask an administrator to add one.",
      );
      return;
    }

    const href = buildReminderMailto(
      {
        to: email,
        projectName: project.name,
        cycleName: cycle.name,
        ownerDisplayName: project.owner.display_name,
      },
      appUrl,
    );

    // Anchor click keeps the page in place; assigning location.href can unload
    // the SPA when the OS mail client is slow to take over.
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setAwaitingConfirm((current) => new Set(current).add(project.id));
  }

  function markSent(project: ProjectWithContext) {
    if (!project.owner) return;

    const formData = new FormData();
    formData.set("recipientProfileId", project.owner.id);
    formData.set("reportingCycleId", cycle.id);
    formData.set("projectId", project.id);
    formData.set(
      "message",
      `Local email draft opened for ${project.name} (${cycle.name}); sender confirmed it was sent.`,
    );

    startTransition(async () => {
      const result = await confirmReminderSent(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Reminder recorded for ${project.owner?.display_name}.`);
      setAwaitingConfirm((current) => {
        const next = new Set(current);
        next.delete(project.id);
        return next;
      });
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
            {currentSubmittedCount} of {reportingProjects} current owner updates
            received
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
        {outstanding.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-status-on-track">
            <CheckCircle2 className="size-4" aria-hidden />
            Every project has a current update.
          </p>
        ) : (
          <>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              Outstanding
            </p>
            {outstanding.map((project) => {
              const reminded = remindedProjectIds.has(project.id);
              const composing = awaitingConfirm.has(project.id);
              const hasEmail = project.owner
                ? Boolean(contactEmails[project.owner.id])
                : false;
              const stale =
                project.currentUpdate?.status === "submitted" &&
                isStale(project.currentUpdate.submitted_at);

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
                      {stale ? " · stale update" : ""}
                      {canSendReminders && project.owner && !hasEmail
                        ? " · no reminder email"
                        : ""}
                    </p>
                  </div>
                  {canSendReminders ? (
                    !project.owner ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled
                        title="Assign a project owner before sending a notification."
                      >
                        <BellRing className="size-3.5" />
                        Notify
                      </Button>
                    ) : reminded ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="shrink-0"
                        disabled
                      >
                        <CheckCircle2 className="size-3.5" />
                        Notified
                      </Button>
                    ) : composing ? (
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Button
                          size="sm"
                          variant="default"
                          disabled={pending}
                          onClick={() => markSent(project)}
                        >
                          {pending ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="size-3.5" />
                          )}
                          Mark sent
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-auto px-1 py-0 text-[0.6875rem]"
                          disabled={pending}
                          onClick={() => openDraft(project)}
                        >
                          <Mail className="size-3" />
                          Open draft again
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        disabled={pending || !hasEmail}
                        title={
                          hasEmail
                            ? undefined
                            : "Ask an administrator to add a reminder email for this owner."
                        }
                        onClick={() => openDraft(project)}
                      >
                        <BellRing className="size-3.5" />
                        Notify
                      </Button>
                    )
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled
                      title="Notifications are disabled in read-only preview."
                    >
                      <BellRing className="size-3.5" />
                      Notify
                    </Button>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
