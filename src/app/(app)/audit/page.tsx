import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditFilters } from "@/components/audit/audit-filters";
import { AuditTable } from "@/components/audit/audit-table";
import {
  getAuditEvents,
  getProfiles,
  getSessionContext,
} from "@/lib/data/queries";
import { canPreviewAudit } from "@/lib/domain/status";
import { ANY_VALUE, filterValue } from "@/lib/domain/audit";

interface PageProps {
  searchParams: Promise<{ entity?: string; actor?: string }>;
}

export default function AuditPage({ searchParams }: PageProps) {
  return (
    <Suspense fallback={<AuditSkeleton />}>
      <Audit searchParams={searchParams} />
    </Suspense>
  );
}

async function Audit({ searchParams }: PageProps) {
  const { entity, actor } = await searchParams;
  const session = await getSessionContext();
  if (!session) return null;

  /*
   * Readable by portfolio leads, administrators, and the read-only preview.
   *
   * `canPreviewAudit` is a VIEW gate and nothing else — preview is still role
   * 'exec', so it cannot generate a report, edit a narrative or send a reminder.
   * The database agrees independently: `audit_events_select_preview` is a
   * SELECT-only policy, and `authenticated` holds no insert/update/delete
   * privilege on the table at all.
   */
  if (!canPreviewAudit(session.profile)) redirect("/");

  const [events, people] = await Promise.all([
    getAuditEvents({
      entityType: filterValue(entity),
      actorProfileId: filterValue(actor),
      limit: 200,
    }),
    getProfiles(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold tracking-[0.1em] text-primary uppercase">
          Governance
        </p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight">Audit trail</h1>
        <p className="mt-1.5 max-w-[70ch] text-sm text-muted-foreground">
          Every create, change, submission, and post-submission edit is recorded
          against the NTID that made it. Records are written by the database itself
          and cannot be altered from the application.
        </p>
      </div>

      <AuditFilters
        entity={entity ?? ANY_VALUE}
        actor={actor ?? ANY_VALUE}
        people={people}
      />

      <AuditTable events={events} />
    </div>
  );
}

function AuditSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-24 w-full max-w-lg" />
      <Skeleton className="h-16 w-full max-w-md" />
      <Skeleton className="h-[480px]" />
    </div>
  );
}
