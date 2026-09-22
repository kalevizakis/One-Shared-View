/**
 * Builds a mailto: URL that opens a pre-filled draft in the sender's local
 * email client. Browsers cannot press Send — the sender must confirm.
 *
 * An application link is only appended when a deployed public URL is known.
 * Localhost links are useless once the draft sits in Outlook/Mail.
 */

export interface ReminderMailDraft {
  to: string;
  projectName: string;
  cycleName: string;
  ownerDisplayName?: string;
}

export function publicAppUrl(): string | null {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.PUBLIC_APP_URL?.trim() ||
    "";
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function buildReminderMailto(
  draft: ReminderMailDraft,
  appUrl: string | null = publicAppUrl(),
): string {
  const subject = `Reminder: weekly update for ${draft.projectName} (${draft.cycleName})`;
  const greeting = draft.ownerDisplayName
    ? `Hello ${draft.ownerDisplayName},`
    : "Hello,";
  const lines = [
    greeting,
    "",
    `Your weekly update for ${draft.projectName} is still outstanding for ${draft.cycleName}.`,
    "Please submit it when you can so the portfolio view stays current.",
  ];
  if (appUrl) {
    lines.push("", `Open One Shared View: ${appUrl}`);
  }
  lines.push("", "Thank you.");

  const params = new URLSearchParams({
    subject,
    body: lines.join("\n"),
  });

  // Validated addresses contain only safe characters; keep @ unescaped so the
  // OS mail client receives a normal mailbox rather than %40.
  const query = params.toString().replace(/\+/g, "%20");
  return `mailto:${draft.to}?${query}`;
}
