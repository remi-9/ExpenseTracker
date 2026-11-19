import Link from "next/link";
import { Expedition } from "@/components/expedition";
import { Dialog } from "@/components/ui";
import {
  getBattleData,
  getCategories,
  getCaught,
  getMonthTotals,
  getPartnerId,
  getPokemonNames,
  getTeam,
} from "@/lib/data";
import { parseMonth } from "@/lib/format";
import { teamLevel } from "@/lib/fight";
import { getPlayer, getQuests, summarizeMonth, walletHp } from "@/lib/game";
import { MAX_DEX, partnerAt } from "@/lib/partners";

export default async function BattlePage({ searchParams }: { searchParams: Promise<{ wild?: string }> }) {
  const wild = Number((await searchParams).wild);
  const [categories, totals, partnerId, team, caught, names, data] = await Promise.all([
    getCategories(),
    getMonthTotals(),
    getPartnerId(),
    getTeam(),
    getCaught(),
    getPokemonNames(),
    getBattleData(),
  ]);

  const player = getPlayer(totals);
  const partner = partnerAt(partnerId, player.level, names);
  if (!partner) {
    return (
      <Dialog>
        You need a partner before you can battle.{" "}
        <Link href="/" className="text-blue underline">
          Choose one on Home.
        </Link>
      </Dialog>
    );
  }
  if (!data) {
    return <Dialog tone="error">Couldn&apos;t load battle data from PokeAPI. Check your connection and try again.</Dialog>;
  }

  // Your budget sets what the team takes into a run.
  const month = parseMonth();
  const summary = summarizeMonth(totals, month);
  const questsDone = getQuests(categories, totals, month).filter((q) => q.complete).length;
  const healthy = walletHp(summary) >= 0.5;
  const tired = summary.income > 0 && summary.remaining <= 0;
  const level = teamLevel(player.level);
  const potions = 1 + questsDone + (healthy ? 1 : 0);

  const supplies = [
    `Your team battles at Lv ${level}: five levels for each trainer level (you are Lv ${player.level}).`,
    `You start with ${potions} ${potions === 1 ? "Potion" : "Potions"}: one, plus one per quest complete this month (${questsDone})${healthy ? ", plus one for keeping wallet HP above half" : ""}.`,
    tired
      ? "This month is overspent, so your team starts tired, at 70% HP."
      : "Your team starts at full HP. An overspent month would start it at 70%.",
  ];

  return (
    <Expedition
      // A new wild encounter from Home starts a new battle.
      key={wild || "run"}
      data={data}
      names={names}
      partyDex={[partner.dex, ...team.filter((dex) => dex !== partner.dex)]}
      level={level}
      potions={potions}
      tired={tired}
      supplies={supplies}
      balls={Math.max(0, player.entries - caught.length)}
      wild={wild >= 1 && wild <= MAX_DEX ? wild : undefined}
    />
  );
}
