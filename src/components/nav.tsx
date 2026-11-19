"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Icon, type IconName } from "./sprite";

// Add a tab by adding a line here (and an icon in sprite.tsx).
const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/log", label: "Log", icon: "log" },
  { href: "/stats", label: "Stats", icon: "stats" },
  { href: "/quests", label: "Quests", icon: "quests" },
  { href: "/dex", label: "Dex", icon: "dex" },
  { href: "/setup", label: "Setup", icon: "setup" },
];

/** Tab bar: pinned to the bottom of the screen on phones, under the header on wider screens. */
export function Tabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="tabs fixed inset-x-0 bottom-0 z-10 sm:static">
      <ul className="box m-0! grid grid-cols-6 p-0! sm:m-1!">
        {TABS.map((tab) => (
          <li key={tab.href}>
            <Link
              href={tab.href}
              className="tab"
              data-sfx="tab"
              aria-current={pathname === tab.href ? "page" : undefined}
            >
              <TabFace icon={tab.icon} label={tab.label} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Icon and label; the icon blinks while the tab's page is still loading. */
function TabFace({ icon, label }: { icon: IconName; label: string }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span className={pending ? "blink" : ""}>
        <Icon name={icon} />
      </span>
      {label}
    </>
  );
}

const noop = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known in the browser; render a stable label on the server.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button type="button" className="btn" data-sfx="toggle" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? "☀ Day" : "☾ Night"}
    </button>
  );
}
