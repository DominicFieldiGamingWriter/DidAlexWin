import Image from "next/image";
import { getEalaDashboardFromSupabase } from "../lib/supabase";
import RefreshOnInterval from "./refresh";

export const revalidate = 300;

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

function latestOpponent(match: Record<string, unknown> | null) {
  if (!match) return "Opponent";
  const opponent = match.opponent;
  if (opponent && typeof opponent === "object") {
    const name = (opponent as Record<string, unknown>).fullName;
    if (typeof name === "string" && name) return name;
  }
  const ealaIs1 = String(match.player_1) === "330332";
  return String(
    ealaIs1 ? match.team_name_2 ?? "Opponent" : match.team_name_1 ?? "Opponent"
  );
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
  // The WTA feed's player_1/player_2 fields are the reliable ordering for
  // scores. team_name_1/team_name_2 is not consistently aligned with them.
  const ealaIsPlayer1 = String(match.player_1) === "330332";

  return {
    eala: sets.map((set) => (ealaIsPlayer1 ? set.first : set.second)),
    opponent: sets.map((set) => (ealaIsPlayer1 ? set.second : set.first)),
  };
}

function resultText(match: Record<string, unknown> | null) {
  if (!match) return "—";
  const winner = Number(match.winner);
  const ealaIs1 = String(match.player_1) === "330332";
  const won = winner === (ealaIs1 ? 1 : 2);
  return won ? "YES" : "NO";
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
              <div className="match-title">
                {latest?.TournamentName ? formatTournament(latest.TournamentName) : "Waiting for Eala match data"}
              </div>
              <div className="match-date">
                {latest
                  ? formatDateRange(
                      tournament?.startDate ?? latest.StartDate,
                      tournament?.endDate
                    )
                  : "Automatically updated"}
              </div>
            </div>
          </div>

          <div className="scoreboard">
            <div className="scoreboard-head">
              <span></span>
              <span>SET 1</span>
              <span>SET 2</span>
              <span>SET 3</span>
            </div>

            <div className={`score-row ${won ? "score-row-winner" : ""}`}>
              <div className="score-player">
                <strong>Alexandra Eala</strong>
                {won && latest && <span className="winner-tag">WINNER</span>}
              </div>
              {[0, 1, 2].map((index) => (
                <strong className="set-score" key={index}>{scores.eala[index] ?? "—"}</strong>
              ))}
            </div>

            <div className={`score-row ${won ? "" : "score-row-winner"}`}>
              <div className="score-player">
                <strong>{latestOpponent(latest)}</strong>
                {!won && latest && <span className="winner-tag">WINNER</span>}
              </div>
              {[0, 1, 2].map((index) => (
                <strong className="set-score" key={index}>{scores.opponent[index] ?? "—"}</strong>
              ))}
            </div>
          </div>

          <div className="match-details">
            <div>
              <span>ROUND</span>
              <strong>{latest ? roundText(latest.round_name) : "—"}</strong>
            </div>
            <div>
              <span>SURFACE</span>
              <strong>{latest?.Surface ? titleCase(latest.Surface) : "—"}</strong>
            </div>
            <div>
              <span>VENUE</span>
              <strong>{latest?.city ? titleCase(latest.city) : "—"}</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="upcoming-section">
        <div className="section-heading-row">
          <h2 className="section-heading">Who does Alex play next?</h2>
        </div>

        <div className="upcoming-card">
          <div>
            <div className="section-label">
              {data.nextMatch
                ? data.nextMatch.opponent === "TBA"
                  ? "NEXT TOURNAMENT"
                  : "NEXT MATCH"
                : "NEXT MATCH"}
            </div>
            <div className="upcoming-title">
              {data.nextMatch
                ? data.nextMatch.opponent === "TBA"
                  ? formatTournament(data.nextMatch.tournament)
                  : data.nextMatch.opponent
                : "Waiting for scheduled fixture"}
            </div>
            <div className="upcoming-date">
              {data.nextMatch
                ? data.nextMatch.opponent === "TBA"
                  ? "Draw pending"
                  : `${formatTournament(data.nextMatch.tournament)} · ${data.nextMatch.round}`
                : "The next Alexandra Eala match will appear here automatically."}
            </div>
          </div>

          <div className="upcoming-meta">
            <div>
              <span>{data.nextMatch?.opponent === "TBA" ? "STARTS" : "DATE"}</span>
              <strong>
                {data.nextMatch
                  ? data.nextMatch.opponent === "TBA"
                    ? formatDate(data.nextMatch.tournamentStart)
                    : data.nextMatch.date
                  : "—"}
              </strong>
            </div>
            <div>
              <span>TOURNAMENT</span>
              <strong>{data.nextMatch?.tournament ? formatTournament(data.nextMatch.tournament) : "—"}</strong>
            </div>
            <div>
              <span>OPPONENT</span>
              <strong>{data.nextMatch?.opponent ?? "—"}</strong>
            </div>
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
            <p className="stats-subtitle">Singles and doubles matches played during the 2026 calendar year.</p>
          </div>
          <span className="stats-updated">
            Last updated at {formatDateTime(data.lastUpdated)}
          </span>
        </div>

        <div className="stats-grid">
          <div className="stats-column">
            <h3>SINGLES</h3>
            <div className="stats-list">
              <div><span>Match record</span><strong>{data.singlesRecord.wins}W – {data.singlesRecord.losses}L</strong></div>
              <div><span>Titles</span><strong>{data.singlesTitles}</strong></div>
              <div><span>Highest ranking</span><strong>No. {data.highestSinglesRank ?? "—"}</strong></div>
              <div><span>Current ranking</span><strong>{data.singlesRank ? `No. ${data.singlesRank}` : "—"}</strong></div>
            </div>
          </div>

          <div className="stats-column">
            <h3 className="doubles-heading">DOUBLES</h3>
            <div className="stats-list">
              <div><span>Match record</span><strong>{data.doublesRecord.wins}W – {data.doublesRecord.losses}L</strong></div>
              <div><span>Titles</span><strong>{data.doublesTitles}</strong></div>
              <div><span>Highest ranking</span><strong>No. {data.highestDoublesRank ?? "—"}</strong></div>
              <div><span>Current ranking</span><strong>{data.doublesRank ? `No. ${data.doublesRank}` : "—"}</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-card grand-slam-card">
        <div className="grand-slam-heading">
          <div>
            <h2 className="section-title">CAREER GRAND SLAM RECORD</h2>
            <p className="stats-subtitle">Singles match records at each Grand Slam across her career.</p>
          </div>
        </div>

        <div className="grand-slam-grid">
          {[["Australian Open", "SINGLES"], ["French Open", "SINGLES"], ["Wimbledon", "SINGLES"], ["US Open", "SINGLES"]].map(([slam]) => {
            const record = data.grandSlams[slam];
            return (
              <div key={slam}>
                <h3>{slam}</h3>
                <div className="slam-list">
                  <div>
                    <span>Match record</span>
                    <strong>{record ? `${record.wins}W – ${record.losses}L` : "—"}</strong>
                  </div>
                  <div>
                    <span>Best result</span>
                    <strong>{record?.best ? roundText(record.best) : "—"}</strong>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer>
        Did Alex Win? · Alexandra Eala · Philippines
        <span className="footer-source">· Data from WTA · Updated automatically</span>
      </footer>
    </main>
  );
}
