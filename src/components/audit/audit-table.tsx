import { ShieldCheck } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/domain/status";
import { entityLabel } from "@/lib/domain/audit";
import type { AuditEvent } from "@/types/database";

const ACTION_LABEL: Record<string, string> = {
  create: "Created",
  update: "Changed",
  submit: "Submitted",
  edit_after_submission: "Edited after submission",
  delete: "Deleted",
};

const FIELD_LABEL: Record<string, string> = {
  health: "health",
  executive_summary: "executive summary",
  expected_value: "expected value",
  impact: "impact",
  accomplishments: "accomplishments",
  next_steps: "next steps",
  blocker_or_risk: "blocker or risk",
  leadership_ask: "leadership ask",
  health_change_reason: "reason for health",
  next_action: "next action",
  status: "status",
  role: "role",
  active: "active",
  narrative: "narrative",
  lifecycle_status: "lifecycle status",
  current_health: "current health",
  owner_profile_id: "owner",
  lead_profile_id: "lead",
};

interface AuditTableProps {
  events: AuditEvent[];
}

export function AuditTable({ events }: AuditTableProps) {
  return (
    <section className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          Audit trail
        </h2>
        <p aria-live="polite" className="text-xs text-muted-foreground">
          {events.length} {events.length === 1 ? "record" : "records"}
        </p>
      </div>

      {events.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          No audit records match these filters.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[168px]">When</TableHead>
                <TableHead className="w-[168px]">Who (NTID)</TableHead>
                <TableHead className="w-[150px]">Action</TableHead>
                <TableHead>Record</TableHead>
                <TableHead>What changed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                    {formatDateTime(event.created_at)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {event.actor_ntid ?? "system"}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {ACTION_LABEL[event.action] ?? event.action}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="block font-medium">
                      {event.entity_label ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entityLabel(event.entity_type)}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {describeChanges(event.changes_json)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}

/** Renders the trigger's per-field {from, to} diff as readable text. */
function describeChanges(changes: Record<string, unknown> | null): string {
  if (!changes) return "—";
  const fields = Object.keys(changes);
  if (fields.length === 0) return "—";

  return fields
    .slice(0, 6)
    .map((field) => FIELD_LABEL[field] ?? field.replace(/_/g, " "))
    .join(", ")
    .concat(fields.length > 6 ? `, +${fields.length - 6} more` : "");
}
