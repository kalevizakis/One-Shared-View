/**
 * Audit vocabulary, shared by the server-rendered table and the client filter bar.
 *
 * This lives in a plain module rather than alongside the filter component on
 * purpose. A `"use client"` file's exports reach a server component as client
 * reference proxies, not as their real values — importing an array from one and
 * calling `.find()` on it throws at render time. Anything both sides need must
 * sit in a module with no client boundary of its own, like this one.
 */

/**
 * Database table name -> the words the leadership team actually uses.
 *
 * Must cover every table carrying the audit trigger (see the `foreach` block in
 * the init migration), otherwise the trail shows a raw table name to an exec.
 */
export const ENTITY_LABELS: Record<string, string> = {
  project_updates: "Weekly updates",
  projects: "Projects",
  profiles: "People and roles",
  profile_contacts: "Contact emails",
  reporting_cycles: "Reporting cycles",
  generated_reports: "Leadership reports",
  decisions: "Decisions",
  milestones: "Milestones",
  reminders: "Reminders",
  portfolios: "Portfolios",
};

/** Sentinel for "don't narrow by this field" — never a real entity type. */
export const ANY_VALUE = "all";

export interface EntityOption {
  value: string;
  label: string;
}

/** Options for the record-type filter, with the unfiltered choice first. */
export const ENTITY_OPTIONS: EntityOption[] = [
  { value: ANY_VALUE, label: "All records" },
  ...Object.entries(ENTITY_LABELS).map(([value, label]) => ({ value, label })),
];

/**
 * Falls back to the raw table name so a newly audited table still renders
 * something truthful instead of blank.
 */
export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

/** Turns a filter value into a query argument, dropping the sentinel. */
export function filterValue(raw: string | undefined): string | undefined {
  return raw && raw !== ANY_VALUE ? raw : undefined;
}
