export default function Home() {
  return (
    <main className="page">
      <div className="top-row">
        <h1 className="main-heading">
          DID <span className="alex-name"><span className="alex-a">A</span><span className="alex-l">L</span><span className="alex-e">E</span><span className="alex-x">X</span></span> WIN?
        </h1>

        <div className="top-image-wrap" aria-hidden="true">
          <div className="top-image-placeholder">ALEX</div>
        </div>

        <div className="answer pending">—</div>
      </div>

      <section className="result-section">
        <div className="result-card">
          <div className="match-main">
            <div className="match-context">
              <div className="section-label">TOURNAMENT</div>
              <div className="match-title">Waiting for Eala match data</div>
              <div className="match-date">Singles or doubles · Automatically updated</div>
            </div>

            <div className="result-score">—</div>
          </div>

          <div className="players-row">
            <div className="player-side player-side-left">
              <div className="player-label">ALEXANDRA EALA</div>
              <div className="player-name">Alexandra Eala</div>
            </div>

            <div className="vs">VS</div>

            <div className="player-side player-side-right">
              <div className="player-label">OPPONENT</div>
              <div className="player-name">Opponent</div>
            </div>
          </div>

          <div className="match-details">
            <div>
              <span>ROUND</span>
              <strong>—</strong>
            </div>
            <div>
              <span>SURFACE</span>
              <strong>—</strong>
            </div>
            <div>
              <span>DURATION</span>
              <strong>—</strong>
            </div>
            <div>
              <span>VENUE</span>
              <strong>—</strong>
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
            <div className="upcoming-title">Waiting for scheduled fixture</div>
            <div className="upcoming-date">
              The next Alexandra Eala match will appear here automatically.
            </div>
          </div>

          <div className="upcoming-meta">
            <div>
              <span>DATE</span>
              <strong>—</strong>
            </div>
            <div>
              <span>TOURNAMENT</span>
              <strong>—</strong>
            </div>
            <div>
              <span>OPPONENT</span>
              <strong>—</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="section-card section-card--red">
        <h2 className="section-title about-title">ABOUT ALEXANDRA EALA</h2>

        <div className="bio-layout">
          <div className="bio-image-placeholder">BIO IMAGE</div>
          <div className="bio-copy">
            <p>
              Alexandra Eala is a professional tennis player from the Philippines.
              Verified profile information will be connected here from the tennis
              data source.
            </p>
            <p>
              Eala first attracted international attention as a junior and has
              since progressed onto the professional tour, competing across
              singles and doubles events.
            </p>
            <p>
              This biography area will provide a concise overview of her career,
              including major milestones, tournament appearances and ranking
              progress.
            </p>
            <p>
              Her match history will be updated independently from the biography,
              so this section can remain focused on who Alex is rather than what
              happened in her latest match.
            </p>
            <p>
              The final version will use verified profile details and carefully
              sourced career information rather than static placeholder copy.
            </p>
            <p>
              It will also give visitors useful context before they move into the
              live result, upcoming fixture and statistical sections below.
            </p>
            <p>
              Singles and doubles achievements will both be represented so the
              page reflects the full range of Eala&apos;s tennis career.
            </p>
            <p>
              Grand Slam appearances and results will be presented separately
              where the underlying data supports them.
            </p>
            <p>
              Ranking information will be refreshed from the same data layer used
              elsewhere on the site.
            </p>
            <p>
              This is placeholder copy for layout testing only and will be
              replaced with the finished biography once the data and editorial
              content are ready.
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
              <div><span>Career record</span><strong>40–21</strong></div>
              <div><span>Career titles</span><strong>1</strong></div>
              <div><span>Highest ranking</span><strong>No. 18</strong></div>
              <div><span>Current ranking</span><strong>No. 18</strong></div>
            </div>
          </div>

          <div className="stats-column">
            <h3 className="doubles-heading">DOUBLES</h3>
            <div className="stats-list">
              <div><span>Career record</span><strong>—</strong></div>
              <div><span>Career titles</span><strong>—</strong></div>
              <div><span>Highest ranking</span><strong>—</strong></div>
              <div><span>Current ranking</span><strong>—</strong></div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-card grand-slam-card">
        <h2 className="section-title">GRAND SLAM RECORD</h2>

        <div className="grand-slam-grid">
          <div>
            <h3>GRAND SLAM SINGLES</h3>
            <div className="slam-list">
              <div><span>Australian Open</span><strong>—</strong></div>
              <div><span>French Open</span><strong>—</strong></div>
              <div><span>Wimbledon</span><strong>—</strong></div>
              <div><span>US Open</span><strong>—</strong></div>
            </div>
          </div>

          <div>
            <h3 className="doubles-heading">GRAND SLAM DOUBLES</h3>
            <div className="slam-list">
              <div><span>Australian Open</span><strong>—</strong></div>
              <div><span>French Open</span><strong>—</strong></div>
              <div><span>Wimbledon</span><strong>—</strong></div>
              <div><span>US Open</span><strong>—</strong></div>
            </div>
          </div>
        </div>
      </section>

      <footer>Did Alex Win? · Alexandra Eala · Philippines</footer>
    </main>
  );
}
