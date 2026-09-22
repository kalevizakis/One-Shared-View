import { z } from "zod";

const requiredText = (label: string, min = 1) =>
  z
    .string()
    .trim()
    .min(min, `${label} is required.`);

export const healthValues = ["on_track", "at_risk", "blocked"] as const;
export const impactValues = ["high", "medium", "low"] as const;

/**
 * Weekly update schema. Validation tightens with health:
 *  - At risk / Blocked → blocker, leadership ask and a reason are required.
 *  - Blocked           → also a next action and an accountable owner.
 * The same rules are enforced in the database (see the init migration), so a
 * non-compliant update cannot be persisted by any client.
 */
export const projectUpdateSchema = z
  .object({
    projectId: z.string().uuid("Select a project."),
    reportingCycleId: z.string().uuid("Select a reporting period."),
    health: z.enum(healthValues),
    impact: z.enum(impactValues).optional().or(z.literal("")),
    accomplishments: z.string().trim().max(2000).optional().or(z.literal("")),
    nextSteps: z.string().trim().max(2000).optional().or(z.literal("")),
    blockerOrRisk: z.string().trim().max(1000).optional().or(z.literal("")),
    leadershipAsk: z.string().trim().max(1000).optional().or(z.literal("")),
    healthChangeReason: z.string().trim().max(1000).optional().or(z.literal("")),
    nextAction: z.string().trim().max(1000).optional().or(z.literal("")),
    nextActionOwnerProfileId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .or(z.null()),
    nextMilestoneName: z.string().trim().max(200).optional().or(z.literal("")),
    nextMilestoneDate: z.string().trim().optional().or(z.literal("")),
    intent: z.enum(["draft", "submit"]),
  })
  .superRefine((value, ctx) => {
    if (value.intent !== "submit") return;

    const needsExceptionDetail =
      value.health === "at_risk" || value.health === "blocked";
    const healthLabel = value.health === "blocked" ? "Blocked" : "At risk";

    if (needsExceptionDetail) {
      if (!value.blockerOrRisk?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["blockerOrRisk"],
          message: `A blocker or risk is required when health is ${healthLabel}.`,
        });
      }
      if (!value.leadershipAsk?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["leadershipAsk"],
          message: `A leadership ask is required when health is ${healthLabel}.`,
        });
      }
      if (!value.healthChangeReason?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["healthChangeReason"],
          message: `A reason is required when health is ${healthLabel}.`,
        });
      }
    }

    if (value.health === "blocked") {
      if (!value.nextAction?.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["nextAction"],
          message: "A next action is required when a project is Blocked.",
        });
      }
      if (!value.nextActionOwnerProfileId) {
        ctx.addIssue({
          code: "custom",
          path: ["nextActionOwnerProfileId"],
          message:
            "An accountable owner for the next action is required when Blocked.",
        });
      }
    }
  });

export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

export const ntidSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Enter your NTID.")
  .max(20, "That NTID looks too long.")
  .regex(/^[a-z0-9]+$/, "An NTID contains only letters and numbers.");

/**
 * MVP sign-in takes an NTID and nothing else — the roster decides access and
 * there is no password for anyone to choose or mistype. See the 2026-09-21
 * decision record for the trade-off this accepts.
 */
export const ntidSignInSchema = z.object({
  ntid: ntidSchema,
});

export const reportSchema = z.object({
  reportingCycleId: z.string().uuid(),
  title: requiredText("Report title", 3).max(200),
  audience: requiredText("Audience", 3).max(120),
  narrative: z.string().trim().max(4000).optional().or(z.literal("")),
  includeProjectDetail: z.boolean(),
  includeStaleUpdates: z.boolean(),
  includeLeadershipAsks: z.boolean(),
});

export type ReportInput = z.infer<typeof reportSchema>;

const optionalUuid = z.string().uuid().nullable().optional();

export const projectSchema = z.object({
  id: optionalUuid,
  name: requiredText("Project name", 3).max(200),
  executiveSummary: requiredText("Executive summary", 20).max(1200),
  expectedValue: z.string().trim().max(1200).optional().or(z.literal("")),
  portfolioId: z.string().uuid("Select a portfolio."),
  ownerProfileId: optionalUuid,
  leadProfileId: optionalUuid,
  lifecycleStatus: z.enum([
    "proposed",
    "active",
    "on_hold",
    "complete",
    "cancelled",
  ]),
  reportingCadence: z.enum(["weekly", "monthly"]),
});

export const profileRoleSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["owner", "lead", "exec", "admin"]),
  active: z.boolean(),
});

export const deleteInactiveProfileSchema = z.object({
  id: z.string().uuid("Select a person."),
});

/**
 * Corporate contact email. Kept separate from the NTID-derived auth address —
 * this is the real mailbox a lead opens when reminding an owner.
 */
export const contactEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(5, "Enter a corporate email address.")
  .max(254, "That email address looks too long.")
  .email("Enter a valid email address.")
  .regex(
    /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/,
    "Enter a valid email address.",
  );

export const profileContactSchema = z.object({
  profileId: z.string().uuid("Select a person."),
  email: contactEmailSchema,
});

export const cycleSchema = z
  .object({
    id: optionalUuid,
    portfolioId: z.string().uuid("Select a portfolio."),
    name: requiredText("Cycle name", 3).max(120),
    cadence: z.enum(["weekly", "monthly"]),
    startsAt: requiredText("Start date"),
    dueAt: requiredText("Submission deadline"),
    closesAt: requiredText("Close date"),
    status: z.enum(["upcoming", "open", "locked", "closed"]),
  })
  .superRefine((value, ctx) => {
    if (value.dueAt < value.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["dueAt"],
        message: "The deadline cannot be before the start date.",
      });
    }
    if (value.closesAt < value.dueAt) {
      ctx.addIssue({
        code: "custom",
        path: ["closesAt"],
        message: "The close date cannot be before the deadline.",
      });
    }
  });

export const deleteCycleSchema = z.object({
  id: z.string().uuid("Select a reporting cycle."),
});
