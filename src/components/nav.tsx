"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { play } from "@/lib/sfx";
import { Icon, type IconName } from "./sprite";

// Add a screen by adding a line here (and an icon in sprite.tsx).
// Its place in the list is also its number key: 1 for Home, 2 for Log, and so on.
const SCREENS: { href: string; label: string; icon: IconName }[] = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/log", label: "Log", icon: "log" },
  { href: "/stats", label: "Stats", icon: "stats" },
  { href: "/quests", label: "Quests", icon: "quests" },
  { href: "/battle", label: "Battle", icon: "battle" },
  { href: "/dex", label: "Dex", icon: "dex" },
  { href: "/setup", label: "Setup", icon: "setup" },
];

/** The screen `steps` places after the one at `pathname`, wrapping round. */
function neighbour(pathname: string, steps: number) {
  const at = Math.max(0, SCREENS.findIndex((s) => s.href === pathname));
  return SCREENS[(at + steps + SCREENS.length) % SCREENS.length];
}

/**
 * The start menu: a pop-up list of every screen with a ▶ cursor, and a save-style
 * summary under it. Open it with the Menu button or the M key; Esc closes it.
 */
export function StartMenu({ summary }: { summary: [string, string][] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      else if (event.key.toLowerCase() === "m" && !isTyping(event)) {
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
        aria-keyshortcuts="M"
        onClick={() => setOpen(!open)}
      >
        Menu <kbd>M</kbd>
      </button>

      {open && (
        <div className="start-backdrop" onClick={() => setOpen(false)}>
          <div className="start-pop" onClick={(event) => event.stopPropagation()}>
            <nav ref={menu} aria-label="Main" className="window menu" data-menu>
              {SCREENS.map((screen, i) => (
                <Link
                  key={screen.href}
                  href={screen.href}
                  className="menu-item"
                  data-sfx="tab"
                  aria-current={pathname === screen.href ? "page" : undefined}
                  aria-keyshortcuts={String(i + 1)}
                  onClick={() => setOpen(false)}
                >
                  <MenuFace icon={screen.icon} label={screen.label} />
                  <kbd>{i + 1}</kbd>
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

/**
 * Step to the previous or next screen without opening the menu, the way shoulder
 * buttons page through screens in a game. The [ and ] keys do the same.
 */
export function ScreenSwitcher() {
  const pathname = usePathname();
  const now = neighbour(pathname, 0);
  const previous = neighbour(pathname, -1);
  const next = neighbour(pathname, 1);
  return (
    <nav aria-label="Switch screen" className="switcher">
      <Link href={previous.href} className="btn icon" data-sfx="tab" aria-label={`Previous screen: ${previous.label}`} aria-keyshortcuts="[">
        ◀
      </Link>
      <span className="switcher-now" aria-current="page">
        <Icon name={now.icon} size={20} />
        {now.label}
      </span>
      <Link href={next.href} className="btn icon" data-sfx="tab" aria-label={`Next screen: ${next.label}`} aria-keyshortcuts="]">
        ▶
      </Link>
    </nav>
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

/** True when a key press belongs to a form field or carries a modifier, so shortcuts should ignore it. */
function isTyping(event: KeyboardEvent) {
  const field = (event.target as HTMLElement).closest("input, textarea, select, [contenteditable]");
  return !!field || event.metaKey || event.ctrlKey || event.altKey;
}

/**
 * Keyboard control for the whole app:
 *  - arrow keys move between the choices of any menu (an element with data-menu), like a D-pad;
 *  - 1 to 7 jump straight to a screen, and [ and ] step to the previous or next one.
 * Enter or Space picks, as usual for links and buttons.
 */
export function Keys() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const focused = document.activeElement as HTMLElement | null;

      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      const menu = focused?.closest("[data-menu]");
      if (step && menu) {
        const choices = [...menu.querySelectorAll<HTMLElement>("a, button:not(:disabled), input:not([type=hidden])")];
        const at = choices.indexOf(focused!);
        if (at < 0) return;
        event.preventDefault();
        choices[(at + step + choices.length) % choices.length].focus();
        return;
      }

      if (isTyping(event)) return;
      const target =
        event.key === "[" ? neighbour(pathname, -1) : event.key === "]" ? neighbour(pathname, 1) : SCREENS[Number(event.key) - 1];
      if (target && target.href !== pathname) {
        play("tab");
        router.push(target.href);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, pathname]);
  return null;
}

const noop = () => () => {};

/** Day or night. Shows the mode you are in: a sun by day, a moon by night. */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // The theme is only known in the browser; render a stable icon on the server.
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const dark = mounted && resolvedTheme === "dark";
  return (
    <button
      type="button"
      className="btn icon"
      data-sfx="toggle"
      aria-label={dark ? "Switch to day" : "Switch to night"}
      title={dark ? "Night. Switch to day" : "Day. Switch to night"}
      onClick={() => setTheme(dark ? "light" : "dark")}
    >
      <Icon name={dark ? "moon" : "sun"} size={20} />
    </button>
  );
}
