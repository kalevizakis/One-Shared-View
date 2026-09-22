"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Printer, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReportPaper, type ReportMetrics } from "@/components/reports/report-paper";
import { generateReport, updateReportNarrative } from "@/app/actions/reports";
import { formatDateTime } from "@/lib/domain/status";
import type {
  DecisionWithContext,
  GeneratedReport,
  ProjectWithContext,
  ReportConfiguration,
  ReportingCycle,
} from "@/types/database";

const AUDIENCES = [
  "CMO Digital Leadership Team",
  "Digital Portfolio Review",
  "Programme Steering Committee",
  "Functional Leadership",
];

interface ReportBuilderProps {
  cycle: ReportingCycle;
  projects: ProjectWithContext[];
  decisions: DecisionWithContext[];
  metrics: ReportMetrics;
  versions: GeneratedReport[];
  selected: GeneratedReport | null;
  canManage: boolean;
}

export function ReportBuilder({
  cycle,
  projects,
  decisions,
  metrics,
  versions,
  selected,
  canManage,
}: ReportBuilderProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingNarrative, setEditingNarrative] = useState(false);

  const [title, setTitle] = useState(
    selected?.title ?? `${cycle.name} — portfolio readout`,
  );
  const [audience, setAudience] = useState(selected?.audience ?? AUDIENCES[0]);
  const [narrative, setNarrative] = useState(selected?.narrative ?? "");
  const [configuration, setConfiguration] = useState<ReportConfiguration>(
    selected?.configuration_json ?? {
      includeProjectDetail: true,
      includeStaleUpdates: false,
      includeLeadershipAsks: true,
    },
  );

  function toggle(key: keyof ReportConfiguration) {
    setConfiguration((previous) => ({ ...previous, [key]: !previous[key] }));
  }

  function handleGenerate() {
    const formData = new FormData();
    formData.set("reportingCycleId", cycle.id);
    formData.set("title", title);
    formData.set("audience", audience);
    formData.set("narrative", narrative);
    if (configuration.includeProjectDetail) formData.set("includeProjectDetail", "on");
    if (configuration.includeStaleUpdates) formData.set("includeStaleUpdates", "on");
    if (configuration.includeLeadershipAsks) formData.set("includeLeadershipAsks", "on");

    startTransition(async () => {
      const result = await generateReport(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Report generated.");
      setEditingNarrative(false);
      if (result.reportId) {
        router.push(`/reports?cycle=${cycle.id}&report=${result.reportId}`);
      } else {
        router.refresh();
      }
    });
  }

  function handleSaveNarrative() {
    if (!selected) return;
    const formData = new FormData();
    formData.set("reportId", selected.id);
    formData.set("narrative", narrative);

    startTransition(async () => {
      const result = await updateReportNarrative(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Saved.");
      setEditingNarrative(false);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(290px,0.4fr)]">
      <div className="space-y-4">
        <ReportPaper
          title={title}
          audience={audience}
          cycle={cycle}
          narrative={narrative}
          configuration={configuration}
          metrics={metrics}
          projects={projects}
          decisions={decisions}
          version={selected?.version}
          generatedAt={selected?.created_at ?? null}
        />

        {canManage && selected ? (
          <div
            data-print="hide"
            className="rounded-xl border border-border bg-card p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Executive readout</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Edit the narrative without changing any source data.
                </p>
              </div>
              {editingNarrative ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveNarrative} disabled={pending}>
                    {pending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save narrative
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setNarrative(selected.narrative ?? "");
                      setEditingNarrative(false);
                    }}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingNarrative(true)}
                >
                  <Pencil className="size-4" />
                  Edit narrative
                </Button>
              )}
            </div>

            {editingNarrative ? (
              <Textarea
                className="mt-4"
                rows={5}
                value={narrative}
                onChange={(event) => setNarrative(event.target.value)}
                maxLength={4000}
                aria-label="Executive readout narrative"
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <aside data-print="hide" className="space-y-4">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-bold">Report settings</h2>

          <div className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="report-title">Title</Label>
              <Input
                id="report-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                disabled={!canManage}
                maxLength={200}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="report-audience">Audience</Label>
              <Select
                value={audience}
                onValueChange={setAudience}
                disabled={!canManage}
              >
                <SelectTrigger id="report-audience">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <ToggleRow
              id="include-detail"
              label="Project-by-project detail"
              hint="Adds a highlight card for every reporting project."
              checked={configuration.includeProjectDetail}
              onCheckedChange={() => toggle("includeProjectDetail")}
            />
            <ToggleRow
              id="include-stale"
              label="Include stale updates"
              hint="Keeps updates older than a week in the highlights."
              checked={configuration.includeStaleUpdates}
              onCheckedChange={() => toggle("includeStaleUpdates")}
            />
            <ToggleRow
              id="include-asks"
              label="Show leadership asks"
              hint="Surfaces what each owner needs from leadership."
              checked={configuration.includeLeadershipAsks}
              onCheckedChange={() => toggle("includeLeadershipAsks")}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {canManage ? (
              <Button onClick={handleGenerate} disabled={pending}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
                {versions.length > 0 ? "Generate new version" : "Generate report"}
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="size-4" />
              Print / PDF
            </Button>
          </div>

          {!canManage ? (
            <p className="mt-3 text-xs text-muted-foreground">
              You can adjust this view and export it. Generating a stored version is
              limited to portfolio leads and administrators.
            </p>
          ) : null}
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-base font-bold">Version history</h2>
          {versions.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              No version has been stored for {cycle.name} yet. The view above is a
              live preview of the submitted updates.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {versions.map((version) => {
                const active = version.id === selected?.id;
                return (
                  <li key={version.id} className="py-2.5">
                    <a
                      href={`/reports?cycle=${cycle.id}&report=${version.id}`}
                      aria-current={active ? "true" : undefined}
                      className="block rounded-md px-1 py-0.5 text-sm hover:text-primary"
                    >
                      <span className="font-semibold">
                        Version {version.version}
                        {active ? " · viewing" : ""}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {formatDateTime(version.created_at)} ·{" "}
                        {version.source_update_ids.length} source{" "}
                        {version.source_update_ids.length === 1
                          ? "update"
                          : "updates"}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

interface ToggleRowProps {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: () => void;
}

function ToggleRow({ id, label, hint, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
