import { createClient } from "@/lib/supabase/server";
import { isStale } from "@/lib/domain/status";
import type {
  AuditEvent,
  Decision,
  DecisionWithContext,
  GeneratedReport,
  Milestone,
  Portfolio,
  Profile,
  ProfileContact,
  ProfileDeletionEligibility,
  Project,
  ProjectUpdate,
  ProjectWithContext,
  Reminder,
  ReportingCycle,
} from "@/types/database";

export interface SessionContext {
  profile: Profile;
  portfolio: Portfolio | null;
  /**
   * True when this is the shared read-only preview identity. Drives the banner,
   * the disabled controls, and — via `requireWritableSession` — the refusal of
   * every mutating Server Action.
   */
  isPreview: boolean;
}

/**
 * Raised when the person is genuinely signed in but their roster row cannot be
 * read. Distinguishing this from "not signed in" matters: returning null for
 * both makes the app redirect to /login while the session cookie is still
 * valid, and middleware immediately redirects back — an invisible loop that
 * looks like the login button hanging forever.
 */
export class SessionUnavailableError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "SessionUnavailableError";
  }
}

/** The signed-in person's roster row. Null when not signed in. */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new SessionUnavailableError(
      "Your account is signed in, but the roster could not be read from the database.",
    );
  }

  if (!profile) {
    throw new SessionUnavailableError(
      "Your account is signed in, but it is not linked to an active roster entry.",
    );
  }

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const row = profile as Profile;

  return {
    profile: row,
    portfolio: portfolio as Portfolio | null,
    isPreview: row.is_preview === true,
  };
}

/**
 * Session lookup for Server Actions. Actions must return a readable message
 * rather than throwing — an uncaught error becomes an opaque
 * "unexpected response" in the browser instead of a visible toast.
 */
export async function getSessionForAction(): Promise<
  { session: SessionContext } | { error: string }
> {
  try {
    const session = await getSessionContext();
    if (!session) return { error: "Your session has expired. Sign in again." };
    return { session };
  } catch (error) {
    if (error instanceof SessionUnavailableError) {
      return { error: error.reason };
    }
    throw error;
  }
}

export const PREVIEW_READ_ONLY_MESSAGE =
  "This is a read-only preview. Sign in with your NTID to make changes.";

/**
 * Session lookup for every MUTATING Server Action.
 *
 * Disabling a button only stops the button. A Server Action is an HTTP endpoint,
 * so anyone holding a preview session cookie can invoke one directly by crafting
 * a POST with the `next-action` header — which is exactly what the UI disabling
 * cannot defend against. This guard is that defence, and it sits at the boundary
 * every write has to cross.
 *
 * It is belt-and-braces rather than the only protection: the preview identity is
 * role 'exec' and owns nothing, so RLS refuses its writes at the database too.
 * The guard exists so the visitor gets a readable explanation instead of a raw
 * permission error, and so the refusal does not depend on any one RLS policy
 * staying correct forever.
 *
 * Read-only actions keep using `getSessionForAction` — preview must be able to
 * browse, and `signOut` must keep working so a visitor can leave.
 */
export async function requireWritableSession(): Promise<
  { session: SessionContext } | { error: string }
> {
  const result = await getSessionForAction();
  if ("error" in result) return result;
  if (result.session.isPreview) {
    return { error: PREVIEW_READ_ONLY_MESSAGE };
  }
  return result;
}

export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("display_name");
  return (data ?? []) as Profile[];
}

/**
 * Database-derived roster deletion checks for the admin screen.
 *
 * An empty map keeps deletion unavailable until the supporting migration has
 * been applied; the destructive control must never guess from partial client
 * data.
 */
export async function getProfileDeletionEligibility(): Promise<
  Record<string, ProfileDeletionEligibility>
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "get_profile_deletion_eligibility",
  );
  if (error) return {};

  const eligibility: Record<string, ProfileDeletionEligibility> = {};
  for (const row of (data ?? []) as ProfileDeletionEligibility[]) {
    eligibility[row.profile_id] = {
      ...row,
      blockers: Array.isArray(row.blockers) ? row.blockers : [],
      reference_count: Number(row.reference_count),
    };
  }
  return eligibility;
}

