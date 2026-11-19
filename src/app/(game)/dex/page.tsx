/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import Link from "next/link";
import { PlayOnMount } from "@/components/sound";
import { Bar, Dialog, Panel } from "@/components/ui";
import { choosePartner, toggleTeam } from "@/lib/actions";
import { getCaught, getMonthTotals, getPartnerId, getPokemonNames, getTeam } from "@/lib/data";
import { getPlayer } from "@/lib/game";
import { MAX_DEX, partnerAt, sprite } from "@/lib/partners";

export default async function DexPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const [caught, totals, names, partnerId, team] = await Promise.all([
    getCaught(),
    getMonthTotals(),
    getPokemonNames(),
    getPartnerId(),
    getTeam(),
  ]);
  const player = getPlayer(totals);
  const partner = partnerAt(partnerId, player.level, names);
  const balls = Math.max(0, player.entries - caught.length);
  const sorted = [...caught].sort((a, b) => a - b);
  const nameOf = (dex: number) => names[dex - 1] ?? `No. ${dex}`;
  const members = team.filter((dex) => dex !== partner?.dex);

  return (
    <>
      {error && (
        <>
          <PlayOnMount sounds={["error"]} />
          <Dialog tone="error">{error}</Dialog>
        </>
      )}

      <Panel
        title="Your team"
        aside={
          <Link href="/battle" className="underline">
            Battle
          </Link>
        }
      >
        <ol className="grid grid-cols-3 sm:grid-cols-6">
          {Array.from({ length: 6 }, (_, i) => {
            const dex = i === 0 ? partner?.dex : members[i - 1];
            return (
              <li key={i} className={`medal p-1! ${dex ? "" : "locked"}`}>
                {dex ? (
                  <img src={sprite.still(dex)} alt="" width={64} height={64} className="pixel" />
                ) : (
                  <span className="grid size-16 place-items-center font-display text-xs">{i + 1}</span>
                )}
                <span className="max-w-full truncate leading-tight">
                  {dex ? nameOf(dex) : "Empty"}
                  {i === 0 && <span className="block text-muted">Partner</span>}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="mt-2 text-muted">
          Your partner always leads. Add up to five Pokémon you have caught; they all battle at the same level.
        </p>
      </Panel>

      <section className="box flex items-center gap-4" aria-label="Pokédex progress">
        <img src={sprite.item("poke-ball")} alt="" width={48} height={48} className="pixel shrink-0" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="font-display text-sm leading-relaxed">
            Pokédex {caught.length} / {MAX_DEX}
          </h1>
          <Bar ratio={caught.length / MAX_DEX} tone="red" label="Pokédex completion" />
          <p className="text-muted">
            {balls} Poké {balls === 1 ? "Ball" : "Balls"} left. Every entry you log earns one.
          </p>
        </div>
      </section>

      <Panel title="Caught">
        {sorted.length === 0 ? (
          <p className="text-muted">
            Nothing caught yet. Wild Pokémon turn up on Home and on expeditions in the Battle tab: wear one down, then
            throw a Poké Ball.
          </p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-4">
            {sorted.map((dex) => {
              const onTeam = team.includes(dex);
              const isPartner = partnerId === `dex:${dex}`;
              return (
                <li key={dex} className="medal p-2!">
                  <img src={sprite.still(dex)} alt="" width={72} height={72} className="pixel" loading="lazy" />
                  <span className="text-muted leading-none">No. {String(dex).padStart(3, "0")}</span>
                  <span className="max-w-full truncate font-display text-[0.6rem] leading-relaxed">{nameOf(dex)}</span>
                  <div className="flex flex-wrap justify-center gap-x-3">
                    <form action={toggleTeam}>
                      <input type="hidden" name="dex" value={dex} />
                      <button className="text-blue underline" data-sfx={onTeam ? "page" : "confirm"}>
                        {onTeam ? "Remove" : "Add to team"}
                      </button>
                    </form>
                    {!isPartner && (
                      <form action={choosePartner}>
                        <button name="partner" value={`dex:${dex}`} className="text-blue underline" data-sfx="confirm">
                          Make partner
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
