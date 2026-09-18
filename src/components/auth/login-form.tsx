"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { register, signIn } from "@/app/actions/auth";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"signin" | "register">("signin");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);

    startTransition(async () => {
      const action = mode === "signin" ? signIn : register;
      const result = await action(formData);
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
            Sign in with your NTID to submit updates and view the portfolio.
          </p>
        </div>

        <Tabs
          value={mode}
          onValueChange={(value) => {
            setMode(value as "signin" | "register");
            setError(null);
          }}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="register">First time</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="mt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <NtidField />
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={8}
                />
              </div>
              <SubmitButton pending={pending} label="Sign in" />
            </form>
          </TabsContent>

          <TabsContent value="register" className="mt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <NtidField />
              <div className="space-y-2">
                <Label htmlFor="displayName">Your name</Label>
                <Input
                  id="displayName"
                  name="displayName"
                  autoComplete="name"
                  placeholder="First and last name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-password">Choose a password</Label>
                <Input
                  id="register-password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
                <p className="text-xs text-muted-foreground">
                  At least 8 characters. Your NTID must already be on the LT roster.
                </p>
              </div>
              <SubmitButton pending={pending} label="Create my access" />
            </form>
          </TabsContent>
        </Tabs>

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

function NtidField() {
  return (
    <div className="space-y-2">
      <Label htmlFor="ntid">NTID</Label>
      <Input
        id="ntid"
        name="ntid"
        autoComplete="username"
        placeholder="Your NTID"
        required
        minLength={3}
        pattern="[A-Za-z0-9]+"
        className="lowercase"
      />
    </div>
  );
}

function SubmitButton({ pending, label }: { pending: boolean; label: string }) {
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Please wait
        </>
      ) : (
        label
      )}
    </Button>
  );
}
