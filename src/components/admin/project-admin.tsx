"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveProject } from "@/app/actions/admin";
import { LIFECYCLE_LABEL } from "@/lib/domain/status";
import type {
  LifecycleStatus,
  Portfolio,
  Profile,
  Project,
  ReportingCadence,
} from "@/types/database";

const NONE = "none";

interface ProjectAdminProps {
  projects: Project[];
  people: Profile[];
  portfolio: Portfolio;
}

interface Draft {
  id: string | null;
  name: string;
  description: string;
  ownerProfileId: string;
  leadProfileId: string;
  lifecycleStatus: LifecycleStatus;
  reportingCadence: ReportingCadence;
}

function emptyDraft(): Draft {
  return {
    id: null,
    name: "",
    description: "",
    ownerProfileId: NONE,
    leadProfileId: NONE,
    lifecycleStatus: "active",
    reportingCadence: "weekly",
  };
}

export function ProjectAdmin({ projects, people, portfolio }: ProjectAdminProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);

  const nameOf = (id: string | null) =>
    people.find((person) => person.id === id)?.display_name ?? "Unassigned";

  function edit(project: Project) {
    setDraft({
      id: project.id,
      name: project.name,
      description: project.description ?? "",
      ownerProfileId: project.owner_profile_id ?? NONE,
      leadProfileId: project.lead_profile_id ?? NONE,
      lifecycleStatus: project.lifecycle_status,
      reportingCadence: project.reporting_cadence,
    });
  }

  function save() {
    if (!draft) return;
    const formData = new FormData();
    if (draft.id) formData.set("id", draft.id);
    formData.set("portfolioId", portfolio.id);
    formData.set("name", draft.name);
    formData.set("description", draft.description);
    formData.set("ownerProfileId", draft.ownerProfileId);
    formData.set("leadProfileId", draft.leadProfileId);
    formData.set("lifecycleStatus", draft.lifecycleStatus);
    formData.set("reportingCadence", draft.reportingCadence);

    startTransition(async () => {
      const result = await saveProject(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Saved.");
      setDraft(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Projects</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Owners can only report on projects assigned to them.
          </p>
        </div>
        <Button onClick={() => setDraft(emptyDraft())} disabled={Boolean(draft)}>
          <Plus className="size-4" />
          Add project
        </Button>
      </div>

      {draft ? (
        <form
          className="rounded-xl border border-border bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <h3 className="text-base font-bold">
            {draft.id ? "Edit project" : "New project"}
          </h3>

          <fieldset disabled={pending} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input
                id="project-name"
                value={draft.name}
                onChange={(event) =>
                  setDraft({ ...draft, name: event.target.value })
                }
                maxLength={200}
                required
              />
            </div>

            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                rows={2}
                value={draft.description}
                onChange={(event) =>
                  setDraft({ ...draft, description: event.target.value })
                }
                maxLength={1000}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-owner">Project owner</Label>
              <Select
                value={draft.ownerProfileId}
                onValueChange={(value) =>
                  setDraft({ ...draft, ownerProfileId: value })
                }
              >
                <SelectTrigger id="project-owner">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.display_name} ({person.ntid})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-lead">Portfolio lead</Label>
              <Select
                value={draft.leadProfileId}
                onValueChange={(value) =>
                  setDraft({ ...draft, leadProfileId: value })
                }
              >
                <SelectTrigger id="project-lead">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.display_name} ({person.ntid})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-lifecycle">Lifecycle status</Label>
              <Select
                value={draft.lifecycleStatus}
                onValueChange={(value) =>
                  setDraft({ ...draft, lifecycleStatus: value as LifecycleStatus })
                }
              >
                <SelectTrigger id="project-lifecycle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(LIFECYCLE_LABEL) as LifecycleStatus[]).map(
                    (value) => (
                      <SelectItem key={value} value={value}>
                        {LIFECYCLE_LABEL[value]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-cadence">Reporting cadence</Label>
              <Select
                value={draft.reportingCadence}
                onValueChange={(value) =>
                  setDraft({ ...draft, reportingCadence: value as ReportingCadence })
                }
              >
                <SelectTrigger id="project-cadence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </fieldset>

          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save project
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraft(null)}
              disabled={pending}
            >
              <X className="size-4" />
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Lead</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell className="font-medium">{project.name}</TableCell>
                <TableCell className="text-sm">
                  {nameOf(project.owner_profile_id)}
                </TableCell>
                <TableCell className="text-sm">
                  {nameOf(project.lead_profile_id)}
                </TableCell>
                <TableCell className="text-sm">
                  {LIFECYCLE_LABEL[project.lifecycle_status]}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => edit(project)}
                    disabled={pending}
                  >
                    Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
