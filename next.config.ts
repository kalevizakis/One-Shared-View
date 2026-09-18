import type { NextConfig } from "next";
import { execSync } from "child_process";

// Get the current git branch name
function getBranchName(): string {
  try {
    const branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    // Sanitize branch name to be filesystem-friendly
    return branch.replace(/[^a-zA-Z0-9-_]/g, "_");
  } catch {
    console.warn("Failed to get git branch name, using default .next");
    return ".next";
  }
}

// Determine the dist directory based on the environment
function getDistDir(): string {
  // If NEXT_DIST_DIR is explicitly set, use it
  if (process.env.NEXT_DIST_DIR) {
    return process.env.NEXT_DIST_DIR;
  }

  if (process.env.IS_PREVIEW_BUILD === 'true') {
    // For preview production builds, use branch-specific directory
    const branchName = getBranchName();
    return `.next-${branchName}`;
  }

  return ".next";
}

/**
 * Bridges the BenchStack CI/CD variable names into the `NEXT_PUBLIC_` names that
 * Next.js is willing to inline into the browser bundle.
 *
 * Next only embeds `NEXT_PUBLIC_`-prefixed variables into client-side code, so
 * `PUBLIC_SUPABASE_URL` alone never reaches the browser. The `env` config key is
 * the supported escape hatch: whatever we map here is inlined under the given
 * name. (`publicRuntimeConfig` is the older workaround and is NOT supported in
 * the App Router, so it is not an option here.)
 *
 * This is BUILD-time substitution, not runtime: the variables must be present in
 * the environment of the build step itself, not merely bound at Worker runtime.
 *
 * Keys are only added when a value actually exists. Mapping a key to `undefined`
 * would clobber the real value that the Dev Preview `.env` provides.
 */
function supabasePublicEnv(): Record<string, string> {
  const mapped: Record<string, string> = {};

  const url =
    process.env.PUBLIC_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key =
    process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (url) mapped.NEXT_PUBLIC_SUPABASE_URL = url;
  if (key) mapped.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = key;

  return mapped;
}

const nextConfig: NextConfig = {
  env: supabasePublicEnv(),
  allowedDevOrigins: ["*.captain.digitalpfizer.com", "*.build.bench.pfizer", "*.dev.build.bench.pfizer"],
  devIndicators: false,
  distDir: getDistDir(),
  images: {
    unoptimized: process.env.IS_PREVIEW_BUILD === "true",
  },
};

export default nextConfig;
