"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { Suspense, useSyncExternalStore } from "react";

const NAV = [
  { href: "/", label: "Home", tint: "#4f9dff", icon: "M3 10.5 12 3l9 7.5V21H3zM9 21v-7h6v7" },
  { href: "/new", label: "New", tint: "#2fd18a", icon: "M12 5v14M5 12h14" },
  { href: "/settings", label: "Settings", tint: "#ffc23d", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1" },
];

const spring = { type: "spring", stiffness: 500, damping: 38 } as const;

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-blue">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0e0f12" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H4v18h4" />
          <path d="M19 3l-8 9 8 9" />
        </svg>
      </span>
      <span className="font-display text-lg font-extrabold tracking-tight">KustomLearn</span>
    </span>
  );
}

// Theme lives on <html data-theme>; this keeps React in sync with it.
function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      const obs = new MutationObserver(cb);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => obs.disconnect();
    },
    () => document.documentElement.dataset.theme ?? "dark",
    () => "dark",
  );
  const set = (t: string) => {
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem("kl-theme", t); } catch {}
  };
  return [theme, set] as const;
}

export function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  return (
    <div role="group" aria-label="Theme" className="flex rounded-full border border-line bg-panel-2 p-1 text-[13px] font-medium">
      {(["dark", "light"] as const).map((t) => (
        <button
          key={t}
          type="button"
          aria-pressed={theme === t}
          onClick={() => setTheme(t)}
          className="relative h-9 flex-1 rounded-full px-3 capitalize text-muted aria-pressed:text-bg"
        >
          {theme === t && <motion.span layoutId="theme-pill" transition={spring} className="absolute inset-0 rounded-full bg-text" />}
          <span className="relative">{t}</span>
        </button>
      ))}
    </div>
  );
}

function isActive(path: string | null, href: string) {
  return path !== null && (href === "/" ? path === "/" : path.startsWith(href));
}

function SideLinks({ path }: { path: string | null }) {
  return (
    <ul className="mt-8 flex flex-col gap-1">
      {NAV.map((n) => {
        const on = isActive(path, n.href);
        return (
          <li key={n.href}>
            <Link href={n.href} aria-current={on ? "page" : undefined} className="relative flex h-11 items-center gap-3 rounded-xl px-3 font-medium text-muted aria-[current=page]:text-text">
              {on && <motion.span layoutId="nav-pill" transition={spring} className="absolute inset-0 rounded-xl bg-panel-2" />}
              <span className="relative grid h-7 w-7 place-items-center rounded-lg" style={on ? { background: n.tint, color: "#0e0f12" } : { color: n.tint }}>
                <Icon d={n.icon} />
              </span>
              <span className="relative">{n.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TabLinks({ path }: { path: string | null }) {
  return (
    <ul className="flex">
      {NAV.map((n) => {
        const on = isActive(path, n.href);
        return (
          <li key={n.href} className="flex-1">
            <Link href={n.href} aria-current={on ? "page" : undefined} className="relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted aria-[current=page]:text-text">
              {on && <motion.span layoutId="tab-pill" transition={spring} className="absolute top-1.5 h-8 w-14 rounded-full" style={{ background: n.tint }} />}
              <span className="relative" style={on ? { color: "#0e0f12" } : { color: n.tint }}><Icon d={n.icon} /></span>
              <span className="relative">{n.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// usePathname must sit under Suspense on dynamic routes; the fallback is the same nav with nothing highlighted.
function WithPath({ render }: { render: (path: string | null) => React.ReactNode }) {
  return <>{render(usePathname())}</>;
}
const withPath = (render: (path: string | null) => React.ReactNode) => (
  <Suspense fallback={render(null)}>
    <WithPath render={render} />
  </Suspense>
);

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh md:flex">
      <nav aria-label="Main" className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-side px-3 py-6 md:flex">
        <Link href="/" className="px-2.5"><Logo /></Link>
        {withPath((path) => <SideLinks path={path} />)}
        <div className="mt-auto"><ThemeToggle /></div>
      </nav>

      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-side/90 px-4 backdrop-blur md:hidden">
        <Link href="/"><Logo /></Link>
        <div className="w-40"><ThemeToggle /></div>
      </header>

      <main className="min-w-0 flex-1 px-4 pb-28 pt-6 md:px-8 md:pb-16 md:pt-8">{children}</main>

      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-side/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {withPath((path) => <TabLinks path={path} />)}
      </nav>
    </div>
  );
}
