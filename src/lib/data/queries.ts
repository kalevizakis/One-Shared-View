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
  Project,
  ProjectUpdate,
  ProjectWithContext,
  Reminder,
  ReportingCycle,
} from "@/types/database";

export interface SessionContext {
  profile: Profile;
  portfolio: Portfolio | null;
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
    .maybeSingle();

  if (error) {
    throw new SessionUnavailableError(
      "Your account is signed in, but the roster could not be read from the database.",
    );
  }

  if (!profile) {
    throw new SessionUnavailableError(
      "Your account is signed in, but it is not linked to a roster entry yet.",
    );
  }

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return { profile: profile as Profile, portfolio: portfolio as Portfolio | null };
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

export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("display_name");
  return (data ?? []) as Profile[];
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
  completeness: number;
  missing: ProjectWithContext[];
  stale: ProjectWithContext[];
}

/** Dashboard aggregation — submitted updates only, per the acceptance criteria. */
export function buildPortfolioMetrics(
  projects: ProjectWithContext[],
): PortfolioMetrics {
  const reporting = projects.filter(
    (p) => p.lifecycle_status === "active" || p.lifecycle_status === "proposed",
  );
  const submitted = reporting.filter(
    (p) => p.currentUpdate?.status === "submitted",
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
    completeness: reporting.length
      ? Math.round((submitted.length / reporting.length) * 100)
      : 0,
    missing: reporting.filter((p) => p.currentUpdate?.status !== "submitted"),
    stale: submitted.filter((p) => isStale(p.currentUpdate?.submitted_at ?? null)),
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
