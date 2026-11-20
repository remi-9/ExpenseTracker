"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import type { AccountHealth } from "@/lib/money";
import { sprite } from "@/lib/partners";
import { play } from "@/lib/sfx";
import { AccountParty } from "./accounts";
import { Icon, Place, type IconName } from "./sprite";

// Add a screen by adding a line here (and an icon in sprite.tsx).
// Its place in the list is also its number key: 1 for Home, 2 for the Mart, and so on (0 is the tenth).
// `name` is what the start menu and the header call it; `plain` says what it is for.
// `roof` is the colour of its building on the town map (none means tall grass).
type Screen = { href: string; name: string; plain: string; hint: string; icon: IconName; roof?: string; tab?: boolean };
const SCREENS: Screen[] = [
  { href: "/", name: "Home", plain: "Home", hint: "Wallet status", icon: "home", roof: "#cf3a33", tab: true },
  { href: "/log", name: "Poké Mart", plain: "Log", hint: "Log an entry", icon: "log", roof: "#2d5fc4", tab: true },
  { href: "/accounts", name: "Pokémon", plain: "Accounts", hint: "Your accounts", icon: "wallet", roof: "#d99a13", tab: true },
  { href: "/bills", name: "Bill's PC", plain: "Bills", hint: "What is due", icon: "pc", roof: "#1baf7a" },
  { href: "/stats", name: "Pokégear", plain: "Stats", hint: "Charts", icon: "stats", roof: "#8a8c8a" },
  { href: "/quests", name: "Trainer", plain: "Quests", hint: "Quests, badges", icon: "quests", roof: "#d96d00" },
  { href: "/battle", name: "Battle", plain: "Battle", hint: "Expedition", icon: "battle", tab: true },
  { href: "/dex", name: "Pokédex", plain: "Dex", hint: "Team, PC boxes", icon: "dex", roof: "#e8eed6" },
  { href: "/setup?s=bag", name: "Bag", plain: "Bag", hint: "Categories", icon: "bag", roof: "#6250d6" },
  { href: "/setup?s=options", name: "Options", plain: "Options", hint: "Sound, text, frame", icon: "setup", roof: "#624d4e" },
];
/** The key that jumps to the screen at this place in the list. */
const keyFor = (index: number) => String((index + 1) % 10);

/** Which screen a path is. Setup holds two: Options, and the Bag with everything else under it. */
function indexOf(pathname: string, section: string | null) {
  if (pathname === "/setup") return SCREENS.findIndex((s) => s.href === (section === "options" ? "/setup?s=options" : "/setup?s=bag"));
  return Math.max(0, SCREENS.findIndex((s) => s.href === pathname));
}
function useScreen() {
  const pathname = usePathname();
  const section = useSearchParams().get("s");
  return indexOf(pathname, section);
}
const wrap = (index: number) => SCREENS[(index + SCREENS.length) % SCREENS.length];

// Whether the start menu shows a list or the town map: remembered in this browser.
const VIEW_KEY = "menu-view";
const subscribeView = (callback: () => void) => {
  window.addEventListener("menu-view", callback);
  return () => window.removeEventListener("menu-view", callback);
};
const readView = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === "map" ? "map" : "list";
  } catch {
    return "list";
  }
};
const writeView = (view: "map" | "list") => {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {}
  window.dispatchEvent(new Event("menu-view"));
};

/**
 * The start menu: every screen under its game name with a cursor (your partner),
 * your accounts as a party beside it, and a save-style summary. Open it with the
 * Menu button or the M key; Esc closes it. It can also be shown as a town map.
 */
export function StartMenu({
  summary,
  trainer,
  partnerDex,
  party,
}: {
  summary: [string, string][];
  /** Your trainer's name, which is what the menu calls the trainer card. */
  trainer: string;
  /** Your partner's dex number: its icon is the menu cursor. */
  partnerDex?: number;
  /** Your accounts, shown as a party. */
  party: AccountHealth[];
}) {
  const current = useScreen();
  const [open, setOpen] = useState(false);
  const view = useSyncExternalStore(subscribeView, readView, () => "list");
  const menu = useRef<HTMLElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      else if (event.key.toLowerCase() === "m" && !isTyping(event)) {
        play("page");
        setOpen((now) => !now);
      }
    };
    // The phone tab bar's Menu button asks for the menu with this event.
    const onAsk = () => setOpen((now) => !now);
    document.addEventListener("keydown", onKey);
    window.addEventListener("open-menu", onAsk);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("open-menu", onAsk);
    };
  }, []);

  // Put the cursor on the current screen when the menu opens, so arrow keys work at once.
  useEffect(() => {
    if (open) menu.current?.querySelector<HTMLElement>("[aria-current], a")?.focus();
  }, [open, view]);

  const nameOf = (screen: Screen) => (screen.href === "/quests" ? trainer : screen.name);
  const cursor = partnerDex ? ({ "--cursor": `url(${sprite.icon(partnerDex)})` } as CSSProperties) : undefined;

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
          <div className={`start-pop ${view === "map" ? "wide" : ""}`} style={cursor} onClick={(event) => event.stopPropagation()}>
            <nav ref={menu} aria-label="Main" className={`window menu ${view === "map" ? "town" : ""} ${partnerDex ? "has-cursor" : ""}`} data-menu>
              {SCREENS.map((screen, i) => (
                <Link
                  key={screen.href}
                  href={screen.href}
                  className={view === "map" ? "town-place" : "menu-item"}
                  data-sfx="tab"
                  aria-current={i === current ? "page" : undefined}
                  aria-keyshortcuts={keyFor(i)}
                  title={screen.hint}
                  onClick={() => setOpen(false)}
                >
                  {view === "map" ? (
                    <>
                      <Place roof={screen.roof} />
                      <span>{nameOf(screen)}</span>
                    </>
                  ) : (
                    <>
                      <MenuFace icon={screen.icon} label={nameOf(screen)} />
                      <small>{screen.hint}</small>
                    </>
                  )}
                </Link>
              ))}
              <span className="town-foot">
                <button type="button" className="menu-item" data-sfx="chip" onClick={() => writeView(view === "map" ? "list" : "map")}>
                  <Icon name={view === "map" ? "menu" : "map"} />
                  {view === "map" ? "List" : "Town map"}
                </button>
                <button type="button" className="menu-item" data-sfx="page" onClick={() => setOpen(false)}>
                  <span className="w-6" />
                  Close
                </button>
              </span>
            </nav>
            <div className="start-side">
              {party.length > 0 && (
                <div className="window" onClick={() => setOpen(false)}>
                  <AccountParty rows={party} compact />
                </div>
              )}
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
        </div>
      )}
    </>
  );
}

