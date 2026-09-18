const statRows = [
  ["Career record", "—", "—"],
  ["Career titles", "—", "—"],
  ["Highest ranking", "—", "—"],
  ["Current ranking", "—", "—"],
];

const grandSlams = ["Australian Open", "French Open", "Wimbledon", "US Open"];

export default function HomePage() {
  return (
    <main className="site-shell">
      <header className="site-header">
        <div className="brand-mark">
          <span className="brand-dot" aria-hidden="true" />
          <span>Did Alex Win?</span>
        </div>
        <span className="header-country">PHILIPPINES</span>
      </header>

      <section className="hero-card" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Alexandra Eala</p>
          <h1 id="hero-title">Did Alex Win?</h1>
          <p className="hero-intro">
            The latest result, career record and Grand Slam history of the Philippines&apos;
            leading tennis player.
          </p>
          <div className="result-badge result-badge--pending">UPDATING RESULTS</div>
        </div>

        <div className="hero-figure" aria-label="Alexandra Eala image placeholder">
          <div className="figure-placeholder">
            <span>Alex image</span>
            <small>Happy / sad asset goes here</small>
          </div>
        </div>
      </section>

      <section className="section-card latest-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Latest result</p>
            <h2>Most recent match</h2>
          </div>
          <span className="live-dot"><span /> API powered</span>
        </div>

        <div className="match-placeholder">
          <div className="match-meta">
            <span>Tournament</span>
            <strong>Waiting for live data</strong>
          </div>
          <div className="match-date">
            <span>Round</span>
            <strong>—</strong>
          </div>

          <div className="match-players">
            <div className="player-block">
              <span className="player-label">Alexandra Eala</span>
              <strong className="player-name">Alexandra Eala</strong>
            </div>
            <div className="versus">VS</div>
            <div className="player-block player-block--opponent">
              <span className="player-label">Opponent</span>
              <strong className="player-name">Opponent</strong>
            </div>
          </div>

          <div className="score-placeholder" aria-label="Match score placeholder">
            <span>—</span><span>—</span><span>—</span>
          </div>

          <div className="match-stats">
            <div><span>Result</span><strong>—</strong></div>
            <div><span>Duration</span><strong>—</strong></div>
            <div><span>Surface</span><strong>—</strong></div>
            <div><span>Venue</span><strong>—</strong></div>
          </div>
        </div>
      </section>

      <section className="section-card about-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">About</p>
            <h2>Alexandra Eala</h2>
          </div>
        </div>
        <div className="about-grid">
          <div className="about-image-placeholder">Bio image</div>
          <div className="about-copy">
            <p>
              Alexandra Eala is a professional tennis player from the Philippines. This
              section will use the verified player profile and biography data once the
              data layer is connected.
            </p>
            <p className="muted">
              Profile data will be refreshed separately from match results.
            </p>
          </div>
        </div>
      </section>

      <section className="section-card stats-card">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Career</p>
            <h2>Career &amp; Grand Slam record</h2>
          </div>
        </div>

        <div className="stats-table-wrap">
          <div className="stats-columns">
            <div className="stats-column">
              <h3>Singles</h3>
              <div className="stats-list">
                {statRows.map(([label, singles]) => (
                  <div className="stats-row" key={label}>
                    <span>{label}</span>
                    <strong>{singles}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="stats-column">
              <h3>Doubles</h3>
              <div className="stats-list">
                {statRows.map(([label, , doubles]) => (
                  <div className="stats-row" key={label}>
                    <span>{label}</span>
                    <strong>{doubles}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="grand-slam-grid">
          <div>
            <h3>Grand Slam singles</h3>
            {grandSlams.map((event) => (
              <div className="grand-slam-row" key={`singles-${event}`}>
                <span>{event}</span><strong>—</strong>
              </div>
            ))}
          </div>
          <div>
            <h3>Grand Slam doubles</h3>
            {grandSlams.map((event) => (
              <div className="grand-slam-row" key={`doubles-${event}`}>
                <span>{event}</span><strong>—</strong>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <span>Did Alex Win?</span>
        <span>Alexandra Eala · Philippines</span>
      </footer>
    </main>
  );
}
