/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites and GIFs */
// What you see right after logging an entry: spending hits your partner's HP,
// income heals it, savings go to the PC, and enough XP levels it up or evolves it.
// Everything is worked out from the entry and the month's totals; nothing is stored.
import { money, monthLabel } from "@/lib/format";
import { getPlayer, summarizeMonth, walletHp, withEntry, withXp, xpFor } from "@/lib/game";
import { partnerAt, sprite } from "@/lib/partners";
import type { Kind, MonthTotal } from "@/lib/types";
import { ResultSound } from "./sound";
import { Typewriter } from "./typewriter";
import { Bar, hpTone } from "./ui";

export function BattleResult({
  kind,
  amount,
  categoryName,
  month,
  totals,
  partnerId,
  demo,
}: {
  kind: Kind;
  amount: number;
  categoryName: string;
  month: string;
  totals: MonthTotal[];
  partnerId: string | undefined;
  /** Demo mode saves nothing, so the entry is previewed on top of the current numbers. */
  demo: boolean;
}) {
  const current = summarizeMonth(totals, month);
  const player = getPlayer(totals);
  const gain = xpFor(kind, amount);

  const before = demo ? current : withEntry(current, kind, -amount);
  const after = demo ? withEntry(current, kind, amount) : current;
  const levelBefore = (demo ? player : withXp(player, -gain)).level;
  const levelAfter = (demo ? withXp(player, gain) : player).level;

  const was = partnerAt(partnerId, levelBefore);
  const now = partnerAt(partnerId, levelAfter);
  const name = was?.name ?? "Your partner";
  const leveledUp = levelAfter > levelBefore;
  const evolved = was && now && was.dex !== now.dex;

  const lines: string[] = [];
  if (kind === "expense") {
    lines.push(`Wild ${categoryName.toUpperCase()} appeared! It hit for ${money(amount)}.`);
    const share = after.income > 0 ? amount / after.income : 0;
    if (share >= 0.1) lines.push("It's super effective!");
    else if (share > 0 && share <= 0.01) lines.push("It's not very effective…");
    lines.push(
      after.income > 0 && after.remaining <= 0
        ? `${name} fainted! ${monthLabel(month)} is ${money(-after.remaining)} over its pay.`
        : `${name} has ${money(Math.max(0, after.remaining))} HP left.`,
    );
  } else if (kind === "income") {
    lines.push(`${name} recovered ${money(amount)} HP!`);
  } else {
    lines.push(`${money(amount)} was stored safely in the PC.`);
  }
  lines.push(leveledUp ? `${name} gained ${gain} XP and grew to Lv ${levelAfter}!` : `${name} gained ${gain} XP.`);
  if (evolved) lines.push(`What? ${was.name} is evolving!`, `Congratulations! ${was.name} evolved into ${now.name}!`);
  if (demo) lines.push("Demo mode: this entry was a preview and was not saved.");

  const hp = walletHp(after);
  return (
    <section className="box flex flex-col gap-3" aria-label="Entry result">
      {now && was && (
        <div className="flex items-center gap-4">
          <div className="relative grid size-24 shrink-0 place-items-center">
            {evolved ? (
              <>
                <img src={sprite.pokemon(was.dex)} alt="" className="pixel evolve-old absolute h-20" />
                <img src={sprite.pokemon(now.dex)} alt="" className="pixel evolve-new h-20" />
              </>
            ) : (
              <img src={sprite.pokemon(now.dex)} alt="" className={`pixel fx-${kind} h-20`} />
            )}
            <span className={`float-num ${kind === "expense" ? "text-red" : "text-green"}`}>
              {kind === "expense" ? "−" : "+"}
              {money(amount)}
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2 font-display text-[0.65rem] leading-relaxed">
              <span>{now.name}</span>
              <span>Lv {levelAfter}</span>
            </div>
            <div className="grid grid-cols-[1.75rem_1fr] items-center gap-x-1">
              <span className="font-display text-[0.6rem] text-gold">HP</span>
              <Bar ratio={hp} from={walletHp(before)} tone={hpTone(hp)} slow label="Share of this month's income left" />
            </div>
            <p className="text-right leading-none">
              {money(Math.max(0, after.remaining))} / {money(after.income)}
            </p>
          </div>
        </div>
      )}
      <Typewriter lines={lines} plain />
      <ResultSound kind={kind} levelUp={leveledUp} />
    </section>
  );
}
