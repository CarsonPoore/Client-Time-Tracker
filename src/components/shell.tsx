import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function AppShell({
  area, nav, userLabel, children,
}: { area: "admin" | "portal"; nav: { href: string; label: string }[]; userLabel: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="bg-navy text-offwhite">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4 sm:px-6">
          <Link href={area === "admin" ? "/admin" : "/portal"} className="flex items-center gap-3">
            <Image src="/brand/cpc-lockup-white.svg" alt="Carson Poore Consulting" width={160} height={32} priority />
            {area === "admin" ? <span className="text-xs font-semibold uppercase tracking-widest text-gold">OS</span> : null}
          </Link>
          <nav aria-label="Main" className="flex flex-1 flex-wrap gap-1">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-md px-3 py-1.5 text-sm font-semibold text-offwhite/80 hover:bg-white/10 hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-offwhite/70">{userLabel}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-md px-3 py-1.5 font-semibold hover:bg-white/10">Sign out</button>
            </form>
          </div>
        </div>
        <div aria-hidden className="h-1 w-24 bg-gold" />
      </header>
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">{children}</main>
    </div>
  );
}
