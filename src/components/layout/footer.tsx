import Link from "next/link"
import { Heart, Sparkles, Zap, MessageSquare, Wand2, Package } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { SparkBolt } from "./spark-bolt"

export function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="relative overflow-hidden border-t border-border/20 bg-gradient-to-b from-background to-muted/10">
      {/* Subtle decorative gradient orbs */}
      <div className="absolute -left-32 -top-32 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute -right-32 -bottom-32 h-64 w-64 rounded-full bg-blue-500/5 blur-3xl" />

      <div className="relative container mx-auto px-4 md:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          {/* Left - Brand */}
          <div className="flex flex-col items-center lg:items-start gap-4">
            <Link href="/" className="group flex items-center gap-2">
              <SparkBolt className="h-6 w-6 text-foreground/80 transition-colors group-hover:text-primary" aria-hidden />
              <span className="text-lg font-semibold text-foreground">
                Spark Build
              </span>
            </Link>
            <p className="text-sm text-muted-foreground text-center lg:text-left max-w-md leading-relaxed">
              Transform your ideas into production-ready code with AI.
              Spark Build is your intelligent development companion that understands
              natural language and generates complete, well-structured projects
              in seconds. From concept to code, we handle the complexity so you
              can focus on what matters most — bringing your vision to life.
            </p>
          </div>

          {/* Right - How It Works */}
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground text-center lg:text-left">
              How It Works
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-background/50 border border-border/30 transition-all hover:border-amber-500/30 hover:bg-amber-500/5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">Describe</span>
                <p className="text-xs text-muted-foreground text-center">Share your vision</p>
              </div>
              <div className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-background/50 border border-border/30 transition-all hover:border-purple-500/30 hover:bg-purple-500/5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-purple-500/10 text-purple-500">
                  <Wand2 className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">Generate</span>
                <p className="text-xs text-muted-foreground text-center">AI writes the code</p>
              </div>
              <div className="group flex flex-col items-center gap-2 p-4 rounded-xl bg-background/50 border border-border/30 transition-all hover:border-green-500/30 hover:bg-green-500/5">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10 text-green-500">
                  <Package className="h-4 w-4" />
                </div>
                <span className="text-sm font-medium">Deploy</span>
                <p className="text-xs text-muted-foreground text-center">Launch instantly</p>
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-8 bg-border/30" />

        {/* Bottom */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-muted-foreground">
          {/* Left - Copyright */}
          <span>© {currentYear} Pfizer. All rights reserved.</span>

          {/* Center - Badges */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/5 border border-border/30">
              <Sparkles className="h-3 w-3 text-amber-500" />
              <span className="text-xs">AI-Powered</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/5 border border-border/30">
              <Zap className="h-3 w-3 text-yellow-500" />
              <span className="text-xs">Lightning Fast</span>
            </div>
          </div>

          {/* Right - Created with love */}
          <div className="flex items-center gap-1.5">
            <span>Created with</span>
            <Heart className="h-4 w-4 text-red-500 fill-red-500" />
            <span>by Pfizer</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
