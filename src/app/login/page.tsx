import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in · One Shared View",
};

interface LoginPageProps {
  searchParams: Promise<{ switch?: string }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { switch: switching } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      {/*
        `switch=1` means the visitor came here from an existing session — in
        practice, out of the read-only preview. Signing in below replaces that
        session, so the form needs no special handling; the note just explains
        why they are seeing a sign-in screen while already "in".
      */}
      <LoginForm leavingPreview={switching === "1"} />
    </div>
  );
}