/**
 * Verified corporate emails for roster members.
 *
 * RLS returns nothing to owners, execs, and the preview identity — only leads
 * and administrators see rows. Callers that do not manage reporting simply get
 * an empty map.
 */
export async function getProfileContacts(): Promise<
  Record<string, ProfileContact>
> {
  const supabase = await createClient();
  const { data } = await supabase.from("profile_contacts").select("*");
  const contacts: Record<string, ProfileContact> = {};
  for (const row of (data ?? []) as ProfileContact[]) {
    contacts[row.profile_id] = row;
  }
  return contacts;
}

export async function getReportingCycles(): Promise<ReportingCycle[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reporting_cycles")
    .select("*")
    .order("due_at", { ascending: false });
  return (data ?? []) as ReportingCycle[];
}

/** The open cycle, or the most recent one if none is open. */
export async function getCurrentCycle(): Promise<ReportingCycle | null> {
  const cycles = await getReportingCycles();
  return cycles.find((cycle) => cycle.status === "open") ?? cycles[0] ?? null;
}

export async function getCycleById(
  cycleId: string | undefined,
): Promise<ReportingCycle | null> {
  if (!cycleId) return getCurrentCycle();
  const cycles = await getReportingCycles();
  return cycles.find((cycle) => cycle.id === cycleId) ?? getCurrentCycle();
}

/**
 * Projects joined with owner, lead, next milestone and the update for the
 * selected cycle — everything the dashboard and report need in one pass.
 */
export async function getProjectsWithContext(
  cycleId: string | null,
): Promise<ProjectWithContext[]> {
  const supabase = await createClient();

  const [projectsRes, profilesRes, milestonesRes, updatesRes, latestRes] =
    await Promise.all([
      supabase.from("projects").select("*").order("name"),
      supabase.from("profiles").select("*"),
      supabase
        .from("milestones")
        .select("*")
        .order("target_date", { ascending: true }),
      cycleId
        ? supabase
            .from("project_updates")
            .select("*")
            .eq("reporting_cycle_id", cycleId)
        : Promise.resolve({ data: [] as ProjectUpdate[] }),
      supabase
        .from("project_updates")
        .select("project_id, submitted_at")
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false }),
    ]);

  const profiles = (profilesRes.data ?? []) as Profile[];
  const milestones = (milestonesRes.data ?? []) as Milestone[];
  const updates = (updatesRes.data ?? []) as ProjectUpdate[];
  const latest = (latestRes.data ?? []) as Pick<
    ProjectUpdate,
    "project_id" | "submitted_at"
  >[];

  const profileById = new Map(profiles.map((p) => [p.id, p]));
  const lastSubmitted = new Map<string, string>();
  latest.forEach((row) => {
    if (row.submitted_at && !lastSubmitted.has(row.project_id)) {
      lastSubmitted.set(row.project_id, row.submitted_at);
    }
  });

  return ((projectsRes.data ?? []) as Project[]).map((project) => {
    const openMilestones = milestones.filter(
      (m) => m.project_id === project.id && m.status !== "complete",
    );

    return {
      ...project,
      owner: project.owner_profile_id
        ? profileById.get(project.owner_profile_id) ?? null
        : null,
      lead: project.lead_profile_id
        ? profileById.get(project.lead_profile_id) ?? null
        : null,
      nextMilestone: openMilestones[0] ?? null,
      currentUpdate: updates.find((u) => u.project_id === project.id) ?? null,
      lastSubmittedAt: lastSubmitted.get(project.id) ?? null,
    };
  });
}

export interface PortfolioMetrics {
  activeProjects: number;
  onTrack: number;
  atRisk: number;
  blocked: number;
  reportingProjects: number;
  submittedCount: number;
  currentSubmittedCount: number;
  completeness: number;
  missing: ProjectWithContext[];
  readinessOutstanding: ProjectWithContext[];
  stale: ProjectWithContext[];
}

