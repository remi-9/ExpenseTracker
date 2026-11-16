"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

// Add a page to the menu by adding a line here.
const MENU = [
  { href: "/", label: "Home" },
  { href: "/log", label: "Log" },
  { href: "/categories", label: "Categories" },
];

export function Menu() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-x-4 gap-y-1 font-display text-[0.65rem] leading-loose">
      {MENU.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="cursor hover:text-red"
          aria-current={pathname === item.href ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

const noop = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known in the browser; render a stable label on the server.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button type="button" className="btn" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? "☀ Day" : "☾ Night"}
    </button>
  );
}
