"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Clock } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { HealthBadge } from "@/components/shared/health-badge";
import { cn } from "@/lib/utils";
import {
  HEALTH_LABEL,
  formatShortDate,
  isOverdue,
  isStale,
  relativeDay,
} from "@/lib/domain/status";
import type { HealthStatus, Profile, ProjectWithContext } from "@/types/database";

type HealthFilter = "all" | HealthStatus | "missing";
type FreshnessFilter = "all" | "fresh" | "stale" | "missing";

interface ProjectTableProps {
  projects: ProjectWithContext[];
  leads: Profile[];
}

export function ProjectTable({ projects, leads }: ProjectTableProps) {
  const [health, setHealth] = useState<HealthFilter>("all");
  const [freshness, setFreshness] = useState<FreshnessFilter>("all");
  const [leadId, setLeadId] = useState<string>("all");

  const filtered = useMemo(() => {
    return projects.filter((project) => {
      const update = project.currentUpdate;
      const submitted = update?.status === "submitted";
      const effectiveHealth = submitted ? update.health : project.current_health;

      if (health === "missing" && submitted) return false;
      if (health !== "all" && health !== "missing") {
        if (!submitted || effectiveHealth !== health) return false;
      }

      if (freshness === "missing" && submitted) return false;
      if (freshness === "fresh") {
        if (!submitted || isStale(update.submitted_at)) return false;
      }
      if (freshness === "stale") {
        if (!submitted || !isStale(update.submitted_at)) return false;
      }

      if (leadId !== "all" && project.lead_profile_id !== leadId) return false;

      return true;
    });
  }, [projects, health, freshness, leadId]);

  const healthChips: { value: HealthFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "on_track", label: HEALTH_LABEL.on_track },
    { value: "at_risk", label: HEALTH_LABEL.at_risk },
    { value: "blocked", label: HEALTH_LABEL.blocked },
    { value: "missing", label: "No update" },
  ];

  return (
    <section aria-labelledby="all-projects-heading">
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 id="all-projects-heading" className="text-lg font-bold">
          All projects
        </h2>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label="Filter by project health"
          >
            {healthChips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                onClick={() => setHealth(chip.value)}
                aria-pressed={health === chip.value}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  health === chip.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {chip.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Select
              value={freshness}
              onValueChange={(value) => setFreshness(value as FreshnessFilter)}
            >
              <SelectTrigger
                className="w-[150px]"
                aria-label="Filter by update freshness"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any freshness</SelectItem>
                <SelectItem value="fresh">Current</SelectItem>
                <SelectItem value="stale">Stale</SelectItem>
                <SelectItem value="missing">Missing</SelectItem>
              </SelectContent>
            </Select>

            {leads.length > 0 ? (
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger className="w-[150px]" aria-label="Filter by lead">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any lead</SelectItem>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-secondary hover:bg-secondary">
              <TableHead className="text-[0.6875rem] font-bold tracking-wide uppercase">
                Project
              </TableHead>
              <TableHead className="text-[0.6875rem] font-bold tracking-wide uppercase">
                Owner
              </TableHead>
              <TableHead className="text-[0.6875rem] font-bold tracking-wide uppercase">
                Health
              </TableHead>
              <TableHead className="text-[0.6875rem] font-bold tracking-wide uppercase">
                Next milestone
              </TableHead>
              <TableHead className="text-[0.6875rem] font-bold tracking-wide uppercase">
                Updated
              </TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-sm text-muted-foreground"
                >
                  No projects match these filters.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((project) => {
                const update = project.currentUpdate;
                const submitted = update?.status === "submitted";
                const stale = submitted && isStale(update.submitted_at);
                const milestoneOverdue = isOverdue(
                  project.nextMilestone?.target_date ?? null,
                );

                return (
                  <TableRow key={project.id}>
                    <TableCell className="align-top">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {project.name}
                      </Link>
                      <span className="mt-1 block text-[0.6875rem] text-muted-foreground">
                        {project.description?.split("—")[0]?.trim() ||
                          "CMO Digital"}
                      </span>
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {project.owner?.display_name ?? "Unassigned"}
                      {project.owner ? (
                        <span className="mt-1 block text-[0.6875rem] text-muted-foreground">
                          {project.owner.ntid.toUpperCase()}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <HealthBadge
                        health={submitted ? update.health : project.current_health}
                      />
                      {!submitted ? (
                        <span className="mt-1.5 flex items-center gap-1 text-[0.6875rem] font-semibold text-status-at-risk">
                          <AlertTriangle className="size-3" aria-hidden />
                          Update missing
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {project.nextMilestone?.name ?? "—"}
                      {project.nextMilestone ? (
                        <span
                          className={cn(
                            "mt-1 block text-[0.6875rem]",
                            milestoneOverdue
                              ? "font-semibold text-status-blocked"
                              : "text-muted-foreground",
                          )}
                        >
                          {milestoneOverdue
                            ? "Overdue"
                            : formatShortDate(project.nextMilestone.target_date)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top text-sm">
                      {submitted ? relativeDay(update.submitted_at) : "—"}
                      {stale ? (
                        <span className="mt-1 flex items-center gap-1 text-[0.6875rem] font-semibold text-status-at-risk">
                          <Clock className="size-3" aria-hidden />
                          Stale
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="align-top">
                      <Button
                        asChild
                        variant="ghost"
                        size="icon"
                        className="size-8"
                      >
                        <Link
                          href={`/projects/${project.id}`}
                          aria-label={`Open ${project.name}`}
                        >
                          <ArrowUpRight className="size-4" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="mt-2.5 text-xs text-muted-foreground" aria-live="polite">
        Showing {filtered.length} of {projects.length} projects.
      </p>
    </section>
  );
}
