"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getProjectsWithContext,
  getReportsForCycle,
  requireWritableSession,
} from "@/lib/data/queries";
import { reportSchema } from "@/lib/domain/validation";
import { canManageReporting } from "@/lib/domain/status";
import type { ActionResult } from "@/app/actions/auth";

function optional(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Generates a leadership report version from the selected cycle's SUBMITTED
 * updates only. The source update ids are stored with the report so every
 * figure stays traceable back to the owner input that produced it.
 */
export async function generateReport(
  formData: FormData,
): Promise<ActionResult & { reportId?: string }> {
  const auth = await requireWritableSession();
  if ("error" in auth) return { error: auth.error };
  const { session } = auth;
  if (!canManageReporting(session.profile.role)) {
    return { error: "Only portfolio leads and administrators can generate reports." };
  }

  const parsed = reportSchema.safeParse({
    reportingCycleId: optional(formData.get("reportingCycleId")),
    title: optional(formData.get("title")),
    audience: optional(formData.get("audience")),
    narrative: optional(formData.get("narrative")),
    includeProjectDetail: formData.get("includeProjectDetail") === "on",
    includeStaleUpdates: formData.get("includeStaleUpdates") === "on",
    includeLeadershipAsks: formData.get("includeLeadershipAsks") === "on",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the report settings." };
  }

  const input = parsed.data;
  const supabase = await createClient();

  const projects = await getProjectsWithContext(input.reportingCycleId);
  const sourceUpdateIds = projects
    .filter((project) => project.currentUpdate?.status === "submitted")
    .map((project) => project.currentUpdate!.id);

  const existing = await getReportsForCycle(input.reportingCycleId);
  const nextVersion = (existing[0]?.version ?? 0) + 1;

  const { data, error } = await supabase
    .from("generated_reports")
    .insert({
      reporting_cycle_id: input.reportingCycleId,
      title: input.title,
      audience: input.audience,
      narrative: input.narrative || null,
      configuration_json: {
        includeProjectDetail: input.includeProjectDetail,
        includeStaleUpdates: input.includeStaleUpdates,
        includeLeadershipAsks: input.includeLeadershipAsks,
      },
      source_update_ids: sourceUpdateIds,
      version: nextVersion,
      created_by_profile_id: session.profile.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/reports");
  return { message: `Report version ${nextVersion} generated.`, reportId: data.id };
}

/** Narrative editing never touches the source updates. */
export async function updateReportNarrative(
  formData: FormData,
): Promise<ActionResult> {
  const auth = await requireWritableSession();
  if ("error" in auth) return { error: auth.error };
  const { session } = auth;
  if (!canManageReporting(session.profile.role)) {
    return { error: "Only portfolio leads and administrators can edit the narrative." };
  }

  const reportId = optional(formData.get("reportId"));
  const narrative = optional(formData.get("narrative"));
  if (!reportId) return { error: "No report selected." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("generated_reports")
    .update({ narrative: narrative || null })
    .eq("id", reportId);

  if (error) return { error: error.message };

  revalidatePath("/reports");
  return { message: "Report narrative saved." };
}