/** Dashboard aggregation — readiness requires a submitted, non-stale update. */
export function buildPortfolioMetrics(
  projects: ProjectWithContext[],
): PortfolioMetrics {
  const reporting = projects.filter(
    (p) => p.lifecycle_status === "active" || p.lifecycle_status === "proposed",
  );
  const submitted = reporting.filter(
    (p) => p.currentUpdate?.status === "submitted",
  );
  const stale = submitted.filter((p) =>
    isStale(p.currentUpdate?.submitted_at ?? null),
  );
  const staleProjectIds = new Set(stale.map((project) => project.id));
  const currentSubmitted = submitted.filter(
    (project) => !staleProjectIds.has(project.id),
  );

  const healthOf = (project: ProjectWithContext) =>
    project.currentUpdate?.status === "submitted"
      ? project.currentUpdate.health
      : project.current_health;

  return {
    activeProjects: reporting.filter((p) => p.lifecycle_status === "active")
      .length,
    onTrack: reporting.filter((p) => healthOf(p) === "on_track").length,
    atRisk: reporting.filter((p) => healthOf(p) === "at_risk").length,
    blocked: reporting.filter((p) => healthOf(p) === "blocked").length,
    reportingProjects: reporting.length,
    submittedCount: submitted.length,
    currentSubmittedCount: currentSubmitted.length,
    completeness: reporting.length
      ? Math.round((currentSubmitted.length / reporting.length) * 100)
      : 0,
    missing: reporting.filter((p) => p.currentUpdate?.status !== "submitted"),
    readinessOutstanding: reporting.filter(
      (project) =>
        project.currentUpdate?.status !== "submitted" ||
        staleProjectIds.has(project.id),
    ),
    stale,
  };
}

export async function getOpenDecisions(): Promise<DecisionWithContext[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("decisions")
    .select("*, project:projects(id, name), owner:profiles(*)")
    .eq("status", "open")
    .order("needed_by", { ascending: true });
  return (data ?? []) as DecisionWithContext[];
}

export async function getDecisionsForCycleProjects(
  projectIds: string[],
): Promise<DecisionWithContext[]> {
  if (projectIds.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("decisions")
    .select("*, project:projects(id, name), owner:profiles(*)")
    .in("project_id", projectIds)
    .eq("status", "open")
    .order("needed_by", { ascending: true });
  return (data ?? []) as DecisionWithContext[];
}

export async function getProjectById(
  projectId: string,
): Promise<Project | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  return (data as Project) ?? null;
}

export async function getUpdateHistory(
  projectId: string,
): Promise<ProjectUpdate[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_updates")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  return (data ?? []) as ProjectUpdate[];
}

export async function getUpdateForCycle(
  projectId: string,
  cycleId: string,
): Promise<ProjectUpdate | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_updates")
    .select("*")
    .eq("project_id", projectId)
    .eq("reporting_cycle_id", cycleId)
    .maybeSingle();
  return (data as ProjectUpdate) ?? null;
}

export async function getMilestones(projectId: string): Promise<Milestone[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("milestones")
    .select("*")
    .eq("project_id", projectId)
    .order("target_date");
  return (data ?? []) as Milestone[];
}

export async function getProjectDecisions(
  projectId: string,
): Promise<Decision[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("decisions")
    .select("*")
    .eq("project_id", projectId)
    .order("needed_by", { ascending: true });
  return (data ?? []) as Decision[];
}

export async function getReportsForCycle(
  cycleId: string,
): Promise<GeneratedReport[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("generated_reports")
    .select("*")
    .eq("reporting_cycle_id", cycleId)
    .order("version", { ascending: false });
  return (data ?? []) as GeneratedReport[];
}

export async function getReportById(
  reportId: string,
): Promise<GeneratedReport | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("generated_reports")
    .select("*")
    .eq("id", reportId)
    .maybeSingle();
  return (data as GeneratedReport) ?? null;
}

export async function getRemindersForCycle(
  cycleId: string,
): Promise<Reminder[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reminders")
    .select("*")
    .eq("reporting_cycle_id", cycleId)
    .order("created_at", { ascending: false });
  return (data ?? []) as Reminder[];
}

export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  actorProfileId?: string;
  limit?: number;
}

export async function getAuditEvents(
  filters: AuditFilters = {},
): Promise<AuditEvent[]> {
  const supabase = await createClient();
  let query = supabase
    .from("audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.entityId) query = query.eq("entity_id", filters.entityId);
  if (filters.actorProfileId)
    query = query.eq("actor_profile_id", filters.actorProfileId);

  const { data } = await query;
  return (data ?? []) as AuditEvent[];
}
