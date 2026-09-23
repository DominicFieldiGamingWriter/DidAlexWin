import type { Metadata } from "next";
import Image from "next/image";
import { getEalaDashboardFromSupabase } from "../lib/supabase";
import { getUpcomingMatchWinnerOdds } from "../lib/odds";
import RefreshOnInterval from "./refresh";
import ShareWidget from "./share-widget";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://didalexwin.com";
  const data = await getEalaDashboardFromSupabase();
  const latest = data.latestMatch;
  const answer = resultText(latest);
  const scores = scoreRows(latest);
  const tournament = latest?.TournamentName
    ? formatTournament(latest.TournamentName)
    : "the latest match";
  const opponent = latestOpponent(latest);
  const round = latest ? roundText(latest.round_name) : "the latest match";
  const score = scores.eala
    .map((value, index) =>
      value && scores.opponent[index] ? value + "-" + scores.opponent[index] : null
    )
    .filter((value): value is string => Boolean(value))
    .join(", ");

  const title =
    answer === "YES"
      ? "Alex Eala won! She beat " + opponent + (score ? " " + score : "") + " at the " + tournament + ", " + round
      : "Alex Eala loses to " + opponent + (score ? " " + score : "") + " at the " + tournament + ", " + round;

  return {
    openGraph: {
      type: "website",
      url: siteUrl,
      siteName: "Did Alex Win?",
      title,
      description:
        "Did Alexandra Eala win her latest match? See her result, score, next match and more on DidAlexWin.",
      images: [
        {
          url: answer === "YES" ? "/happy-alex.png" : answer === "NO" ? "/sad-alex.png" : "/alex-bio.webp",
          alt: answer === "YES" ? "Happy Alexandra Eala caricature" : answer === "NO" ? "Sad Alexandra Eala caricature" : "Alexandra Eala",
        },
      ],
    },
  };
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
    timeZoneName: "short",
  });
}

