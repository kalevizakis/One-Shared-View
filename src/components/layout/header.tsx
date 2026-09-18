"use client"

import Link from "next/link"
import Image from "next/image"
import { ThemeToggle } from "./theme-toggle"

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 md:px-6 lg:px-8 flex h-16 items-center justify-between">
        {/* Logo/Brand */}
        <Link
          href="/"
          className="group flex items-center gap-3 transition-all duration-300 hover:scale-105"
        >
          <Image
            src="/pfizer-logo.svg"
            alt="Pfizer"
            width={28}
            height={27}
            className="h-auto transition-transform duration-300 group-hover:rotate-12"
          />
          <h3 className="font-bold text-lg bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            [Your Project]
          </h3>
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center gap-8">
          <Link
            href="/"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground relative group"
          >
            Home
            <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-primary rounded-full transition-all duration-300 group-hover:w-full" />
          </Link>
        </nav>

        {/* Theme Toggle */}
        <ThemeToggle />
      </div>
    </header>
  )
}
