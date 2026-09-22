"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWritableSession } from "@/lib/data/queries";
import { canManageReporting } from "@/lib/domain/status";
import { projectUpdateSchema } from "@/lib/domain/validation";
import type { ActionResult } from "@/app/actions/auth";

function optional(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Saves a draft or submits a weekly update. Submission is idempotent: the row
 * is keyed on (project, cycle), so re-submitting updates the same record and
 * the audit trigger records the material change as "edit_after_submission".
 * Every submission refreshes submitted_at so portfolio freshness reflects the
 * latest published owner update rather than the first submission.
 */
export async function saveProjectUpdate(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireWritableSession();
  if ("error" in auth) return { error: auth.error };
  const { session } = auth;

  const intent = formData.get("intent") === "submit" ? "submit" : "draft";

  const parsed = projectUpdateSchema.safeParse({
    projectId: optional(formData.get("projectId")),
    reportingCycleId: optional(formData.get("reportingCycleId")),
    health: optional(formData.get("health")),
    impact: optional(formData.get("impact")),
    accomplishments: optional(formData.get("accomplishments")),
    nextSteps: optional(formData.get("nextSteps")),
    blockerOrRisk: optional(formData.get("blockerOrRisk")),
    leadershipAsk: optional(formData.get("leadershipAsk")),
    healthChangeReason: optional(formData.get("healthChangeReason")),
    nextAction: optional(formData.get("nextAction")),
    nextActionOwnerProfileId:
      optional(formData.get("nextActionOwnerProfileId")) || null,
    nextMilestoneName: optional(formData.get("nextMilestoneName")),
    nextMilestoneDate: optional(formData.get("nextMilestoneDate")),
    intent,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const input = parsed.data;
  const supabase = await createClient();

  const payload = {
    project_id: input.projectId,
    reporting_cycle_id: input.reportingCycleId,
    author_profile_id: session.profile.id,
    health: input.health,
    impact: input.impact || null,
    accomplishments: input.accomplishments || null,
    next_steps: input.nextSteps || null,
    blocker_or_risk: input.blockerOrRisk || null,
    leadership_ask: input.leadershipAsk || null,
    health_change_reason: input.healthChangeReason || null,
    next_action: input.nextAction || null,
    next_action_owner_profile_id: input.nextActionOwnerProfileId || null,
    next_milestone_name: input.nextMilestoneName || null,
    next_milestone_date: input.nextMilestoneDate || null,
    status: intent === "submit" ? ("submitted" as const) : ("draft" as const),
    ...(intent === "submit"
      ? { submitted_at: new Date().toISOString() }
      : {}),
  };

  const { error } = await supabase
    .from("project_updates")
    .upsert(payload, { onConflict: "project_id,reporting_cycle_id" });

  if (error) {
    return { error: error.message };
  }

  // A submitted leadership ask becomes a tracked decision automatically.
  if (intent === "submit" && input.leadershipAsk) {
    const { data: existing } = await supabase
      .from("decisions")
      .select("id")
      .eq("project_id", input.projectId)
      .eq("title", input.leadershipAsk)
      .maybeSingle();

    if (!existing) {
      await supabase.from("decisions").insert({
        project_id: input.projectId,
        title: input.leadershipAsk,
        detail: input.blockerOrRisk || null,
        needed_by: input.nextMilestoneDate || null,
        decision_owner_profile_id:
          input.nextActionOwnerProfileId || session.profile.id,
        audience: "Executive steering team",
        status: "open",
      });
    }
  }

  revalidatePath("/", "layout");

  return {
    message:
      intent === "submit"
        ? "Update submitted. The dashboard and leadership report have refreshed."
        : "Draft saved.",
  };
}

export async function confirmReminderSent(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireWritableSession();
  if ("error" in auth) return { error: auth.error };
  const { session } = auth;

  if (!canManageReporting(session.profile.role)) {
    return { error: "Only leads and administrators can record reminders." };
  }

  const recipientProfileId = optional(formData.get("recipientProfileId"));
  const reportingCycleId = optional(formData.get("reportingCycleId"));
  const projectId = optional(formData.get("projectId"));
  const message = optional(formData.get("message"));

  if (!recipientProfileId || !reportingCycleId || !projectId) {
    return { error: "Select the project and owner the reminder is for." };
  }

  const supabase = await createClient();

  // The outstanding row's owner must match the recipient — prevents marking a
  // reminder against the wrong person if the UI state drifts.
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, owner_profile_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project) {
    return { error: "That project could not be found." };
  }
  if (project.owner_profile_id !== recipientProfileId) {
    return {
      error:
        "That person is no longer the owner of this project. Refresh and try again.",
    };
  }

  const { data: contact } = await supabase
    .from("profile_contacts")
    .select("email")
    .eq("profile_id", recipientProfileId)
    .maybeSingle();

  if (!contact?.email) {
    return {
      error:
        "No reminder email is configured for this owner. Ask an administrator to add one.",
    };
  }

  const { error } = await supabase.from("reminders").insert({
    reporting_cycle_id: reportingCycleId,
    project_id: projectId,
    recipient_profile_id: recipientProfileId,
    sent_by_profile_id: session.profile.id,
    kind: "email_manual_confirmed",
    message:
      message ||
      `Local email draft opened for ${project.name}; sender confirmed it was sent.`,
  });

  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { message: "Reminder recorded as sent." };
}
