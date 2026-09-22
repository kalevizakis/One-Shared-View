"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireWritableSession } from "@/lib/data/queries";
import { canAdminister } from "@/lib/domain/status";
import {
  cycleSchema,
  contactEmailSchema,
  deleteCycleSchema,
  deleteInactiveProfileSchema,
  profileContactSchema,
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
    executiveSummary: text(formData, "executiveSummary"),
    expectedValue: text(formData, "expectedValue"),
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
    executive_summary: input.executiveSummary,
    expected_value: input.expectedValue || null,
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

  const emailRaw = text(formData, "email");
  let email: string | null = null;
  if (emailRaw) {
    const emailParsed = contactEmailSchema.safeParse(emailRaw);
    if (!emailParsed.success) {
      return {
        error:
          emailParsed.error.issues[0]?.message ??
          "Enter a valid corporate email address.",
      };
    }
    email = emailParsed.data;
  }

  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("profiles")
    .insert({
      ntid,
      display_name: displayName,
      job_title: text(formData, "jobTitle") || null,
      role,
      active: true,
    })
    .select("id")
    .single();

  if (error) {
    return {
      error: error.code === "23505" ? `${ntid} is already on the roster.` : error.message,
    };
  }

  if (email) {
    const { error: contactError } = await supabase
      .from("profile_contacts")
      .insert({ profile_id: inserted.id, email });
    if (contactError) {
      return {
        error: `${displayName} was added, but the email could not be saved: ${contactError.message}`,
      };
    }
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return {
    message: email
      ? `${displayName} added with a reminder email. They can sign in with ${ntid} now.`
      : `${displayName} added. They can sign in with ${ntid} now. Add a reminder email when you have it.`,
  };
}

/** Creates or updates the verified corporate email used for local reminder drafts. */
export async function saveProfileContact(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return { error: guard.error };

  const parsed = profileContactSchema.safeParse({
    profileId: text(formData, "profileId"),
    email: text(formData, "email"),
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Check the email address.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("profile_contacts").upsert(
    {
      profile_id: parsed.data.profileId,
      email: parsed.data.email,
    },
    { onConflict: "profile_id" },
  );

  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { message: "Reminder email saved." };
}

/** Removes the verified corporate email for a roster member. */
export async function clearProfileContact(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return { error: guard.error };

  const profileId = text(formData, "profileId");
  if (!profileId) return { error: "Select a person." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profile_contacts")
    .delete()
    .eq("profile_id", profileId);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  revalidatePath("/");
  return { message: "Reminder email removed." };
}

/** Permanently removes an unused, inactive roster entry. */
export async function deleteInactiveProfile(
  formData: FormData,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return { error: guard.error };

  const parsed = deleteInactiveProfileSchema.safeParse({
    id: text(formData, "id"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Select a person.",
    };
  }

  if (parsed.data.id === guard.session.profile.id) {
    return { error: "You cannot delete your own roster entry." };
  }

  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, active, is_preview")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (profileError) return { error: profileError.message };
  if (!profile) return { error: "That person is no longer on the roster." };
  if (profile.active) {
    return { error: "Disable access before deleting a person." };
  }
  if (profile.is_preview) {
    return { error: "The shared preview identity cannot be deleted." };
  }

  const { error } = await supabase.rpc("delete_inactive_profile", {
    p_profile_id: profile.id,
  });

  if (error) {
    const migrationMissing =
      error.code === "PGRST202" ||
      error.code === "42883" ||
      error.message.includes("delete_inactive_profile");
    return {
      error: migrationMissing
        ? "Inactive-person deletion is not enabled in the database yet."
        : error.message,
    };
  }

  revalidatePath("/", "layout");
  return { message: `${profile.display_name} removed from the roster.` };
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

/**
 * Permanently removes a historical cycle and its cycle-owned records.
 *
 * The database repeats these eligibility checks in RLS so a direct API call
 * cannot use this action's absence as a bypass.
 */
export async function deleteCycle(formData: FormData): Promise<ActionResult> {
  const guard = await requireAdmin();
  if ("error" in guard) return { error: guard.error };

  const parsed = deleteCycleSchema.safeParse({ id: text(formData, "id") });
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Select a reporting cycle.",
    };
  }

  const portfolio = guard.session.portfolio;
  if (!portfolio) return { error: "No reporting portfolio is configured." };

  const supabase = await createClient();
  const { data: cycle, error: cycleError } = await supabase
    .from("reporting_cycles")
    .select("id, name, portfolio_id, due_at, status")
    .eq("id", parsed.data.id)
    .eq("portfolio_id", portfolio.id)
    .maybeSingle();

  if (cycleError) return { error: cycleError.message };
  if (!cycle) return { error: "That reporting cycle no longer exists." };

  if (cycle.status !== "locked" && cycle.status !== "closed") {
    return {
      error: "Only locked or closed reporting cycles can be deleted.",
    };
  }

  const { data: newerCycle, error: newerCycleError } = await supabase
    .from("reporting_cycles")
    .select("id")
    .eq("portfolio_id", portfolio.id)
    .gt("due_at", cycle.due_at)
    .limit(1)
    .maybeSingle();

  if (newerCycleError) return { error: newerCycleError.message };
  if (!newerCycle) {
    return {
      error: "Keep at least one newer reporting cycle before deleting this one.",
    };
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("reporting_cycles")
    .delete()
    .eq("id", cycle.id)
    .eq("portfolio_id", portfolio.id)
    .eq("status", cycle.status)
    .eq("due_at", cycle.due_at)
    .select("id")
    .maybeSingle();

  if (deleteError) return { error: deleteError.message };
  if (!deleted) {
    return {
      error: "This cycle can no longer be deleted. Refresh and try again.",
    };
  }

  revalidatePath("/", "layout");
  return { message: `${cycle.name} deleted.` };
}
