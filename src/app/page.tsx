"use client";

import {
  Globe,
  Presentation,
  Smartphone,
} from "lucide-react";
import { useState } from "react";

import { SparkBolt } from "@/components/layout/spark-bolt";

export default function Home() {
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const copyToClipboard = async (text: string, id: string) => {
    try {
      // Remove surrounding quotes before copying
      const cleanText = text.replace(/^"(.+)"$/, '$1');
      await navigator.clipboard.writeText(cleanText);
      setCopiedIndex(id);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Animated Background Gradient Orbs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/4 h-[800px] w-[800px] rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-transparent blur-3xl animate-float-slow" />
        <div className="absolute -bottom-1/2 -right-1/4 h-[800px] w-[800px] rounded-full bg-gradient-to-br from-purple-500/20 via-pink-500/10 to-transparent blur-3xl animate-float-slower" />
        <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-blue-500/10 via-cyan-500/5 to-transparent blur-3xl animate-float" />
      </div>

      {/* Grid Pattern Overlay */}
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(to_right,hsl(var(--border)/0.1)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.1)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_110%)]" />

      {/* Main Content */}
      <div className="relative">
        {/* Hero Section */}
        <section className="flex min-h-[50vh] items-center justify-center px-4 py-12 md:py-16">
          <div className="container mx-auto max-w-6xl">
            <div className="flex flex-col items-center space-y-8 text-center">
              {/* Combined Welcome & Logo */}
              <div className="flex flex-wrap items-center justify-center gap-3 md:gap-4 animate-fadeInUp">
                <h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-transparent">
                  [Welcome to Your
                </h1>
                <div className="group flex items-center gap-2 md:gap-3 transition-all duration-300 hover:scale-105">
                  <SparkBolt
                    className="h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 lg:h-20 lg:w-20 text-primary"
                    role="img"
                    aria-label="Spark Build"
                  />
                  <h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-transparent">
                    Spark Build
                  </h1>
                </div>
                <h1 className="bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-transparent">
                  Project]
                </h1>
              </div>

              {/* Tagline with gradient */}
              <div className="space-y-4 animate-fadeInUp animate-delay-200">
                <p className="mx-auto max-w-3xl text-xl leading-relaxed text-muted-foreground md:text-3xl">
                  Turn your ideas into reality. Build{" "}
                  <span className="bg-gradient-to-r from-primary via-purple-500 to-pink-500 bg-clip-text font-semibold text-transparent">
                    apps
                  </span>
                  ,{" "}
                  <span className="bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 bg-clip-text font-semibold text-transparent">
                    websites
                  </span>
                  , and{" "}
                  <span className="bg-gradient-to-r from-orange-500 via-red-500 to-pink-500 bg-clip-text font-semibold text-transparent">
                    presentations
                  </span>{" "}
                  with just a description.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* AI Prompts Section */}
        <section id="features" className="relative px-4 py-8 md:py-16">
          <div className="container mx-auto max-w-7xl">
            {/* Section Header */}
            <div className="mb-12 md:mb-16 text-center animate-fadeInUp">
              <h2 className="mb-4 bg-gradient-to-br from-foreground via-foreground to-foreground/70 bg-clip-text text-4xl font-bold tracking-tight text-transparent md:text-5xl">
                Try These AI Prompts
              </h2>
              <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
                Get started by asking the Spark Build agent to build components and pages using these examples
              </p>
            </div>

            {/* Prompts Grid */}
            <div className="grid gap-8 md:gap-10">
              {/* Page Creation */}
              <div className="group relative animate-fadeInUp">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary via-purple-500 to-pink-500 rounded-2xl opacity-20 blur-xl group-hover:opacity-30 transition duration-500"></div>
                <div className="relative bg-gradient-to-br from-background/95 to-background/50 backdrop-blur-xl border-2 border-border rounded-2xl p-6 md:p-8">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                      <Globe className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold mb-2">Page Creation</h3>
                      <p className="text-sm text-muted-foreground">Build complete pages with pre-configured layouts</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      '"Create a dashboard page with Card components showing analytics"',
                      '"Build a contact form page using Input, Textarea, and Button components"',
                      '"Make a pricing page with Card, Badge, and Button components"'
                    ].map((prompt, i) => {
                      const id = `page-${i}`;
                      const isCopied = copiedIndex === id;
                      return (
                        <div key={i} className="group/item relative overflow-hidden rounded-xl bg-gradient-to-br from-muted/50 to-muted/20 border-2 border-border p-4 transition-all duration-300 hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10 hover:scale-[1.02]">
                          <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover/item:opacity-100 transition-opacity duration-500"></div>
                          <div className="relative flex items-start justify-between gap-4">
                            <p className="text-sm font-mono leading-relaxed text-foreground/90">{prompt}</p>
                            <button
                              onClick={() => copyToClipboard(prompt, id)}
                              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 hover:bg-primary/20 transition-all duration-200 hover:scale-110 group/btn"
                              aria-label="Copy prompt"
                            >
                              {isCopied ? (
                                <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4 text-primary group-hover/btn:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Component Layouts */}
              <div className="group relative animate-fadeInUp animate-delay-100">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 via-cyan-500 to-teal-500 rounded-2xl opacity-20 blur-xl group-hover:opacity-30 transition duration-500"></div>
                <div className="relative bg-gradient-to-br from-background/95 to-background/50 backdrop-blur-xl border-2 border-border rounded-2xl p-6 md:p-8">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-500/5 border border-blue-500/20">
                      <Smartphone className="h-6 w-6 text-blue-500" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold mb-2">Component Layouts</h3>
                      <p className="text-sm text-muted-foreground">Design UI sections with shadcn components</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      '"Create a navigation bar using the Menubar component"',
                      '"Build a user profile section with Avatar, Card, and Tabs"',
                      '"Design a data table using the Table component with pagination"'
                    ].map((prompt, i) => {
                      const id = `component-${i}`;
                      const isCopied = copiedIndex === id;
                      return (
                        <div key={i} className="group/item relative overflow-hidden rounded-xl bg-gradient-to-br from-muted/50 to-muted/20 border-2 border-border p-4 transition-all duration-300 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/10 hover:scale-[1.02]">
                          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 opacity-0 group-hover/item:opacity-100 transition-opacity duration-500"></div>
                          <div className="relative flex items-start justify-between gap-4">
                            <p className="text-sm font-mono leading-relaxed text-foreground/90">{prompt}</p>
                            <button
                              onClick={() => copyToClipboard(prompt, id)}
                              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 hover:bg-blue-500/20 transition-all duration-200 hover:scale-110 group/btn"
                              aria-label="Copy prompt"
                            >
                              {isCopied ? (
                                <svg className="h-4 w-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4 text-blue-500 group-hover/btn:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Interactive Features */}
              <div className="group relative animate-fadeInUp animate-delay-200">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-500 via-pink-500 to-orange-500 rounded-2xl opacity-20 blur-xl group-hover:opacity-30 transition duration-500"></div>
                <div className="relative bg-gradient-to-br from-background/95 to-background/50 backdrop-blur-xl border-2 border-border rounded-2xl p-6 md:p-8">
                  <div className="flex items-start gap-4 mb-6">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 border border-purple-500/20">
                      <Presentation className="h-6 w-6 text-purple-500" />
                    </div>
                    <div>
                      <h3 className="text-2xl font-bold mb-2">Interactive Features</h3>
                      <p className="text-sm text-muted-foreground">Add dynamic interactions and functionality</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {[
                      '"Add a Dialog component for user settings"',
                      '"Create a search interface with Command and Popover components"',
                      '"Build a multi-step form using Tabs and Progress components"'
                    ].map((prompt, i) => {
                      const id = `interactive-${i}`;
                      const isCopied = copiedIndex === id;
                      return (
                        <div key={i} className="group/item relative overflow-hidden rounded-xl bg-gradient-to-br from-muted/50 to-muted/20 border-2 border-border p-4 transition-all duration-300 hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10 hover:scale-[1.02]">
                          <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-purple-500/0 opacity-0 group-hover/item:opacity-100 transition-opacity duration-500"></div>
                          <div className="relative flex items-start justify-between gap-4">
                            <p className="text-sm font-mono leading-relaxed text-foreground/90">{prompt}</p>
                            <button
                              onClick={() => copyToClipboard(prompt, id)}
                              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10 hover:bg-purple-500/20 transition-all duration-200 hover:scale-110 group/btn"
                              aria-label="Copy prompt"
                            >
                              {isCopied ? (
                                <svg className="h-4 w-4 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="h-4 w-4 text-purple-500 group-hover/btn:scale-110 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Bottom Hint */}
              <div className="text-center animate-fadeInUp animate-delay-300">
                <div className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-muted/50 to-muted/20 border-2 border-border backdrop-blur-sm">
                  <span className="text-2xl">💡</span>
                  <p className="text-sm font-medium text-muted-foreground">
                    Click the copy icon to use any prompt in Spark Build chat as a starting point
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section id="about" className="relative px-4 py-16 md:py-24">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="mb-4 bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-4xl font-bold tracking-tight text-transparent md:text-5xl">
              About Spark Build
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Spark Build is an AI-powered platform that transforms your ideas into reality.
              Simply describe what you want to build, and our intelligent agents create
              a functional prototype for you.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
