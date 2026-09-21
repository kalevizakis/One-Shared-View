import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";

const pfizerTomorrow = localFont({
  src: [
    {
      path: "../../public/fonts/PfizerTomorrow-Regular.woff2",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-pfizer-tomorrow",
  fallback: ["Arial", "sans-serif"],
});

const pfizerDiatype = localFont({
  src: [
    {
      path: "../../public/fonts/PfizerDiatype-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../public/fonts/PfizerDiatype-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../public/fonts/PfizerDiatype-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-pfizer-diatype",
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "One Shared View",
  description:
    "One structured weekly update per project — a current portfolio view and leadership-ready reports for the CMO Digital LT.",
  /*
   * Never indexed. This application holds internal delivery information — real
   * names, job titles, project health and leadership asks — and the read-only
   * preview makes some of it reachable to anyone inside Pfizer holding the link.
   * None of it belongs in a search index, so the refusal is declared once here
   * for every route rather than per page.
   */
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${pfizerTomorrow.variable} ${pfizerDiatype.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
          >
            Skip to main content
          </a>
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
