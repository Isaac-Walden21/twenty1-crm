import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { MobileNav } from "./mobile-nav";

export const metadata: Metadata = {
  title: "Twenty1 CRM",
  description: "OpenClaw outreach dashboard for Twenty1 Media",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">
        <nav className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
            <div className="flex h-14 items-center justify-between">
              <Link href="/" className="text-lg font-bold tracking-tight text-white shrink-0">
                Twenty1 <span className="text-emerald-400">CRM</span>
              </Link>
              {/* Desktop nav */}
              <div className="hidden md:flex gap-1">
                <NavLink href="/">Dashboard</NavLink>
                <NavLink href="/pipeline">Pipeline</NavLink>
                <NavLink href="/prospects">Prospects</NavLink>
                <NavLink href="/emails">Emails</NavLink>
                <NavLink href="/scorecard">Scorecard</NavLink>
                <NavLink href="/activity">Activity</NavLink>
                <NavLink href="/analytics">Analytics</NavLink>
                <NavLink href="/compose">Compose</NavLink>
              </div>
              {/* Mobile nav */}
              <MobileNav />
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
          {children}
        </main>
      </body>
    </html>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-md transition-colors"
    >
      {children}
    </Link>
  );
}
