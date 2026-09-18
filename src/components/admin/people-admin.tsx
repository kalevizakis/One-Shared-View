"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { addRosterPerson, saveProfileAccess } from "@/app/actions/admin";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/lib/domain/status";
import type { Profile, UserRole } from "@/types/database";

const ROLES = Object.keys(ROLE_LABEL) as UserRole[];

interface PeopleAdminProps {
  people: Profile[];
  currentProfileId: string;
}

export function PeopleAdmin({ people, currentProfileId }: PeopleAdminProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [newPerson, setNewPerson] = useState({
    ntid: "",
    displayName: "",
    jobTitle: "",
    role: "owner" as UserRole,
  });

  function updateAccess(person: Profile, role: UserRole, active: boolean) {
    const formData = new FormData();
    formData.set("id", person.id);
    formData.set("role", role);
    formData.set("active", active ? "on" : "");

    startTransition(async () => {
      const result = await saveProfileAccess(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Access updated.");
      router.refresh();
    });
  }

  function addPerson() {
    const formData = new FormData();
    formData.set("ntid", newPerson.ntid);
    formData.set("displayName", newPerson.displayName);
    formData.set("jobTitle", newPerson.jobTitle);
    formData.set("role", newPerson.role);

    startTransition(async () => {
      const result = await addRosterPerson(formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(result.message ?? "Person added.");
      setNewPerson({ ntid: "", displayName: "", jobTitle: "", role: "owner" });
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">People and access</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Only NTIDs on this roster can sign in. Role changes are audited.
          </p>
        </div>
        <Button onClick={() => setAdding(true)} disabled={adding}>
          <Plus className="size-4" />
          Add person
        </Button>
      </div>

      {adding ? (
        <form
          className="rounded-xl border border-border bg-card p-5"
          onSubmit={(event) => {
            event.preventDefault();
            addPerson();
          }}
        >
          <h3 className="text-base font-bold">Add to roster</h3>
          <fieldset disabled={pending} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="new-ntid">NTID</Label>
              <Input
                id="new-ntid"
                value={newPerson.ntid}
                onChange={(event) =>
                  setNewPerson({
                    ...newPerson,
                    ntid: event.target.value.toLowerCase(),
                  })
                }
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name">Full name</Label>
              <Input
                id="new-name"
                value={newPerson.displayName}
                onChange={(event) =>
                  setNewPerson({ ...newPerson, displayName: event.target.value })
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-title">Job title</Label>
              <Input
                id="new-title"
                value={newPerson.jobTitle}
                onChange={(event) =>
                  setNewPerson({ ...newPerson, jobTitle: event.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-role">Role</Label>
              <Select
                value={newPerson.role}
                onValueChange={(value) =>
                  setNewPerson({ ...newPerson, role: value as UserRole })
                }
              >
                <SelectTrigger id="new-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ROLE_DESCRIPTION[newPerson.role]}
              </p>
            </div>
          </fieldset>

          <div className="mt-5 flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Add person
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAdding(false)}
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
              <TableHead>Name</TableHead>
              <TableHead>NTID</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead className="w-[190px]">Role</TableHead>
              <TableHead className="w-[130px]">Access</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {people.map((person) => (
              <TableRow key={person.id}>
                <TableCell>
                  <span className="font-medium">{person.display_name}</span>
                  {person.job_title ? (
                    <span className="block text-xs text-muted-foreground">
                      {person.job_title}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm">{person.ntid}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {person.auth_user_id ? "Yes" : "Not yet"}
                </TableCell>
                <TableCell>
                  <Select
                    value={person.role}
                    onValueChange={(value) =>
                      updateAccess(person, value as UserRole, person.active)
                    }
                    disabled={pending}
                  >
                    <SelectTrigger aria-label={`Role for ${person.display_name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABEL[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={person.active}
                      onCheckedChange={(checked) =>
                        updateAccess(person, person.role, checked)
                      }
                      disabled={pending || person.id === currentProfileId}
                      aria-label={`Access for ${person.display_name}`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {person.active ? "Active" : "Disabled"}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