function formatDateTimeShort(value: unknown) {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateRange(start: unknown, end: unknown) {
  if (typeof start !== "string" || !start) return "";
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return "";

  if (typeof end !== "string" || !end) {
    return formatDate(start);
  }

  const endDate = new Date(end);
  if (Number.isNaN(endDate.getTime())) return formatDate(start);

  return `${startDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })} – ${endDate.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

function nameLines(value: unknown) {
  const name = typeof value === "string" && value.trim() ? value.trim() : "Opponent";
  const parts = name.split(/\s+/);
  return {
    first: parts.shift() ?? name,
    surname: parts.join(" "),
  };
}

function latestOpponent(match: Record<string, unknown> | null) {
  if (!match) return "Opponent";
  const opponent = match.opponent;
  if (opponent && typeof opponent === "object") {
    const name = (opponent as Record<string, unknown>).fullName;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  const team1 = String(match.team_name_1 ?? "");
  const team2 = String(match.team_name_2 ?? "");
  if (/\bEALA\b/i.test(team1) && team2) return team2.replace(/\s+/g, " ").trim();
  if (/\bEALA\b/i.test(team2) && team1) return team1.replace(/\s+/g, " ").trim();
  return "Opponent";
}

function titleCase(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return "—";
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bUs\b/g, "US")
    .replace(/\bDc\b/g, "DC");
}

function formatTournament(value: unknown) {
  const text = titleCase(value);
  const withoutSponsor = text
    .replace(/\s+Presented By\s+.*?(?=\s+-\s+|$)/i, "")
    .trim();
  const concise = withoutSponsor.split(/\s+-\s+/)[0]?.trim() || withoutSponsor;
  if (concise === "Us Open") return "US Open";
  return concise;
}

function parseScores(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return [];
  return value.trim().split(/\s+/).map((set) => {
    const parts = set.split("-");
    return {
      first: parts[0] ?? "",
      second: (parts[1] ?? "").replace(/\(.*/, ""),
    };
  });
}

function scoreRows(match: Record<string, unknown> | null) {
  if (!match) return { eala: [], opponent: [] };
  const sets = parseScores(match.scores);
  const ealaWon = typeof match.eala_won === "boolean" ? match.eala_won : null;
  const firstWins = sets.filter((set) => Number(set.first) > Number(set.second)).length;
  const secondWins = sets.filter((set) => Number(set.second) > Number(set.first)).length;
  const ealaIsFirst = ealaWon === true ? firstWins >= secondWins : ealaWon === false ? firstWins < secondWins : String(match.player_1) === "330332";
  return {
    eala: sets.map((set) => (ealaIsFirst ? set.first : set.second)),
    opponent: sets.map((set) => (ealaIsFirst ? set.second : set.first)),
  };
}

function resultText(match: Record<string, unknown> | null) {
  if (!match) return "—";
  if (typeof match.eala_won === "boolean") return match.eala_won ? "YES" : "NO";
  const winner = Number(match.winner);
  const ealaIs1 = String(match.player_1) === "330332";
  return winner === (ealaIs1 ? 1 : 2) ? "YES" : "NO";
}

function roundText(round: unknown) {
  const map: Record<string, string> = {
    R128: "Round of 128",
    R64: "Round of 64",
    R32: "Round of 32",
    R16: "Round of 16",
    Q: "Quarterfinal",
    S: "Semifinal",
    F: "Final",
  };
  return map[String(round ?? "")] ?? String(round || "—");
}

export default async function Home() {
  const data = await getEalaDashboardFromSupabase();
  const odds = await getUpcomingMatchWinnerOdds(data.nextMatch);
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://didalexwin.com";
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Did Alex Win?",
    url: siteUrl,
    description:
      "Alexandra Eala match results, rankings, upcoming fixtures and Grand Slam record.",
    about: {
      "@type": "Person",
      name: "Alexandra Eala",
      url: "https://www.wtatennis.com/players/330332/name/alexandra-eala",
      image: new URL("/alex-bio.webp", siteUrl).toString(),
    },
  };
  const latest = data.latestMatch;
  const answer = resultText(latest);
  const won = answer === "YES";
  const scores = scoreRows(latest);
  const tournament = latest?.tournament as Record<string, unknown> | undefined;
  const shareScore = scores.eala
    .map((value, index) => value && scores.opponent[index] ? value + "-" + scores.opponent[index] : null)
    .filter((value): value is string => Boolean(value))
    .join(", ");

  return (
    <main className="page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <RefreshOnInterval />

      <div className="top-row">
        <h1 className="main-heading">
          DID <span className="alex-name">ALEX</span> WIN?
        </h1>

        <div className="top-image-wrap" aria-hidden="true">
          <Image
            className="top-image"
            src={answer === "YES" ? "/happy-alex.png" : answer === "NO" ? "/sad-alex.png" : "/happy-alex.png"}
            alt=""
            width={128}
            height={128}
            priority
          />
        </div>

        <div className={`answer ${answer === "YES" ? "yes" : answer === "NO" ? "no" : "pending"}`}>
          {answer}
        </div>
      </div>

      <section className="result-section">
        <div className="result-card">
          <div className="match-main">
            <div className="match-context">
              <div className="section-label">TOURNAMENT</div>
              <div className="match-title">{latest?.TournamentName ? formatTournament(latest.TournamentName) : "Waiting for Eala match data"}</div>
              <div className="match-date">{latest ? formatDateRange(tournament?.startDate ?? latest.StartDate, tournament?.endDate) : "Automatically updated"}</div>
              <div className="match-summary">
                <span className={`match-outcome ${won ? "win" : "loss"}`}>{won ? "WIN" : "LOSS"}</span>
                <span className="match-played-date">{latest?.MatchTimeStamp || latest?.matchDate || latest?.match_start ? `Played ${formatDateTimeShort(latest.MatchTimeStamp ?? latest.matchDate ?? latest.match_start)}` : "Match date unavailable"}</span>
              </div>
            </div>
            <div className="match-details match-details-top">
              <div><span>ROUND</span><strong>{latest ? roundText(latest.round_name) : "—"}</strong></div>
              <div><span>SURFACE</span><strong>{latest?.Surface ? titleCase(latest.Surface) : "—"}</strong></div>
              <div><span>VENUE</span><strong>{latest?.city ? titleCase(latest.city) : "—"}</strong></div>
            </div>
          </div>
          <div className="scoreboard">
            <div className="scoreboard-head"><span></span><span>SET 1</span><span>SET 2</span><span>SET 3</span></div>
            <div className={`score-row ${won ? "score-row-winner" : ""}`}>
              <div className="score-player"><strong>Alexandra Eala</strong>{won && latest && <span className="winner-tag">WINNER</span>}</div>
              {[0,1,2].map((index)=><strong className="set-score" key={index}>{scores.eala[index] ?? "—"}</strong>)}
            </div>
            <div className={`score-row ${won ? "" : "score-row-winner"}`}>
              <div className="score-player"><strong>{latestOpponent(latest)}</strong>{!won && latest && <span className="winner-tag">WINNER</span>}</div>
              {[0,1,2].map((index)=><strong className="set-score" key={index}>{scores.opponent[index] ?? "—"}</strong>)}
            </div>
          </div>
        </div>
      </section>
      <ShareWidget
        result={answer}
        tournament={latest?.TournamentName ? formatTournament(latest.TournamentName) : "the latest match"}
        round={latest ? roundText(latest.round_name) : "the latest match"}
        opponent={latestOpponent(latest)}
        score={shareScore}
        siteUrl={siteUrl}
      />
      <section className="upcoming-section">
        <div className="section-heading-row upcoming-heading-row">
          <h2 className="section-heading">Who does Alex play next?</h2>
        </div>
        <div className="upcoming-card">
          <div className="upcoming-main">
            <div className="upcoming-title">
              {data.nextMatch ? data.nextMatch.opponent : "Waiting for scheduled fixture"}
            </div>
            <div className="upcoming-event">
              {data.nextMatch
                ? `${formatTournament(data.nextMatch.tournament)} · ${roundText(data.nextMatch.round)}`
                : "Next tournament information unavailable"}
            </div>
            <div className="upcoming-meta">
              <div><span>DATE</span><strong>{data.nextMatch?.date ?? "—"}</strong></div>
              <div><span>ROUND</span><strong>{data.nextMatch?.round ? roundText(data.nextMatch.round) : "—"}</strong></div>
              <div className="upcoming-time-box">
                <span>TIME</span>
                <strong>{data.nextMatch?.matchTime ?? "TBA"}</strong>
                <strong>{data.nextMatch?.matchTimePhilippines ?? "TBA"}</strong>
              </div>
            </div>
            {odds && (
              <div className="upcoming-odds">
                <span>MATCH WINNER ODDS</span>
                <strong>Alex Eala {odds.eala}</strong>
                <b>·</b>
                <strong>{odds.opponentName} {odds.opponent}</strong>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="recent-form-section">
        <div className="recent-form">
          <div className="recent-form-heading">
            <div>
              <span className="section-label">RECENT FORM</span>
              <strong>Last 5 singles matches</strong>
            </div>
            <span className="recent-form-key">W = win · L = loss</span>
          </div>
          <div className="form-grid">
            {data.recentSingles.map((match) => {
              const name = nameLines(match.opponent);
              return (
                <div className={`form-match ${match.result === "W" ? "form-match-win" : "form-match-loss"}`} key={`${match.date}-${match.opponent}-${match.round}`}>
                  <span className="form-result">{match.result}</span>
                  <div className="form-match-info">
                    <strong className="form-first-name">{name.first}</strong>
                    {name.surname && <strong className="form-surname">{name.surname}</strong>}
                    <span>{formatTournament(match.tournament)} · {match.date}</span>
                    {match.score && <small className="form-score">{match.score}</small>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section-card section-card--red">
        <h2 className="section-title about-title">ABOUT ALEXANDRA EALA</h2>

        <div className="bio-layout">
          <div className="bio-image-wrap">
            <Image
              className="bio-image"
              src="/alex-bio.webp"
              alt="Alexandra Eala"
              width={360}
              height={321}
            />
          </div>
          <div className="bio-copy">
            <p>
              Alexandra Eala is a professional tennis player from the
              Philippines, born in Quezon City on 23 May 2005.
            </p>
            <p>
              She is left-handed and stands 1.75m tall. Eala made her WTA Tour
              debut in Miami qualifying in 2021 and trains at the Rafael Nadal
              Academy in Mallorca.
            </p>
            <p>
              Her 2025 breakthrough included a semifinal run at the Miami Open,
              her first WTA final at Eastbourne and her first WTA 125 title at
              Guadalajara.
            </p>
            <p>
              In 2026 she won the Washington DC WTA 500, reached the fourth
              round at Wimbledon and reached the third round of the US Open.
            </p>
          </div>
        </div>
      </section>

      <section className="career-card">
        <div className="career-heading-row">
          <div>
            <h2 className="section-title">2026 SEASON RECORD</h2>
          </div>
          <span className="stats-updated">Last updated at {formatDateTime(data.lastUpdated)}</span>
        </div>
        <div className="stats-grid">
          <div className="stats-column"><h3>SINGLES</h3><div className="stats-list">
            <div><span>Match record</span><strong>{data.singlesRecord.wins}W – {data.singlesRecord.losses}L</strong></div>
            <div><span>Matches played</span><strong>{data.singlesRecord.wins + data.singlesRecord.losses}</strong></div>
            <div><span>Win rate</span><strong>{(data.singlesRecord.wins + data.singlesRecord.losses) ? ((data.singlesRecord.wins / (data.singlesRecord.wins + data.singlesRecord.losses)) * 100).toFixed(1) + "%" : "—"}</strong></div>
            <div><span>Titles</span><strong>{data.singlesTitles}</strong></div>
            <div className="stat-current"><span>Current ranking</span><strong>{data.singlesRank ? `No. ${data.singlesRank}` : "—"}</strong></div>
            <div><span>Career high</span><strong>No. {data.highestSinglesRank ?? "—"}</strong></div>
          </div></div>
          <div className="stats-column"><h3 className="doubles-heading">DOUBLES</h3><div className="stats-list">
            <div><span>Match record</span><strong>{data.doublesRecord.wins}W – {data.doublesRecord.losses}L</strong></div>
            <div><span>Matches played</span><strong>{data.doublesRecord.wins + data.doublesRecord.losses}</strong></div>
            <div><span>Win rate</span><strong>{(data.doublesRecord.wins + data.doublesRecord.losses) ? ((data.doublesRecord.wins / (data.doublesRecord.wins + data.doublesRecord.losses)) * 100).toFixed(1) + "%" : "—"}</strong></div>
            <div><span>Titles</span><strong>{data.doublesTitles}</strong></div>
            <div className="stat-current"><span>Current ranking</span><strong>{data.doublesRank ? `No. ${data.doublesRank}` : "—"}</strong></div>
            <div><span>Career high</span><strong>No. {data.highestDoublesRank ?? "—"}</strong></div>
          </div></div>
        </div>
      </section>

      <section className="section-card grand-slam-card">
        <div className="grand-slam-heading">
          <h2 className="section-title">CAREER GRAND SLAM RECORD (SINGLES)</h2>
        </div>
        <div className="grand-slam-grid">
          {[["Australian Open","SINGLES"],["French Open","SINGLES"],["Wimbledon","SINGLES"],["US Open","SINGLES"]].map(([slam])=>{
            const record=data.grandSlams[slam];
            return <div key={slam}>
              <h3>{slam}</h3>
              <div className="slam-list">
                <div><span>Match record</span><strong>{record ? `${record.wins}W – ${record.losses}L` : "—"}</strong></div>
                <div><span>Best result</span><strong>{record?.best ? `${roundText(record.best)}${record.bestYear ? ` · ${record.bestYear}` : ""}` : "—"}</strong></div>
              </div>
            </div>;
          })}
        </div>
      </section>

      <footer>
        Did Alex Win? · <span className="footer-source">Data from WTA</span>
      </footer>
    </main>
  );
}
