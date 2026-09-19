import Image from "next/image";
import { getEalaDashboard } from "../lib/wta";

export const dynamic = "force-dynamic";

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
  if (text === "Us Open") return "US Open";
  return text;
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
  const teamOne = String(match.team_name_1 ?? "").toUpperCase();
  const ealaScoresFirst = teamOne.includes("EALA");

  return {
    eala: sets.map((set) => ealaScoresFirst ? set.first : set.second),
    opponent: sets.map((set) => ealaScoresFirst ? set.second : set.first),
  };
}

function resultText(match: Record<string, unknown> | null) {
  if (!match) return "—";
  const winner = match.winner;
  const ealaIs1 = String(match.player_1) === "330332";
  const won =
    Number(winner) === (ealaIs1 ? 1 : 2);
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
  let data;
  try {
    data = await getEalaDashboard();
  } catch {
    data = {
      latestMatch: null,
      nextMatch: null,
      singlesRank: 18,
      doublesRank: 88,
      singlesRecord: { wins: 40, losses: 21 },
      doublesRecord: { wins: 0, losses: 0 },
      singlesTitles: 1,
      doublesTitles: 0,
      grandSlams: {},
      profile: {},
    };
  }

  const latest = data.latestMatch;
  const answer = resultText(latest);
  const won = answer === "YES";
  const scores = scoreRows(latest);

  return (
    <main className="page">
      <div className="top-row">
        <h1 className="main-heading">
          DID <span className="alex-name">ALEX</span> WIN?
        </h1>

        <div className="top-image-wrap" aria-hidden="true">
          <Image
            className="top-image"
            src={won ? "/happy-alex.png" : "/sad-alex.png"}
            alt=""
            width={128}
            height={128}
            priority
          />
        </div>

        <div className={`answer ${won ? "yes" : "no"}`}>{answer}</div>
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
                {latest ? formatDate(String(latest.StartDate)) : "Automatically updated"}
              </div>
            </div>
          </div>

          <div className="players-row">
            <div className="player-side player-side-left">
              <div className="player-name">Alexandra Eala</div>
            </div>

            <div className="vs">VS</div>

            <div className="player-side player-side-right">
              <div className="player-name">{latestOpponent(latest)}</div>
            </div>
          </div>

          <div className="scoreboard">
            <div className="scoreboard-head">
              <span>FINAL SCORE</span>
              <span>SET 1</span>
              <span>SET 2</span>
              <span>SET 3</span>
            </div>

            <div className={`score-row ${won ? "score-row-winner" : ""}`}>
              <div className="score-player">
                <strong>Alexandra Eala</strong>
                {won && <span className="winner-tag">WINNER</span>}
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
            <div className="section-label">NEXT MATCH</div>
            <div className="upcoming-title">
              {data.nextMatch?.opponent ?? "Waiting for scheduled fixture"}
            </div>
            <div className="upcoming-date">
              {data.nextMatch
                ? `${data.nextMatch.tournament} · ${data.nextMatch.round}`
                : "The next Alexandra Eala match will appear here automatically."}
            </div>
          </div>

          <div className="upcoming-meta">
            <div>
              <span>DATE</span>
              <strong>{data.nextMatch?.date ?? "—"}</strong>
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
        <h2 className="section-title">CAREER RECORD</h2>

        <div className="stats-grid">
          <div className="stats-column">
            <h3>SINGLES</h3>
            <div className="stats-list">
              <div><span>Career record</span><strong>{data.singlesRecord.wins}–{data.singlesRecord.losses}</strong></div>
              <div><span>Career titles</span><strong>{data.singlesTitles}</strong></div>
              <div><span>Highest ranking</span><strong>No. 18</strong></div>
              <div><span>Current ranking</span><strong>{data.singlesRank ? `No. ${data.singlesRank}` : "—"}</strong></div>
            </div>
          </div>

          <div className="stats-column">
            <h3 className="doubles-heading">DOUBLES</h3>
            <div className="stats-list">
              <div><span>Career record</span><strong>{data.doublesRecord.wins}–{data.doublesRecord.losses}</strong></div>
              <div><span>Career titles</span><strong>{data.doublesTitles}</strong></div>
              <div><span>Highest ranking</span><strong>No. 88</strong></div>
              <div><span>Current ranking</span><strong>{data.doublesRank ? `No. ${data.doublesRank}` : "—"}</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-card grand-slam-card">
        <h2 className="section-title">GRAND SLAM RECORD</h2>

        <div className="grand-slam-grid">
          {["Australian Open", "French Open", "Wimbledon", "US Open"].map((slam) => {
            const record = data.grandSlams[slam];
            return (
              <div key={slam}>
                <h3>{slam}</h3>
                <div className="slam-list">
                  <div>
                    <span>Record</span>
                    <strong>{record ? `${record.wins}–${record.losses}` : "—"}</strong>
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

      <footer>Did Alex Win? · Alexandra Eala · Philippines</footer>
    </main>
  );
}
