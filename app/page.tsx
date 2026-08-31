import Link from "next/link";

export default function Home() {
  return (
    <main className="launch-page">
      <div className="launch-grid" aria-hidden="true" />
      <section className="launch-shell">
        <div className="launch-eyebrow">
          <span className="live-dot" />
          MRD 2026 · Crowd quiz system
        </div>
        <div className="launch-copy">
          <p className="display-kicker">MOVE. CHOOSE. WIN TOGETHER.</p>
          <h1>Pick a side.<br /><span>锁定答案。</span></h1>
          <p className="launch-description">
            A bilingual, whole-room quiz built for physical play. Open the
            control room on the laptop and send the player view to the big screen.
          </p>
        </div>
        <div className="launch-actions">
          <Link className="launch-card launch-card-primary" href="/operator">
            <span className="launch-card-index">01</span>
            <span><strong>Open control room</strong><small>Camera, calibration and game controls</small></span>
            <span className="launch-arrow">↗</span>
          </Link>
          <Link className="launch-card" href="/display">
            <span className="launch-card-index">02</span>
            <span><strong>Open player display</strong><small>Move this window to the TV or projector</small></span>
            <span className="launch-arrow">↗</span>
          </Link>
        </div>
        <footer className="launch-footer">
          <span>Browser-local vision</span><span>No video upload</span><span>Vercel ready</span>
        </footer>
      </section>
    </main>
  );
}