/**
 * Step to the previous or next screen without opening the menu, the way shoulder
 * buttons page through screens in a game. The [ and ] keys do the same.
 */
export function ScreenSwitcher({ trainer }: { trainer: string }) {
  const at = useScreen();
  const [previous, now, next] = [wrap(at - 1), wrap(at), wrap(at + 1)];
  return (
    <nav aria-label="Switch screen" className="switcher">
      <Link href={previous.href} className="btn icon" data-sfx="tab" aria-label={`Previous screen: ${previous.plain}`} aria-keyshortcuts="[">
        ◀
      </Link>
      <span className="switcher-now" aria-current="page">
        <Icon name={now.icon} size={20} />
        {now.href === "/quests" ? trainer : now.name}
      </span>
      <Link href={next.href} className="btn icon" data-sfx="tab" aria-label={`Next screen: ${next.plain}`} aria-keyshortcuts="]">
        ▶
      </Link>
    </nav>
  );
}

/**
 * The name of the place you have just arrived at, sliding in at the top of the
 * screen and away again, as when you walk into a new town. Re-keyed on every
 * screen change so the animation plays again; it needs no state of its own.
 */
export function LocationBanner({ trainer }: { trainer: string }) {
  const screen = SCREENS[useScreen()];
  return (
    <p key={screen.href} className="window location-banner" aria-hidden>
      {screen.href === "/quests" ? `${trainer}'s card` : screen.name}
    </p>
  );
}

/** On phones, the screens used most as a bar of icons along the bottom, with the rest behind Menu. */
export function TabBar() {
  const current = useScreen();
  return (
    <nav aria-label="Screens" className="window tab-bar">
      {SCREENS.map((screen, i) =>
        screen.tab ? (
          <Link key={screen.href} href={screen.href} className="menu-item" data-sfx="tab" aria-current={i === current ? "page" : undefined}>
            <MenuFace icon={screen.icon} label={screen.plain} />
          </Link>
        ) : null,
      )}
      <button
        type="button"
        className="menu-item"
        data-sfx="page"
        aria-haspopup="menu"
        aria-current={SCREENS[current].tab ? undefined : "true"}
        onClick={() => window.dispatchEvent(new Event("open-menu"))}
      >
        <Icon name="menu" />
        Menu
      </button>
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
 *  - 1 to 9 and 0 jump straight to a screen, and [ and ] step to the previous or next one.
 * Enter or Space picks, as usual for links and buttons.
 */
export function Keys() {
  const router = useRouter();
  const at = useScreen();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const focused = document.activeElement as HTMLElement | null;

      const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
      const menu = focused?.closest("[data-menu]");
      if (step && menu) {
        // A pop-up kept inside a menu is not one of the menu's choices.
        const choices = [...menu.querySelectorAll<HTMLElement>("a, button:not(:disabled), input:not([type=hidden])")].filter(
          (choice) => (choice.closest("dialog") ?? null) === (focused!.closest("dialog") ?? null),
        );
        const index = choices.indexOf(focused!);
        if (index < 0) return;
        event.preventDefault();
        choices[(index + step + choices.length) % choices.length].focus();
        return;
      }

      // Shortcuts are for the page: not while typing, and not while a pop-up is open over it.
      if (isTyping(event) || document.querySelector("dialog[open]")) return;
      const numbered = /^\d$/.test(event.key) ? SCREENS.findIndex((_, i) => keyFor(i) === event.key) : -1;
      const target = event.key === "[" ? wrap(at - 1) : event.key === "]" ? wrap(at + 1) : SCREENS[numbered];
      if (target && target !== SCREENS[at]) {
        play("tab");
        router.push(target.href);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router, at]);
  return null;
}

/**
 * The chirp a game makes when HP is in the red: three times on arriving, then quiet.
 * Rendered by Home when wallet HP is at a fifth or less.
 */
export function LowHpAlarm() {
  useEffect(() => {
    const timers = [400, 1300, 2200].map((ms) => setTimeout(() => play("lowHp"), ms));
    return () => timers.forEach(clearTimeout);
  }, []);
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
