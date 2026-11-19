/* eslint-disable @next/next/no-img-element -- tiny remote pixel sprites */
import Link from "next/link";
import { PartyScreen, Type } from "@/components/party";
import { PlayOnMount } from "@/components/sound";
import { Dialog, Panel } from "@/components/ui";
import { choosePartner, toggleTeam } from "@/lib/actions";
import { getBattleData, getCaught, getMonthTotals, getPartnerId, getPokemonNames, getTeam } from "@/lib/data";
import { makeBattler, teamLevel } from "@/lib/fight";
import { getPlayer } from "@/lib/game";
import { MAX_DEX, partnerAt, sprite } from "@/lib/partners";

const BOX_SIZE = 30; // 6 × 5, like a PC box

export default async function DexPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; box?: string; p?: string }>;
}) {
  const params = await searchParams;
  const [caught, totals, names, partnerId, team, data] = await Promise.all([
    getCaught(),
    getMonthTotals(),
    getPokemonNames(),
    getPartnerId(),
    getTeam(),
    getBattleData(),
  ]);
  const player = getPlayer(totals);
  const partner = partnerAt(partnerId, player.level, names);
  const level = teamLevel(player.level);
  const balls = Math.max(0, player.entries - caught.length);
  const nameOf = (dex: number) => names[dex - 1] ?? `No. ${dex}`;

  // The party: partner first, then the team.
  const members = team.filter((dex) => dex !== partner?.dex);
  const partyDex = partner ? [partner.dex, ...members] : members;
  const party = data ? partyDex.map((dex) => makeBattler(dex, level, data, nameOf(dex))) : [];

  // The PC: everything caught, thirty to a box.
  const sorted = [...caught].sort((a, b) => a - b);
  const boxes = Math.max(1, Math.ceil(sorted.length / BOX_SIZE));
  const box = Math.min(boxes, Math.max(1, Number(params.box) || 1));
  const inBox = sorted.slice((box - 1) * BOX_SIZE, box * BOX_SIZE);
  const picked = inBox.includes(Number(params.p)) ? Number(params.p) : inBox[0];
  const onTeam = team.includes(picked);
  const boxHref = (n: number) => `/dex?box=${((n - 1 + boxes) % boxes) + 1}`;

  return (
    <>
      {params.error && (
        <>
          <PlayOnMount sounds={["error"]} />
          <Dialog tone="error">{params.error}</Dialog>
        </>
      )}

      <Panel
        title="Pokémon"
        aside={
          <Link href="/battle" className="underline">
            Battle
          </Link>
        }
      >
        {party.length > 0 ? (
          <PartyScreen party={party} note={(i) => (i === 0 ? "Partner" : undefined)} />
        ) : (
          <p className="text-muted">Choose a partner on Home to start a team.</p>
        )}
        <p className="mt-2 text-muted">
          Your partner always leads. Add up to five Pokémon from the PC below; the whole party battles at Lv {level}.
        </p>
      </Panel>

      <section className="box p-0!" aria-label="PC storage">
        <header className="pc-header">
          <Link href={boxHref(box - 1)} className="btn" aria-label="Previous box" data-sfx="page">
            ◀
          </Link>
          <h1>
            Box {box}
            <small>
              Own {caught.length} / {MAX_DEX} · Balls ×{balls}
            </small>
          </h1>
          <Link href={boxHref(box + 1)} className="btn" aria-label="Next box" data-sfx="page">
            ▶
          </Link>
        </header>

        {sorted.length === 0 ? (
          <p className="p-4 text-muted">
            The PC is empty. Wild Pokémon turn up on Home and on expeditions in the Battle tab: wear one down, then
            throw a Poké Ball.
          </p>
        ) : (
          <div className="pc">
            <div className="pc-grid" data-menu>
              {Array.from({ length: BOX_SIZE }, (_, i) => {
                const dex = inBox[i];
                return dex ? (
                  <Link
                    key={i}
                    href={`/dex?box=${box}&p=${dex}`}
                    scroll={false}
                    className="pc-cell"
                    data-sfx="chip"
                    aria-current={dex === picked ? "true" : undefined}
                    aria-label={nameOf(dex)}
                    title={nameOf(dex)}
                  >
                    <img src={sprite.icon(dex)} alt="" width={40} height={30} className="pixel" loading="lazy" />
                    {(team.includes(dex) || partnerId === `dex:${dex}`) && <span className="pip" />}
                  </Link>
                ) : (
                  <span key={i} className="pc-cell" />
                );
              })}
            </div>

            {picked && (
              <div className="window pc-detail">
                <img src={sprite.pokemon(picked)} alt="" className="pixel sprite-card mx-auto" />
                <p className="text-muted leading-none">No. {String(picked).padStart(3, "0")}</p>
                <h2 className="font-display text-xs leading-relaxed uppercase">{nameOf(picked)}</h2>
                {data && (
                  <p className="flex gap-1">
                    {data.species[picked - 1].t.map((t) => (
                      <Type key={t} id={t} />
                    ))}
                  </p>
                )}
                <div className="menu mt-1" data-menu>
                  <form action={toggleTeam}>
                    <input type="hidden" name="dex" value={picked} />
                    <button className="menu-item" data-sfx={onTeam ? "page" : "confirm"}>
                      {onTeam ? "Withdraw" : "Add to party"}
                    </button>
                  </form>
                  {partnerId !== `dex:${picked}` && (
                    <form action={choosePartner}>
                      <button name="partner" value={`dex:${picked}`} className="menu-item" data-sfx="confirm">
                        Make partner
                      </button>
                    </form>
                  )}
                  <Link href={`/battle`} className="menu-item">
                    Battle
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
