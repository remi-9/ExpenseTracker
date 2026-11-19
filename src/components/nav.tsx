"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useSyncExternalStore } from "react";
import { Icon, type IconName } from "./sprite";

// Add a screen by adding a line here (and an icon in sprite.tsx).
const SCREENS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/log", label: "Log", icon: "log" },
  { href: "/stats", label: "Stats", icon: "stats" },
  { href: "/quests", label: "Quests", icon: "quests" },
  { href: "/battle", label: "Battle", icon: "battle" },
  { href: "/dex", label: "Dex", icon: "dex" },
  { href: "/setup", label: "Setup", icon: "setup" },
];

/**
 * The main menu. On wide screens it is a game-style start menu down the right
 * side, with a ▶ cursor; on phones it is a bar of icons along the bottom.
 * (Same markup; globals.css lays it out both ways.)
 */
export function StartMenu() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="window start-menu" data-menu>
      {SCREENS.map((screen) => (
        <Link
          key={screen.href}
          href={screen.href}
          className="menu-item"
          data-sfx="tab"
          aria-current={pathname === screen.href ? "page" : undefined}
        >
          <MenuFace icon={screen.icon} label={screen.label} />
        </Link>
      ))}
    </nav>
  );
}

/** Icon and label; the icon blinks while the screen is still loading. */
function MenuFace({ icon, label }: { icon: IconName; label: string }) {
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

/**
 * Arrow keys move between the choices of any menu (an element with data-menu),
 * the way a D-pad would. Enter or Space picks, as usual for links and buttons.
 */
export function MenuKeys() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      const menu = (document.activeElement as HTMLElement | null)?.closest("[data-menu]");
      if (!step || !menu) return;
      const choices = [...menu.querySelectorAll<HTMLElement>("a, button:not(:disabled), input:not([type=hidden])")];
      const at = choices.indexOf(document.activeElement as HTMLElement);
      if (at < 0) return;
      event.preventDefault();
      choices[(at + step + choices.length) % choices.length].focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return null;
}

const noop = () => () => {};

export function ThemeToggle({ className = "btn" }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known in the browser; render a stable label on the server.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button type="button" className={className} data-sfx="toggle" onClick={() => setTheme(dark ? "light" : "dark")}>
      {dark ? "☀ Day" : "☾ Night"}
    </button>
  );
}
