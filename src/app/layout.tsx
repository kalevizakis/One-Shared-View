import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";

// Pfizer Tomorrow font (local)
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

// Pfizer Diatype font (local) - Multiple weights
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
  title: "Spark Build",
  description: "Build apps, sites, and presentations from just an idea",
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
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
