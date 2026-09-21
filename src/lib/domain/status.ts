import type {
  CycleStatus,
  HealthStatus,
  LifecycleStatus,
  MilestoneStatus,
  UpdateStatus,
  UserRole,
} from "@/types/database";

/**
 * Status is never communicated by colour alone (WCAG 2.2 AA): every badge
 * carries a label, and the dot/icon shape is paired with text.
 */
export const HEALTH_LABEL: Record<HealthStatus, string> = {
  on_track: "On track",
  at_risk: "At risk",
  blocked: "Blocked",
};

export const HEALTH_ORDER: HealthStatus[] = ["blocked", "at_risk", "on_track"];

export const LIFECYCLE_LABEL: Record<LifecycleStatus, string> = {
  proposed: "Proposed",
  active: "Active",
  on_hold: "On hold",
  complete: "Complete",
  cancelled: "Cancelled",
};

export const CYCLE_STATUS_LABEL: Record<CycleStatus, string> = {
  upcoming: "Upcoming",
  open: "Open",
  locked: "Locked",
  closed: "Closed",
};

export const UPDATE_STATUS_LABEL: Record<UpdateStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
};

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  complete: "Complete",
  missed: "Missed",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  owner: "Project owner",
  lead: "Portfolio lead",
  exec: "Executive",
  admin: "Administrator",
};

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  owner: "Submits and maintains weekly updates for assigned projects.",
  lead: "Reviews the portfolio, chases updates, and edits report narrative.",
  exec: "Read-only access to the portfolio and leadership reports.",
  admin: "Manages projects, people, reporting cycles, and access.",
};

/** Tailwind classes for each health value, driven by design-identity tokens. */
export const HEALTH_CLASSES: Record<HealthStatus, string> = {
  on_track: "bg-status-on-track-bg text-status-on-track",
  at_risk: "bg-status-at-risk-bg text-status-at-risk",
  blocked: "bg-status-blocked-bg text-status-blocked",
};

export const HEALTH_DOT: Record<HealthStatus, string> = {
  on_track: "bg-status-on-track",
  at_risk: "bg-status-at-risk",
  blocked: "bg-status-blocked",
};

/** An update older than this many days is "stale" for the current cycle. */
export const STALE_AFTER_DAYS = 7;

export function isStale(submittedAt: string | null): boolean {
  if (!submittedAt) return true;
  const days =
    (Date.now() - new Date(submittedAt).getTime()) / (1000 * 60 * 60 * 24);
  return days > STALE_AFTER_DAYS;
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor(
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24),
  );
}

/** "Today", "Yesterday", "6d ago" — matches the reference dashboard. */
export function relativeDay(iso: string | null): string {
  const days = daysSince(iso);
  if (days === null) return "No update";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

/**
 * Every date is rendered in ONE fixed zone, never the viewer's local zone.
 *
 * Two reasons. First, correctness: a reporting cycle closes at a single moment
 * for the whole leadership team, so a deadline must read identically in New York
 * and Athens — a locally-shifted "closes 17:00" is actively misleading. Second,
 * rendering: the server renders in UTC while a browser renders in its own zone,
 * so an unpinned `toLocaleString` produces different text on each side and React
 * throws a hydration mismatch.
 */
export const DISPLAY_TIME_ZONE = "UTC";

export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

export function formatShortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/** Includes the zone name, so a deadline is never read in the wrong clock. */
export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: DISPLAY_TIME_ZONE,
    timeZoneName: "short",
  });
}

/** Calendar-tile parts ("SEP" / "24") for the decisions list. */
export function formatMonthDay(iso: string): { month: string; day: string } {
  const date = new Date(iso);
  return {
    month: date
      .toLocaleDateString("en-GB", {
        month: "short",
        timeZone: DISPLAY_TIME_ZONE,
      })
      .toUpperCase(),
    day: date.toLocaleDateString("en-GB", {
      day: "numeric",
      timeZone: DISPLAY_TIME_ZONE,
    }),
  };
}

export function isOverdue(targetDate: string | null): boolean {
  if (!targetDate) return false;
  return new Date(targetDate).getTime() < Date.now();
}

/** Permission helpers — the server re-checks everything via RLS. */
export function canEditProject(
  role: UserRole,
  profileId: string | null,
  ownerProfileId: string | null,
  projectLeadId: string | null,
): boolean {
  if (role === "admin") return true;
  if (!profileId) return false;
  if (role === "owner") return ownerProfileId === profileId;
  if (role === "lead") {
    return ownerProfileId === profileId || projectLeadId === profileId;
  }
  return false;
}

export function canManageReporting(role: UserRole): boolean {
  return role === "lead" || role === "admin";
}

export function canAdminister(role: UserRole): boolean {
  return role === "admin";
}

/**
 * VIEW GATING ONLY — may this profile open the audit screen?
 *
 * Deliberately separate from the three helpers above, which every write path
 * depends on. Widening `canManageReporting` to include preview would have let the
 * shared read-only identity generate reports, edit report narrative and send
 * reminders; this reads the audit trail and nothing else. Matched in the database
 * by the SELECT-only `audit_events_select_preview` policy.
 *
 * Never use this to authorise a change.
 */
export function canPreviewAudit(profile: {
  role: UserRole;
  is_preview: boolean;
}): boolean {
  return canManageReporting(profile.role) || profile.is_preview === true;
}
