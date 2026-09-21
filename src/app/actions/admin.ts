"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWritableSession } from "@/lib/data/queries";
import { canAdminister } from "@/lib/domain/status";
import {
  cycleSchema,
  profileRoleSchema,
  projectSchema,
} from "@/lib/domain/validation";
import type { ActionResult } from "@/app/actions/auth";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function nullable(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value === "" || value === "none" ? null : value;
}

/**
 * Every admin action goes through here.
 *
 * The preview check runs first, via `requireWritableSession`, so a preview
 * visitor is told the truth — "this is a read-only preview" — rather than the
 * misleading "only administrators can change this". The role check would refuse
 * them anyway (preview is 'exec'), as would RLS; this is about the message being
 * accurate, and about the refusal not depending on the role check alone.
 */
async function requireAdmin() {
  const result = await requireWritableSession();
  if ("error" in result) return { error: result.error } as const;
  if (!canAdminister(result.session.profile.role)) {
    return { error: "Only administrators can change this." } as const;
  }
  return { session: result.session } as const;
}

/** Creates or updates a project. RLS also enforces the admin requirement. */
export async function saveProject(formData: FormData): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return { error: guard.error };

  const parsed = projectSchema.safeParse({
    id: nullable(formData, "id"),
    name: text(formData, "name"),
    description: text(formData, "description"),
    portfolioId: text(formData, "portfolioId"),
    ownerProfileId: nullable(formData, "ownerProfileId"),
    leadProfileId: nullable(formData, "leadProfileId"),
    lifecycleStatus: text(formData, "lifecycleStatus"),
    reportingCadence: text(formData, "reportingCadence"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the project details." };
  }

  const input = parsed.data;
  const supabase = await createClient();
  const row = {
    name: input.name,
    description: input.description || null,
    portfolio_id: input.portfolioId,
    owner_profile_id: input.ownerProfileId,
    lead_profile_id: input.leadProfileId,
    lifecycle_status: input.lifecycleStatus,
    reporting_cadence: input.reportingCadence,
  };

  const { error } = input.id
    ? await supabase.from("projects").update(row).eq("id", input.id)
    : await supabase.from("projects").insert(row);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { message: input.id ? "Project updated." : "Project added." };
}

/** Changes someone's role or access. Guarded in the database as well. */
export async function saveProfileAccess(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return { error: guard.error };

  const parsed = profileRoleSchema.safeParse({
    id: text(formData, "id"),
    role: text(formData, "role"),
    active: formData.get("active") === "on" || formData.get("active") === "true",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the access details." };
  }

  const input = parsed.data;
  if (
    input.id === guard.session.profile.id &&
    (input.role !== "admin" || !input.active)
  ) {
    return {
      error:
        "You cannot remove your own administrator access — ask another administrator.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: input.role, active: input.active })
    .eq("id", input.id);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { message: "Access updated." };
}

/** Adds a person to the roster, which is what grants them access. */
export async function addRosterPerson(formData: FormData): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return { error: guard.error };

  const ntid = text(formData, "ntid").toLowerCase();
  const displayName = text(formData, "displayName");
  const role = text(formData, "role");

  if (!/^[a-z0-9]{3,20}$/.test(ntid)) {
    return { error: "An NTID contains 3–20 letters and numbers." };
  }
  if (displayName.length < 2) return { error: "Enter the person's name." };
  if (!["owner", "lead", "exec", "admin"].includes(role)) {
    return { error: "Select a role." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").insert({
    ntid,
    display_name: displayName,
    job_title: text(formData, "jobTitle") || null,
    role,
    active: true,
  });

  if (error) {
    return {
      error: error.code === "23505" ? `${ntid} is already on the roster.` : error.message,
    };
  }

  revalidatePath("/admin");
  return { message: `${displayName} added. They can sign in with ${ntid} now.` };
}

/** Creates or updates a reporting cycle, including opening/locking it. */
export async function saveCycle(formData: FormData): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return { error: guard.error };

  const parsed = cycleSchema.safeParse({
    id: nullable(formData, "id"),
    portfolioId: text(formData, "portfolioId"),
    name: text(formData, "name"),
    cadence: text(formData, "cadence"),
    startsAt: text(formData, "startsAt"),
    dueAt: text(formData, "dueAt"),
    closesAt: text(formData, "closesAt"),
    status: text(formData, "status"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the cycle details." };
  }

  const input = parsed.data;
  const supabase = await createClient();
  const row = {
    portfolio_id: input.portfolioId,
    name: input.name,
    cadence: input.cadence,
    starts_at: input.startsAt,
    due_at: input.dueAt,
    closes_at: input.closesAt,
    status: input.status,
  };

  const { error } = input.id
    ? await supabase.from("reporting_cycles").update(row).eq("id", input.id)
    : await supabase.from("reporting_cycles").insert(row);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { message: input.id ? "Reporting cycle updated." : "Reporting cycle added." };
}
