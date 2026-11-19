"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { play } from "@/lib/sfx";
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
 * The start menu: a pop-up list of every screen with a ▶ cursor, and a save-style
 * summary under it. Open it with the Menu button or the M key; Esc closes it.
 */
export function StartMenu({ summary }: { summary: [string, string][] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLElement>(null);

  // M toggles the menu (unless you are typing in a field); Esc closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = (event.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
      if (event.key === "Escape") setOpen(false);
      else if (event.key.toLowerCase() === "m" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        play("page");
        setOpen((now) => !now);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Put the cursor on the current screen when the menu opens, so arrow keys work at once.
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>("[aria-current], a")?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="btn"
        data-sfx="page"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Menu <kbd>M</kbd>
      </button>

      {open && (
        <div className="start-backdrop" onClick={() => setOpen(false)}>
          <div className="start-pop" onClick={(event) => event.stopPropagation()}>
            <nav ref={menu} aria-label="Main" className="window menu" data-menu>
              {SCREENS.map((screen) => (
                <Link
                  key={screen.href}
                  href={screen.href}
                  className="menu-item"
                  data-sfx="tab"
                  aria-current={pathname === screen.href ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <MenuFace icon={screen.icon} label={screen.label} />
                </Link>
              ))}
              <button type="button" className="menu-item" data-sfx="page" onClick={() => setOpen(false)}>
                <span className="w-6" />
                Close
              </button>
            </nav>
            <dl className="window save-info">
              {summary.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}
    </>
  );
}

/** On phones, the same screens as a bar of icons along the bottom, one tap away. */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Screens" className="window tab-bar">
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
