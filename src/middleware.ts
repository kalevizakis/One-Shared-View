import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/login", "/auth"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  /*
   * Server Action POSTs must never be answered with a redirect from here.
   * The client expects the React Flight stream an action returns; a 307 makes
   * it throw "An unexpected response was received from the server." The action
   * does its own redirecting internally, so let every action POST through and
   * only guard document navigations.
   */
  const isServerAction =
    request.method === "POST" && request.headers.has("next-action");

  if (isServerAction) {
    return response;
  }

  if (!data?.claims && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  /*
   * A session already exists, so /login normally has nothing to offer and the
   * visitor is sent on to the app.
   *
   * `?switch=1` is the deliberate exception: it means "I am here on purpose to
   * sign in as somebody else". Without it, a read-only preview visitor who wants
   * to sign in properly is bounced straight back to the preview and can never
   * reach the NTID form — the preview banner's sign-in link would be a dead end.
   *
   * An explicit intent flag is used rather than looking up `profiles.is_preview`
   * here, for two reasons: middleware runs on every single request, so a roster
   * query would be a database round trip per navigation; and the JWT carries no
   * roster data, only auth claims. It also fixes the same dead end for a real
   * user who wants to switch accounts.
   */
  if (data?.claims && pathname === "/login") {
    if (request.nextUrl.searchParams.get("switch") === "1") {
      return response;
    }

    const url = request.nextUrl.clone();
    // Honour ?next= so a deep link survives the sign-in round trip, but only
    // for internal paths — an absolute URL here would be an open redirect.
    const next = request.nextUrl.searchParams.get("next");
    url.pathname = next?.startsWith("/") && !next.startsWith("//") ? next : "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.svg$).*)"],
};
