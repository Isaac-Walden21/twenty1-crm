import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Twenty1 CRM",
  description: "IG DM pipeline for Twenty1 Media AI audits",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body className="bg-zinc-950 text-zinc-100 min-h-screen">
        <nav className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-[1600px] mx-auto px-3 sm:px-6">
            <div className="flex h-14 items-center justify-between">
              <span className="text-lg font-bold tracking-tight text-white">
                Twenty1 <span className="text-emerald-400">CRM</span>
              </span>
              <span className="text-xs text-zinc-500">Hamilton County · IG DM → AI Audit</span>
            </div>
          </div>
        </nav>
        <main className="max-w-[1600px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
