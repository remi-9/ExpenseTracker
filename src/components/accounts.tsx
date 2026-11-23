// Accounts shown the way a party is: one slot each, with an icon, the balance and
// an HP bar that drains as the month's spending comes out of that account.
import Link from "next/link";
import { money } from "@/lib/format";
import type { AccountHealth } from "@/lib/money";
import { CategoryIcon, hpTone } from "./ui";

export const ACCOUNT_KIND_LABEL = { bank: "Bank", ewallet: "E-wallet", cash: "Cash", card: "Card" } as const;

export function AccountParty({
  rows,
  current,
  compact,
}: {
  rows: AccountHealth[];
  /** The account that is open, on the Accounts screen. */
  current?: string;
  /** A tighter strip, for the start menu. */
  compact?: boolean;
}) {
  return (
    <ul className={`account-party ${compact ? "compact" : ""}`}>
      {rows.map(({ account, balance, ratio }) => {
        const state = balance < 0 ? "out" : account.id === current ? "active" : "";
        return (
          <li key={account.id}>
            <Link href={`/accounts?a=${account.id}`} className={`party-slot ${state}`} data-sfx="chip" aria-current={account.id === current ? "true" : undefined}>
              <CategoryIcon icon={account.icon} size={compact ? 30 : 40} />
              <span className="party-info">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 break-words font-display text-[0.6rem] leading-relaxed uppercase">{account.name}</span>
                  {!compact && <span className="shrink-0 text-muted">{ACCOUNT_KIND_LABEL[account.kind]}</span>}
                </span>
                <span className="hpbar" role="meter" aria-label={`${account.name}: share left after this month's spending`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
                  <span style={{ width: `${ratio * 100}%`, background: `var(--${hpTone(ratio)})` }} />
                </span>
                <span className={`text-right leading-none ${balance < 0 ? "text-red" : ""}`}>{money(balance)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
