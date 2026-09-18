import { redirect } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectAdmin } from "@/components/admin/project-admin";
import { PeopleAdmin } from "@/components/admin/people-admin";
import { CycleAdmin } from "@/components/admin/cycle-admin";
import {
  getProfiles,
  getProjectsWithContext,
  getReportingCycles,
  getSessionContext,
} from "@/lib/data/queries";
import { canAdminister } from "@/lib/domain/status";

export default async function AdminPage() {
  const session = await getSessionContext();
  if (!session) return null;
  if (!canAdminister(session.profile.role)) redirect("/");

  if (!session.portfolio) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
        <h1 className="text-lg font-bold">No portfolio configured</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          The reporting portfolio has not been set up yet, so projects and cycles
          cannot be managed.
        </p>
      </div>
    );
  }

  const [projects, people, cycles] = await Promise.all([
    getProjectsWithContext(null),
    getProfiles(),
    getReportingCycles(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-bold tracking-[0.1em] text-primary uppercase">
          Administration
        </p>
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight">
          Manage {session.portfolio.name}
        </h1>
        <p className="mt-1.5 max-w-[70ch] text-sm text-muted-foreground">
          Projects, people, and reporting cycles. Every change here is written to
          the audit trail against your NTID.
        </p>
      </div>

      <Tabs defaultValue="projects">
        <TabsList>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="cycles">Reporting cycles</TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-5">
          <ProjectAdmin
            projects={projects}
            people={people.filter((person) => person.active)}
            portfolio={session.portfolio}
          />
        </TabsContent>

        <TabsContent value="people" className="mt-5">
          <PeopleAdmin people={people} currentProfileId={session.profile.id} />
        </TabsContent>

        <TabsContent value="cycles" className="mt-5">
          <CycleAdmin cycles={cycles} portfolio={session.portfolio} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
