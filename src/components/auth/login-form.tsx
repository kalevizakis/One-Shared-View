"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signInWithNtid } from "@/app/actions/auth";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await signInWithNtid(formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="w-full max-w-md">
      <div className="rounded-2xl border border-border bg-card p-7 shadow-sm">
        <div className="mb-6 space-y-2">
          <p className="text-xs font-bold tracking-[0.1em] text-primary uppercase">
            CMO DIGITAL LT
          </p>
          <h1 className="text-2xl font-bold">One Shared View</h1>
          <p className="text-sm text-muted-foreground">
            Enter your NTID to continue. Access is granted to the CMO Digital LT
            roster.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="ntid">NTID</Label>
            <Input
              id="ntid"
              name="ntid"
              autoComplete="username"
              placeholder="Your NTID"
              required
              minLength={3}
              maxLength={20}
              pattern="[A-Za-z0-9]+"
              className="lowercase"
              autoFocus
              aria-describedby="ntid-help"
            />
            <p id="ntid-help" className="text-xs text-muted-foreground">
              No password needed — your NTID is checked against the roster.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Checking the roster
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </form>

        {error ? (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      <p className="mt-4 flex items-start gap-2 px-1 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        This application holds internal delivery information. Access is limited to
        the CMO Digital LT roster and every change is recorded in the audit trail.
      </p>
    </div>
  );
}
