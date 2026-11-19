/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import { Bar, Panel } from "@/components/ui";
import { choosePartner } from "@/lib/actions";
import { getCaught, getMonthTotals, getPartnerId, getPokemonNames } from "@/lib/data";
import { getPlayer } from "@/lib/game";
import { MAX_DEX, sprite } from "@/lib/partners";

export default async function DexPage() {
  const [caught, totals, names, partnerId] = await Promise.all([
    getCaught(),
    getMonthTotals(),
    getPokemonNames(),
    getPartnerId(),
  ]);
  const balls = Math.max(0, getPlayer(totals).entries - caught.length);
  const latest = caught[caught.length - 1];
  const sorted = [...caught].sort((a, b) => a - b);
  const nameOf = (dex: number) => names[dex - 1] ?? `No. ${dex}`;

  return (
    <>
      <section className="box flex items-center gap-4" aria-label="Pokédex progress">
        {latest ? (
          <img src={sprite.pokemon(latest)} alt="" className="pixel h-20 shrink-0" />
        ) : (
          <img src={sprite.item("poke-ball")} alt="" width={60} height={60} className="pixel shrink-0" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1 className="font-display text-sm leading-relaxed">
            Pokédex {caught.length} / {MAX_DEX}
          </h1>
          <Bar ratio={caught.length / MAX_DEX} tone="red" label="Pokédex completion" />
          <p className="text-muted">
            <img src={sprite.item("poke-ball")} alt="" width={24} height={24} className="pixel icon" />
            {balls} Poké {balls === 1 ? "Ball" : "Balls"} left
            {latest ? ` · latest catch: ${nameOf(latest)}` : ""}
          </p>
        </div>
      </section>

      <Panel title="Caught">
        {sorted.length === 0 ? (
          <p className="text-muted">
            Nothing caught yet. Wild Pokémon wander across the Home screen: tap one to throw a Poké Ball. Every entry
            you log earns one ball.
          </p>
        ) : (
          <form action={choosePartner} className="grid grid-cols-3 sm:grid-cols-5">
            {sorted.map((dex) => (
              <button
                key={dex}
                name="partner"
                value={`dex:${dex}`}
                data-sfx="confirm"
                title={`Make ${nameOf(dex)} your partner`}
                aria-pressed={partnerId === `dex:${dex}`}
                className={`btn flex-col gap-0! px-1! ${partnerId === `dex:${dex}` ? "btn-selected" : ""}`}
              >
                <img src={sprite.still(dex)} alt="" width={72} height={72} className="pixel" loading="lazy" />
                <span className="font-body text-base leading-none text-muted">No. {String(dex).padStart(3, "0")}</span>
                <span className="max-w-full truncate">{nameOf(dex)}</span>
              </button>
            ))}
          </form>
        )}
        {sorted.length > 0 && <p className="mt-2 text-muted">Tap one to make it your partner.</p>}
      </Panel>
    </>
  );
}
