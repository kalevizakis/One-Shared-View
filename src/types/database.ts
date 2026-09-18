export type UserRole = "owner" | "lead" | "exec" | "admin";
export type LifecycleStatus =
  | "proposed"
  | "active"
  | "on_hold"
  | "complete"
  | "cancelled";
export type HealthStatus = "on_track" | "at_risk" | "blocked";
export type ReportingCadence = "weekly" | "monthly";
export type CycleStatus = "upcoming" | "open" | "locked" | "closed";
export type UpdateStatus = "draft" | "submitted";
export type MilestoneStatus = "planned" | "in_progress" | "complete" | "missed";
export type DecisionStatus = "open" | "resolved" | "cancelled";

export interface Profile {
  id: string;
  auth_user_id: string | null;
  ntid: string;
  display_name: string;
  job_title: string | null;
  role: UserRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  lead_profile_id: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  portfolio_id: string;
  owner_profile_id: string | null;
  lead_profile_id: string | null;
  lifecycle_status: LifecycleStatus;
  current_health: HealthStatus | null;
  reporting_cadence: ReportingCadence;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  target_date: string;
  status: MilestoneStatus;
  owner_profile_id: string | null;
}

export interface ReportingCycle {
  id: string;
  portfolio_id: string;
  name: string;
  cadence: ReportingCadence;
  starts_at: string;
  due_at: string;
  closes_at: string;
  status: CycleStatus;
}

export interface ProjectUpdate {
  id: string;
  project_id: string;
  reporting_cycle_id: string;
  author_profile_id: string | null;
  health: HealthStatus;
  executive_summary: string;
  accomplishments: string | null;
  next_steps: string | null;
  blocker_or_risk: string | null;
  leadership_ask: string | null;
  health_change_reason: string | null;
  next_action: string | null;
  next_action_owner_profile_id: string | null;
  next_milestone_name: string | null;
  next_milestone_date: string | null;
  status: UpdateStatus;
  submitted_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface Decision {
  id: string;
  project_id: string;
  project_update_id: string | null;
  title: string;
  detail: string | null;
  needed_by: string | null;
  decision_owner_profile_id: string | null;
  audience: string | null;
  status: DecisionStatus;
  resolution: string | null;
}

export interface Reminder {
  id: string;
  reporting_cycle_id: string;
  project_id: string | null;
  recipient_profile_id: string;
  sent_by_profile_id: string | null;
  kind: string;
  message: string | null;
  acknowledged_at: string | null;
  created_at: string;
}

export interface GeneratedReport {
  id: string;
  reporting_cycle_id: string;
  title: string;
  audience: string;
  configuration_json: ReportConfiguration;
  narrative: string | null;
  source_update_ids: string[];
  version: number;
  created_by_profile_id: string | null;
  created_at: string;
}

export interface ReportConfiguration {
  includeProjectDetail: boolean;
  includeStaleUpdates: boolean;
  includeLeadershipAsks: boolean;
}

export interface AuditEvent {
  id: string;
  actor_profile_id: string | null;
  actor_ntid: string | null;
  entity_type: string;
  entity_id: string | null;
  entity_label: string | null;
  action: string;
  changes_json: Record<string, unknown> | null;
  created_at: string;
}

/** A project joined with the people and reporting state the UI needs. */
export interface ProjectWithContext extends Project {
  owner: Profile | null;
  lead: Profile | null;
  nextMilestone: Milestone | null;
  currentUpdate: ProjectUpdate | null;
  lastSubmittedAt: string | null;
}

export interface DecisionWithContext extends Decision {
  project: Pick<Project, "id" | "name"> | null;
  owner: Profile | null;
}
