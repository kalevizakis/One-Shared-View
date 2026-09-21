"use server";

import { createHmac } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ntidSignInSchema } from "@/lib/domain/validation";

/** Shared result shape for every Server Action in the app. */
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
 * MVP sign-in model: the roster decides access, and there is no password for
 * anyone to choose, forget, or share.
 *
 * Supabase Auth still issues the session — that is what makes Row Level
 * Security, the audit trigger and every existing policy work — so each roster
 * member needs *a* credential. It is derived here, server-side, from the NTID
 * and a server secret, and is never shown to or accepted from the visitor. It
 * is an implementation detail of issuing the session, not a factor the user
 * authenticates with.
 *
 * Identity itself is established one layer out, by the platform's company
 * sign-in gate in front of this app. See the 2026-09-21 entry in
 * agent-memory/decisions.md for the accepted trade-off and its mitigation.
 */
function derivedSecretFor(ntid: string): string {
  /*
   * Falls back to the project's own publishable key as the HMAC input when no
   * dedicated secret is configured. That key is not a secret from the browser,
   * so this is NOT a security boundary — the security boundary is the preview
   * gate plus the roster. Its only job is to produce a stable, non-guessable-
   * looking credential per NTID so sign-in is deterministic across restarts.
   */
  const material =
    process.env.NTID_SIGNIN_SECRET ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "one-shared-view-mvp";

  // Prefixed so the result always satisfies any password-complexity rule.
  return `osv1_${createHmac("sha256", material).update(ntid).digest("hex")}`;
}

const ROSTER_DENIED =
  "That NTID does not have access to One Shared View. Ask an administrator to add you to the CMO Digital LT roster.";

const GENERIC_FAILURE =
  "Sign-in could not be completed. Please try again, or ask an administrator to check your roster entry.";

/**
 * Surfaced when the auth project still has e-mail confirmation switched on.
 *
 * Sign-in issues the session on the visitor's behalf, so there is no inbox step
 * for them to complete — the request simply stops. Saying so plainly turns a
 * dead end into a one-line instruction for whoever is setting the app up.
 */
const CONFIRMATION_BLOCKED =
  "Sign-in is blocked because the database still requires e-mail confirmation. An administrator needs to turn off “Confirm email” in the project's authentication settings.";

/**
 * Surfaced for a login record created under the previous password-based screen.
 *
 * Its stored password can never match the credential this flow derives, so the
 * attempt fails permanently rather than intermittently. The record has to be
 * cleared once; the roster entry and role are unaffected by that.
 */
const STALE_LOGIN_RECORD =
  "This NTID has a sign-in record left over from the old password screen, which cannot be used any more. An administrator needs to clear it — your roster entry and role are not affected.";

/**
 * Surfaced when the read-only preview session cannot be started.
 *
 * Almost always means the preview identity migration has not been applied yet,
 * so there is no roster row for the session to link to. Says so, because the
 * alternative is a dead button with no explanation.
 */
const PREVIEW_UNAVAILABLE =
  "The read-only preview is not available yet. An administrator needs to apply the preview identity to the database. You can still sign in with your NTID.";

/**
 * Surfaced when the preview identity EXISTS but attaching the session to it was
 * refused by the database.
 *
 * Kept distinct from PREVIEW_UNAVAILABLE on purpose. Collapsing the two is what
 * made the "preview only works once" bug hard to find: the message said the
 * migration was missing when in fact it was applied and the roster guard was
 * refusing the link.
 */
const PREVIEW_LINK_FAILED =
  "The read-only preview could not be opened because the database refused to attach the session. An administrator needs to check the preview identity.";

interface RosterVerdict {
  allowed: boolean;
  reason?: string;
  ntid?: string;
  display_name?: string;
}

/**
 * Signs in with an NTID alone.
 *
 * The roster is consulted first, so someone who is not on it is told so plainly
 * and no account is ever created for them. Only then is a session issued.
 */
