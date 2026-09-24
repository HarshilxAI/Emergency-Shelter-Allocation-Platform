import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function SampleResultCard() {
  const rows = [
    { name: 'Shelter A', meta: '2.1 km', free: '62% free', score: 91 },
    { name: 'Shelter B', meta: '3.4 km', free: '40% free', score: 86 },
    { name: 'Shelter C', meta: '4.0 km', free: '15% free', score: 74 }
  ];

  return (
    <div className="hero-card" aria-label="Example of ranked shelter results">
      <div className="hero-card-head">Sample result — flood, critical priority</div>
      {rows.map((r) => (
        <div className="hero-card-row" key={r.name}>
          <div>
            <div className="hero-card-name">{r.name}</div>
            <div className="hero-card-meta mono">{r.meta}</div>
          </div>
          <div className="hero-card-cap mono">{r.free}</div>
          <div>
            <div className="hero-card-score mono">{r.score}</div>
            <div className="hero-card-score-label">match</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <>
      <section className="hero" style={{ padding: '56px 0 64px' }}>
        <div className="shell">
          <div className="hero-grid">
            <div className="hero-inner">
              <div className="kicker">
                <span className="kicker-dot" aria-hidden="true" />
                Live allocation engine — not a directory
              </div>
              <h1 style={{ maxWidth: '19ch', margin: '0 0 24px', letterSpacing: '-0.02em' }}>
                Ranked by what you actually need, not what's nearest.
              </h1>
              <p className="hero-sub">
                Most shelter finders sort by distance and stop there. This one removes every
                shelter that can't take you, then ranks what's left against your group, your hazard
                and your priority level.
              </p>
              <div className="hero-ctas">
                <Link
                  className="btn btn-red btn-lg"
                  to={isAuthenticated ? '/request/new' : '/login'}
                >
                  Find emergency shelter
                </Link>
                {!isAuthenticated ? (
                  <Link className="btn btn-amber btn-lg" to="/register">
                    Create an account
                  </Link>
                ) : (
                  <Link className="btn btn-amber btn-lg" to="/dashboard">
                    Go to Dashboard
                  </Link>
                )}
                <a className="btn btn-outline btn-lg" href="#scoring">
                  See how scoring works
                </a>
              </div>
            </div>

            <SampleResultCard />
          </div>
        </div>
      </section>

      {/* Emergency contacts helpline section */}
      <section className="section helpline-section">
        <div className="shell">
          <div className="section-label">Emergency contacts</div>
          <h2>If this is life-threatening, call — don't wait for a match</h2>
          <div className="helpline-box">
            <div className="helpline-cell" style={{ borderLeftColor: 'var(--primary)' }}>
              <div className="helpline-name">National Emergency</div>
              <div className="helpline-num mono">112</div>
            </div>
            <div className="helpline-cell" style={{ borderLeftColor: 'var(--primary)' }}>
              <div className="helpline-name">Police</div>
              <div className="helpline-num mono">100 / 112</div>
            </div>
            <div className="helpline-cell" style={{ borderLeftColor: 'var(--primary)' }}>
              <div className="helpline-name">Fire</div>
              <div className="helpline-num mono">101</div>
            </div>
            <div className="helpline-cell" style={{ borderLeftColor: 'var(--secondary)' }}>
              <div className="helpline-name">Ambulance</div>
              <div className="helpline-num mono">102 / 108</div>
            </div>
            <div className="helpline-cell" style={{ borderLeftColor: 'var(--success)' }}>
              <div className="helpline-name">Women Helpline</div>
              <div className="helpline-num mono">1091 / 181</div>
            </div>
            <div className="helpline-cell" style={{ borderLeftColor: 'var(--success)' }}>
              <div className="helpline-name">Child Helpline</div>
              <div className="helpline-num mono">1098</div>
            </div>
          </div>
          <p className="helpline-foot">Emergency services are independent of this platform.</p>
        </div>
      </section>

      <hr className="landing-divider" />

      {/* What the platform does */}
      <section className="section" id="how-it-works">
        <div className="shell">
          <div className="section-label">What the platform does</div>
          <h2>A ranking problem, not a proximity search.</h2>
          <div className="does-grid">
            <div className="does-card">
              <h3>First, rule out the impossible</h3>
              <p>
                A shelter is removed entirely — never shown, never ranked — if it's full, closed,
                too small for your group, unrated for the disaster you're facing, or too far given
                your priority level.
              </p>
            </div>
            <div className="does-card">
              <h3>Then, rank what's left</h3>
              <p>
                Surviving shelters are scored out of 100 across five weighted factors, each with a
                visible breakdown — so you can see exactly why one shelter ranked above another.
              </p>
            </div>
          </div>
        </div>
      </section>

      <hr className="landing-divider" />

      {/* Scoring */}
      <section className="section" id="scoring">
        <div className="shell">
          <div className="section-label">Scoring</div>
          <h2>How shelters are scored</h2>
          <p className="lead" style={{ color: 'var(--ink-500)', marginBottom: 28 }}>
            Base weights shift with the priority you choose — critical emergencies weigh distance
            more heavily; low-priority requests let a better-equipped shelter further away win.
          </p>

          <div className="stackbar">
            <div style={{ width: '30%', background: 'var(--ink)', color: 'var(--bg)' }}>30%</div>
            <div style={{ width: '25%', background: 'var(--secondary)', color: '#fff' }}>25%</div>
            <div style={{ width: '20%', background: 'var(--ink-500)', color: '#fff' }}>20%</div>
            <div style={{ width: '20%', background: 'var(--success)', color: '#fff' }}>20%</div>
            <div style={{ width: '5%', background: 'var(--primary)' }} />
          </div>

          <div className="legend">
            <div className="legend-item">
              <div className="legend-name">
                <span className="legend-swatch" style={{ background: 'var(--ink)' }} />
                Distance — <span className="legend-pct">30%</span>
              </div>
              <div className="legend-desc">Decays smoothly, never a simple nearest-first sort.</div>
            </div>
            <div className="legend-item">
              <div className="legend-name">
                <span className="legend-swatch" style={{ background: 'var(--secondary)' }} />
                Facilities — <span className="legend-pct">25%</span>
              </div>
              <div className="legend-desc">Coverage of what's requested; critical ones count double.</div>
            </div>
            <div className="legend-item">
              <div className="legend-name">
                <span className="legend-swatch" style={{ background: 'var(--ink-500)' }} />
                Capacity — <span className="legend-pct">20%</span>
              </div>
              <div className="legend-desc">Real headroom left after your group is admitted.</div>
            </div>
            <div className="legend-item">
              <div className="legend-name">
                <span className="legend-swatch" style={{ background: 'var(--success)' }} />
                Suitability — <span className="legend-pct">20%</span>
              </div>
              <div className="legend-desc">How well the building suits this specific hazard.</div>
            </div>
            <div className="legend-item">
              <div className="legend-name">
                <span className="legend-swatch" style={{ background: 'var(--primary)' }} />
                Readiness — <span className="legend-pct">5%</span>
              </div>
              <div className="legend-desc">
                Operational state, plus provision for children, women, seniors.
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="landing-divider" />

      {/* Process / Steps */}
      <section className="section">
        <div className="shell">
          <div className="section-label">Process</div>
          <h2>How a request works</h2>
          <div className="steps">
            <div className="step">
              <div className="step-num mono">01</div>
              <div className="step-title">Share where you are</div>
              <div className="step-desc">
                Device location or a dropped pin — never typed coordinates.
              </div>
            </div>
            <div className="step">
              <div className="step-num mono">02</div>
              <div className="step-title">Describe the emergency</div>
              <div className="step-desc">
                Hazard type, urgency, group size, and how many are children, seniors or women.
              </div>
            </div>
            <div className="step">
              <div className="step-num mono">03</div>
              <div className="step-title">Say what you need</div>
              <div className="step-desc">
                Medical care, water, toilets, accessibility, security. Critical needs count double.
              </div>
            </div>
            <div className="step">
              <div className="step-num mono">04</div>
              <div className="step-title">Get ranked shelters and a route</div>
              <div className="step-desc">
                Results on a map with real road routing. Every request is saved.
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="landing-divider" />

      {/* About */}
      <section className="section" id="about">
        <div className="shell">
          <div className="about-grid">
            <div>
              <div className="section-label">About</div>
              <h2 style={{ marginBottom: 0 }}>A final-year B.Tech project</h2>
            </div>
            <div>
              <p>
                Emergency Shelter Allocation Platform is a working full-stack system — React and
                Leaflet on the front, Node, Express and PostgreSQL behind it — built to explore
                whether shelter assignment during a disaster can be made meaningfully better by
                treating it as a constrained ranking problem rather than a proximity search.
              </p>
              <p>
                Shelter records, contact numbers and occupancy figures in this system demonstrate
                the allocation engine and real operational workflows.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-cta">
        <div className="shell">
          <h2>Ready to find a suitable shelter?</h2>
          <p>
            Submit your emergency requirements and let the allocation engine evaluate available
            shelters.
          </p>
          <Link
            className="btn btn-red btn-lg"
            to={isAuthenticated ? '/request/new' : '/login'}
          >
            Find a shelter
          </Link>
        </div>
      </section>
    </>
  );
}
