"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Info, Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HealthBadge } from "@/components/shared/health-badge";
import { saveProjectUpdate } from "@/app/actions/updates";
import { HEALTH_LABEL, formatDateTime } from "@/lib/domain/status";
import { projectUpdateSchema } from "@/lib/domain/validation";
import type {
  HealthStatus,
  Milestone,
  Profile,
  ProjectUpdate,
  ProjectWithContext,
  ReportingCycle,
} from "@/types/database";

interface UpdateFormProps {
  projects: ProjectWithContext[];
  cycle: ReportingCycle;
  people: Profile[];
  initialProjectId: string;
  existingUpdate: ProjectUpdate | null;
  nextMilestone: Milestone | null;
  readOnly: boolean;
}

interface FormState {
  projectId: string;
  health: HealthStatus;
  executiveSummary: string;
  accomplishments: string;
  nextSteps: string;
  blockerOrRisk: string;
  leadershipAsk: string;
  healthChangeReason: string;
  nextAction: string;
  nextActionOwnerProfileId: string;
  nextMilestoneName: string;
  nextMilestoneDate: string;
}

export function UpdateForm({
  projects,
  cycle,
  people,
  initialProjectId,
  existingUpdate,
  nextMilestone,
  readOnly,
}: UpdateFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState<FormState>({
    projectId: initialProjectId,
    health: existingUpdate?.health ?? "on_track",
    executiveSummary: existingUpdate?.executive_summary ?? "",
    accomplishments: existingUpdate?.accomplishments ?? "",
    nextSteps: existingUpdate?.next_steps ?? "",
    blockerOrRisk: existingUpdate?.blocker_or_risk ?? "",
    leadershipAsk: existingUpdate?.leadership_ask ?? "",
    healthChangeReason: existingUpdate?.health_change_reason ?? "",
    nextAction: existingUpdate?.next_action ?? "",
    nextActionOwnerProfileId: existingUpdate?.next_action_owner_profile_id ?? "",
    nextMilestoneName:
      existingUpdate?.next_milestone_name ?? nextMilestone?.name ?? "",
    nextMilestoneDate:
      existingUpdate?.next_milestone_date ?? nextMilestone?.target_date ?? "",
  });

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === form.projectId),
    [projects, form.projectId],
  );

  const needsExceptionDetail =
    form.health === "at_risk" || form.health === "blocked";
  const needsNextAction = form.health === "blocked";
  const alreadySubmitted = existingUpdate?.status === "submitted";

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  }

  function handleProjectChange(projectId: string) {
    router.push(`/my-update?cycle=${cycle.id}&project=${projectId}`);
  }

  function submit(intent: "draft" | "submit") {
    const payload = {
      projectId: form.projectId,
      reportingCycleId: cycle.id,
      health: form.health,
      executiveSummary: form.executiveSummary,
      accomplishments: form.accomplishments,
      nextSteps: form.nextSteps,
      blockerOrRisk: form.blockerOrRisk,
      leadershipAsk: form.leadershipAsk,
      healthChangeReason: form.healthChangeReason,
      nextAction: form.nextAction,
      nextActionOwnerProfileId: form.nextActionOwnerProfileId || null,
      nextMilestoneName: form.nextMilestoneName,
      nextMilestoneDate: form.nextMilestoneDate,
      intent,
    };

    const parsed = projectUpdateSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const key = String(issue.path[0] ?? "form");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      });
      setErrors(fieldErrors);
      toast.error("Some required information is missing.");
      return;
    }

    setErrors({});
    const formData = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      formData.set(key, value == null ? "" : String(value));
    });

    startTransition(async () => {
      const result = await saveProjectUpdate(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Saved.");
      if (intent === "submit") router.push("/reports");
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.65fr)]">
      <form
        className="rounded-xl border border-border bg-card p-5 sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          submit("submit");
        }}
      >
        {readOnly ? (
          <Alert className="mb-5">
            <Info className="size-4" />
            <AlertDescription>
              You have read-only access to this project, so this update cannot be
              changed.
            </AlertDescription>
          </Alert>
        ) : null}

        {alreadySubmitted && !readOnly ? (
          <Alert className="mb-5">
            <Info className="size-4" />
            <AlertDescription>
              Submitted {formatDateTime(existingUpdate.submitted_at)}. Any change
              you make now is recorded in the audit history as an edit after
              submission.
            </AlertDescription>
          </Alert>
        ) : null}

        <fieldset disabled={readOnly || pending} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Project" htmlFor="project" error={errors.projectId}>
              <Select value={form.projectId} onValueChange={handleProjectChange}>
                <SelectTrigger id="project">
                  <SelectValue placeholder="Select a project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Overall health" htmlFor="health" error={errors.health}>
              <Select
                value={form.health}
                onValueChange={(value) => set("health", value as HealthStatus)}
              >
                <SelectTrigger id="health">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(HEALTH_LABEL) as HealthStatus[]
                  ).map((value) => (
                    <SelectItem key={value} value={value}>
                      {HEALTH_LABEL[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field
            label="Executive summary"
            htmlFor="executiveSummary"
            hint="Write the one message leadership should remember."
            error={errors.executiveSummary}
            required
          >
            <Textarea
              id="executiveSummary"
              value={form.executiveSummary}
              onChange={(event) => set("executiveSummary", event.target.value)}
              rows={4}
              maxLength={1200}
              aria-invalid={Boolean(errors.executiveSummary)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Accomplished this period" htmlFor="accomplishments">
              <Textarea
                id="accomplishments"
                value={form.accomplishments}
                onChange={(event) => set("accomplishments", event.target.value)}
                rows={4}
              />
            </Field>

            <Field label="Next planned work" htmlFor="nextSteps">
              <Textarea
                id="nextSteps"
                value={form.nextSteps}
                onChange={(event) => set("nextSteps", event.target.value)}
                rows={4}
              />
            </Field>
          </div>

          {needsExceptionDetail ? (
            <div className="space-y-5 rounded-lg border border-status-at-risk/40 bg-status-at-risk-bg/40 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-status-at-risk">
                <AlertCircle className="size-4" aria-hidden />
                {HEALTH_LABEL[form.health]} projects need the detail below
              </p>

              <Field
                label="Blocker or risk"
                htmlFor="blockerOrRisk"
                error={errors.blockerOrRisk}
                required
              >
                <Textarea
                  id="blockerOrRisk"
                  value={form.blockerOrRisk}
                  onChange={(event) => set("blockerOrRisk", event.target.value)}
                  rows={2}
                  aria-invalid={Boolean(errors.blockerOrRisk)}
                />
              </Field>

              <Field
                label="Leadership ask"
                htmlFor="leadershipAsk"
                hint="What decision or support do you need, and by when?"
                error={errors.leadershipAsk}
                required
              >
                <Textarea
                  id="leadershipAsk"
                  value={form.leadershipAsk}
                  onChange={(event) => set("leadershipAsk", event.target.value)}
                  rows={2}
                  aria-invalid={Boolean(errors.leadershipAsk)}
                />
              </Field>

              <Field
                label={`Reason for ${HEALTH_LABEL[form.health]}`}
                htmlFor="healthChangeReason"
                error={errors.healthChangeReason}
                required
              >
                <Input
                  id="healthChangeReason"
                  value={form.healthChangeReason}
                  onChange={(event) =>
                    set("healthChangeReason", event.target.value)
                  }
                  aria-invalid={Boolean(errors.healthChangeReason)}
                />
              </Field>

              {needsNextAction ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Next action"
                    htmlFor="nextAction"
                    error={errors.nextAction}
                    required
                  >
                    <Input
                      id="nextAction"
                      value={form.nextAction}
                      onChange={(event) => set("nextAction", event.target.value)}
                      aria-invalid={Boolean(errors.nextAction)}
                    />
                  </Field>

                  <Field
                    label="Accountable owner"
                    htmlFor="nextActionOwner"
                    error={errors.nextActionOwnerProfileId}
                    required
                  >
                    <Select
                      value={form.nextActionOwnerProfileId}
                      onValueChange={(value) =>
                        set("nextActionOwnerProfileId", value)
                      }
                    >
                      <SelectTrigger id="nextActionOwner">
                        <SelectValue placeholder="Select an owner" />
                      </SelectTrigger>
                      <SelectContent>
                        {people.map((person) => (
                          <SelectItem key={person.id} value={person.id}>
                            {person.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Next milestone" htmlFor="nextMilestoneName">
              <Input
                id="nextMilestoneName"
                value={form.nextMilestoneName}
                onChange={(event) => set("nextMilestoneName", event.target.value)}
              />
            </Field>

            <Field label="Target date" htmlFor="nextMilestoneDate">
              <Input
                id="nextMilestoneDate"
                type="date"
                value={form.nextMilestoneDate}
                onChange={(event) => set("nextMilestoneDate", event.target.value)}
              />
            </Field>
          </div>
        </fieldset>

        {!readOnly ? (
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
              {alreadySubmitted ? "Resubmit update" : "Submit update"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => submit("draft")}
            >
              <Save className="size-4" />
              Save draft
            </Button>
            <p className="text-xs text-muted-foreground">
              Drafts are saved to the database, so nothing is lost on refresh.
            </p>
          </div>
        ) : null}
      </form>

      <aside className="space-y-4">
        <div className="rounded-xl bg-secondary p-5">
          <h2 className="text-base font-bold">One update, three outputs</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Your answers refresh the portfolio dashboard, the leadership report,
            and this project&apos;s reporting history.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-bold">Live summary</h2>
            <HealthBadge health={form.health} />
          </div>

          <h3 className="mt-3 text-sm font-bold">
            {selectedProject?.name ?? "Select a project"}
          </h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {form.executiveSummary || "Your executive summary appears here."}
          </p>

          {form.leadershipAsk ? (
            <>
              <hr className="my-4 border-border" />
              <p className="text-[0.6875rem] font-bold tracking-wide text-muted-foreground uppercase">
                Leadership ask
              </p>
              <p className="mt-1 text-sm">{form.leadershipAsk}</p>
            </>
          ) : null}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-bold">Update quality checks</h2>
          <ul className="mt-3 space-y-2">
            <Check done={form.executiveSummary.trim().length >= 20}>
              Summary is concise and outcome-oriented
            </Check>
            <Check done={Boolean(form.nextSteps.trim())}>
              Next planned work is recorded
            </Check>
            <Check
              done={!needsExceptionDetail || Boolean(form.leadershipAsk.trim())}
            >
              A specific leadership ask is included
            </Check>
            <Check done={Boolean(form.nextMilestoneName.trim())}>
              Next milestone is on record
            </Check>
          </ul>
        </div>
      </aside>
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, htmlFor, hint, error, required, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function Check({ done, children }: { done: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span
        className={
          done
            ? "mt-0.5 font-bold text-status-on-track"
            : "mt-0.5 font-bold text-muted-foreground"
        }
        aria-hidden
      >
        {done ? "✓" : "○"}
      </span>
      <span className={done ? "text-foreground" : "text-muted-foreground"}>
        {children}
      </span>
      <span className="sr-only">{done ? "(complete)" : "(outstanding)"}</span>
    </li>
  );
}
