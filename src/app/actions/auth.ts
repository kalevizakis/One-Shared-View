"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { registerSchema, signInSchema } from "@/lib/domain/validation";

export interface ActionResult {
  error?: string;
  message?: string;
}

/**
 * NTID identities are mapped onto the platform's approved internal auth by
 * deriving a stable company address from the NTID. Nothing leaves the
 * environment, and the NTID remains the identity in every record and audit row.
 */
const NTID_DOMAIN = "pfizer.com";

function addressFor(ntid: string): string {
  return `${ntid}@${NTID_DOMAIN}`;
}

/**
 * Roster membership is checked by the database during sign-up, never by a
 * pre-authentication lookup — answering "is this NTID on the roster?" to an
 * anonymous caller would let anyone enumerate the team.
 */
const ROSTER_REJECTION =
  "That NTID is not on the CMO Digital LT roster. Ask an administrator to add you.";

function describeSignUpError(message: string): string {
  if (message.includes("NTID_NOT_ON_ROSTER")) return ROSTER_REJECTION;
  if (/already registered|already exists/i.test(message)) {
    return "That NTID already has an account — sign in instead.";
  }
  return "That account could not be created. Check your details and try again.";
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({
    ntid: formData.get("ntid"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: addressFor(parsed.data.ntid),
    password: parsed.data.password,
  });

  if (error) {
    return { error: "That NTID and password combination was not recognised." };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function register(formData: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse({
    ntid: formData.get("ntid"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: addressFor(parsed.data.ntid),
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.displayName } },
  });

  if (error) {
    return { error: describeSignUpError(error.message) };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