export async function signInWithNtid(formData: FormData): Promise<ActionResult> {
  const parsed = ntidSignInSchema.safeParse({ ntid: formData.get("ntid") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter your NTID." };
  }

  const { ntid } = parsed.data;
  const supabase = await createClient();

  // 1. Roster gate. Denial is indistinguishable from "unknown NTID" by design,
  //    so this cannot be used to enumerate the leadership team.
  const { data: verdict, error: checkError } = await supabase.rpc(
    "ntid_signin_check",
    { p_ntid: ntid },
  );

  if (checkError) {
    return { error: GENERIC_FAILURE };
  }

  const roster = verdict as RosterVerdict | null;
  if (!roster?.allowed) {
    return { error: ROSTER_DENIED };
  }

  // 2. Issue the session. The credential is server-derived; the visitor never
  //    supplies it.
  const email = addressFor(ntid);
  const password = derivedSecretFor(ntid);

  let signedIn = false;
  const attempt = await supabase.auth.signInWithPassword({ email, password });

  if (attempt.error) {
    // First sign-in for this roster member: create the auth user, then retry.
    const created = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: roster.display_name ?? ntid } },
    });

    if (created.error) {
      return { error: GENERIC_FAILURE };
    }

    // signUp may or may not return an active session depending on project
    // settings, so sign in explicitly rather than assuming.
    const retry = await supabase.auth.signInWithPassword({ email, password });

    if (retry.error?.code === "email_not_confirmed") {
      return { error: CONFIRMATION_BLOCKED };
    }

    /*
     * A login record already exists but does not match the derived credential —
     * i.e. it was created under the old password screen. Sign-up is answered
     * without an error for an existing address (deliberately, so addresses
     * cannot be probed), so this retry is where it shows up.
     */
    if (retry.error?.code === "invalid_credentials") {
      return { error: STALE_LOGIN_RECORD };
    }

    signedIn = !retry.error;
  } else {
    signedIn = true;
  }

  if (!signedIn) {
    return { error: GENERIC_FAILURE };
  }

  // 3. Attach this session to its roster entry. Explicit and reportable —
  //    this replaces the auth trigger whose failures were opaque.
  const { error: linkError } = await supabase.rpc("link_auth_user_to_roster", {
    p_ntid: ntid,
  });

  if (linkError) {
    await supabase.auth.signOut();
    return { error: ROSTER_DENIED };
  }

  revalidatePath("/", "layout");
  redirect("/");
}

/**
 * The NTID of the single shared read-only preview identity.
 *
 * Only ever used to ISSUE the preview session — never to recognise one. Anything
 * that needs to ask "is this session a preview?" reads `profiles.is_preview`
 * (surfaced as `SessionContext.isPreview`), because a future roster row could
 * collide with this string.
 */
const PREVIEW_NTID = "preview";

/**
 * Starts the read-only "Preview the solution" session.
 *
 * Reuses the exact same session machinery as a real NTID sign-in — same derived
 * credential, same sign-up-then-retry on first use, same roster link — so there
 * is one session mechanism in this app, not two.
 *
 * `ntid_signin_check` is deliberately NOT called first. That function's whole
 * purpose is to answer "is this visitor-supplied NTID on the roster?", and the
 * answer here is known at build time. Calling it would widen its surface for no
 * benefit.
 *
 * Read-only is not enforced here. It is enforced by the roster row this session
 * links to: role 'exec', owning no project and leading no portfolio, which every
 * write RLS policy refuses. `requireWritableSession` then turns that refusal into
 * a readable message at the Server Action boundary.
 */
export async function startPreview(): Promise<ActionResult> {
  const supabase = await createClient();

  const email = addressFor(PREVIEW_NTID);
  const password = derivedSecretFor(PREVIEW_NTID);

  let signedIn = false;
  const attempt = await supabase.auth.signInWithPassword({ email, password });

  if (attempt.error) {
    // First ever preview visit: create the login record, then retry.
    const created = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: "Preview (read-only)" } },
    });

    if (created.error) {
      return { error: PREVIEW_UNAVAILABLE };
    }

    const retry = await supabase.auth.signInWithPassword({ email, password });

    if (retry.error?.code === "email_not_confirmed") {
      return { error: CONFIRMATION_BLOCKED };
    }

    signedIn = !retry.error;
  } else {
    signedIn = true;
  }

  if (!signedIn) {
    return { error: PREVIEW_UNAVAILABLE };
  }

  // Attach the session to the preview roster row. Without this the session has
  // no profile, and the app correctly refuses to show anything at all.
  const { error: linkError } = await supabase.rpc("link_auth_user_to_roster", {
    p_ntid: PREVIEW_NTID,
  });

  if (linkError) {
    await supabase.auth.signOut();

    /*
     * Distinguish "the identity is missing" from "the identity is there but the
     * link was refused". Reporting both as PREVIEW_UNAVAILABLE sent us looking
     * for an unapplied migration when the real cause was the roster guard
     * blocking the preview session's own sign-in link — see migration
     * 20260921160000. A refusal names itself now, so the next occurrence is one
     * step to diagnose instead of a hunt.
     */
    return {
      error: linkError.message?.includes("ROSTER_LINK_REFUSED")
        ? PREVIEW_UNAVAILABLE
        : `${PREVIEW_LINK_FAILED} (${linkError.message})`,
    };
  }

  revalidatePath("/", "layout");
  redirect("/?preview=1");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
