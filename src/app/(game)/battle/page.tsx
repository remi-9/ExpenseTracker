import Link from "next/link";
import { Expedition } from "@/components/expedition";
import { Dialog } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/config";
import {
  getBattleData,
  getBillPayments,
  getBills,
  getCategories,
  getCaught,
  getMonthTotals,
  getPartnerId,
  getPokemonNames,
  getRunHistory,
  getSavedRun,
  getTeam,
} from "@/lib/data";
import { parseMonth, today } from "@/lib/format";
import { FINAL_FLOOR, ITEMS, teamLevel, TYPES } from "@/lib/fight";
import { BADGES, getPlayer, getQuests, summarizeMonth, walletHp } from "@/lib/game";
import { amuletEarned, billsFor } from "@/lib/money";
import { MAX_DEX, partnerAt } from "@/lib/partners";
import { startItems, themeType } from "@/lib/run";

export default async function BattlePage({ searchParams }: { searchParams: Promise<{ wild?: string }> }) {
  const wild = Number((await searchParams).wild);
  const [categories, totals, partnerId, team, caught, names, data, saved, history, bills, payments] = await Promise.all([
    getCategories(),
    getMonthTotals(),
    getPartnerId(),
    getTeam(),
    getCaught(),
    getPokemonNames(),
    getBattleData(),
    getSavedRun(),
    getRunHistory(),
    getBills(),
    getBillPayments(parseMonth()),
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

  // Badges send held items along: one for every four.
  const badges = BADGES.filter((b) => b.earned({ player, totals, categories, caught: caught.length })).length;
  const items = startItems(badges);

  // The category that has taken the most this month decides what the champion brings.
  const topHit = totals
    .filter((t) => t.month === `${month}-01` && t.kind === "expense")
    .sort((a, b) => b.total - a.total)[0];
  const topName = categories.find((c) => c.id === topHit?.category_id)?.name;
  const finalType = topName ? themeType(topName) : null;

  // Bills paid on time, with nothing overdue, earn an Amulet Coin for the run.
  const amulet = amuletEarned(billsFor(month, bills, payments, today()));

  const supplies = [
    {
      icon: "rare-candy",
      text: `Your team battles at Lv ${level}: five levels for each trainer level (you are Lv ${player.level}).`,
    },
    {
      icon: "potion",
      text: `You start with ${potions} ${potions === 1 ? "Potion" : "Potions"}: one, plus one per quest complete this month (${questsDone})${healthy ? ", plus one for keeping wallet HP above half" : ""}.`,
    },
    {
      icon: "oran-berry",
      text: tired
        ? "This month is overspent, so your team starts tired, at 70% HP."
        : "Your team starts at full HP. An overspent month would start it at 70%.",
    },
    {
      icon: items[0] ?? "sitrus-berry",
      text:
        items.length > 0
          ? `Your ${badges} badges send ${items.length === 1 ? "a held item" : `${items.length} held items`} along: ${items.map((id) => ITEMS[id].name).join(", ")}. Every four badges adds one.`
          : `Every four badges sends a held item along. You have ${badges}.`,
    },
    {
      icon: "amulet-coin",
      text: amulet
        ? "Your bills are paid on time, so you carry an Amulet Coin: half again as many coins from every win."
        : "Pay this month's bills on time, with nothing overdue, to carry an Amulet Coin: half again as many coins from every win.",
    },
    {
      icon: "master-ball",
      text:
        finalType && topName
          ? `${topName} is this month's biggest spending category, so the champion on floor ${FINAL_FLOOR} leads a ${TYPES[finalType]} team.`
          : `The champion on floor ${FINAL_FLOOR} takes after your biggest spending category. Nothing is spent yet this month.`,
    },
  ];

  return (
    <Expedition
      // A new wild encounter from Home starts a new battle.
      key={wild || "run"}
      data={data}
      names={names}
      setup={{
        partyDex: [partner.dex, ...team.filter((dex) => dex !== partner.dex)],
        level,
        potions,
        tired,
        items,
        amulet,
        finalType,
      }}
      supplies={supplies}
      balls={Math.max(0, player.entries - caught.length)}
      wild={wild >= 1 && wild <= MAX_DEX ? wild : undefined}
      saved={saved}
      history={history}
      remote={isSupabaseConfigured}
    />
  );
}
