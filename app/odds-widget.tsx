"use client";

import { useEffect, useState } from "react";
import type { UpcomingOdds } from "../lib/odds";

type NextMatch = { tournament: string; opponent: string; matchTime: string | null } | null;
type Props = { nextMatch: NextMatch };

function displayPersonName(value: string) {
  if (!value.trim()) return "Opponent";
  return value.trim().replace(/\s+/g, " ").split(" ").map(part => {
    const hasLetters = /[A-Za-z]/.test(part);
    if (!hasLetters || part !== part.toUpperCase()) return part;
    return part.toLowerCase().replace(/(^|[-'’])([a-z])/g, (_match, prefix, letter) => prefix + letter.toUpperCase());
  }).join(" ");
}

export default function OddsWidget({ nextMatch }: Props) {
  const [odds, setOdds] = useState<UpcomingOdds | null>(null);
  useEffect(() => {
    if (!nextMatch?.opponent || nextMatch.opponent === "TBA") { setOdds(null); return; }
    const params = new URLSearchParams({ tournament: nextMatch.tournament, opponent: nextMatch.opponent });
    if (nextMatch.matchTime) params.set("matchTime", nextMatch.matchTime);
    const controller = new AbortController();
    fetch("/api/odds?" + params.toString(), { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("Odds request failed"); return response.json() as Promise<UpcomingOdds | null>; })
      .then(setOdds)
      .catch(error => { if (error instanceof Error && error.name !== "AbortError") setOdds(null); });
    return () => controller.abort();
  }, [nextMatch?.tournament, nextMatch?.opponent, nextMatch?.matchTime]);
  if (!odds?.matchWinner && !odds?.spread) return null;
  return (
    <section className="next-match-odds-section">
      <div className="section-heading-row"><h2 className="section-heading">NEXT MATCH ODDS</h2></div>
      <div className="next-match-odds-card">
        {odds.matchWinner && <div className="upcoming-odds">
          <a className="odds-section-link" href="https://bet88.ph?ref=didalexwin" target="_blank" rel="noopener noreferrer">MATCH WINNER ODDS</a>
          <div className="upcoming-odds-values">
            <a className="odds-row" href="https://bet88.ph?ref=didalexwin" target="_blank" rel="noopener noreferrer"><span className="odds-player">Alex Eala</span><strong className="odds-price">{odds.matchWinner.eala}</strong></a>
            <a className="odds-row" href="https://bet88.ph?ref=didalexwin" target="_blank" rel="noopener noreferrer"><span className="odds-player">{displayPersonName(odds.matchWinner.opponentName)}</span><strong className="odds-price">{odds.matchWinner.opponent}</strong></a>
          </div>
        </div>}
        {odds.spread && <div className="upcoming-odds">
          <a className="odds-section-link" href="https://bet88.ph?ref=didalexwin" target="_blank" rel="noopener noreferrer">HANDICAP SPREAD ODDS</a>
          <div className="upcoming-odds-values">
            <a className="odds-row" href="https://bet88.ph?ref=didalexwin" target="_blank" rel="noopener noreferrer"><span className="odds-player">Alex Eala <span className="odds-spread">({odds.spread.ealaPoint > 0 ? "+" : ""}{odds.spread.ealaPoint})</span></span><strong className="odds-price">{odds.spread.eala}</strong></a>
            <a className="odds-row" href="https://bet88.ph?ref=didalexwin" target="_blank" rel="noopener noreferrer"><span className="odds-player">{displayPersonName(odds.spread.opponentName)} <span className="odds-spread">({odds.spread.opponentPoint > 0 ? "+" : ""}{odds.spread.opponentPoint})</span></span><strong className="odds-price">{odds.spread.opponent}</strong></a>
          </div>
        </div>}
        <div className="upcoming-bet-line"><a href="https://bet88.ph?ref=didalexwin" target="_blank" rel="noopener noreferrer">Click here to bet.</a><span> Odds can change. Gamble responsibly. 21+ only</span></div>
      </div>
    </section>
  );
}
