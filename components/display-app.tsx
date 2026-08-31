"use client";

import { correctZone, currentQuestion } from "@/lib/game";
import { useGameChannel } from "@/components/use-game-channel";
import { ZoneSummary } from "@/components/zone-summary";

const zoneLetters = ["A", "B", "C"] as const;

export function DisplayApp() {
  const { game } = useGameChannel();
  const question = currentQuestion(game);
  const correct = correctZone(game);
  const isCounting = game.phase === "countdown";

  if (game.phase === "idle" || !question) {
    return (
      <main className="display-page display-idle">
        <div className="display-orbit" aria-hidden="true" />
        <p className="display-kicker">MRD 2026 · LIVE QUIZ</p>
        <h1>Get ready.<br /><span>准备好了吗？</span></h1>
        <div className="ready-instruction"><span className="pulse-ring" />Stand together in the READY zone</div>
        <p className="display-waiting">Waiting for the operator to start</p>
      </main>
    );
  }

  if (game.phase === "results") {
    return (
      <main className="display-page results-page">
        <p className="display-kicker">THAT’S A WRAP · 游戏结束</p>
        <h1 className="results-title">FINAL SCORE</h1>
        <div className="final-score"><strong>{game.score}</strong><span>/ 50</span></div>
        <p className="results-message">You moved as one. · 齐心协力，挑战完成！</p>
      </main>
    );
  }

  return (
    <main className={`display-page quiz-display phase-${game.phase}`}>
      <header className="display-header">
        <div><span>QUESTION</span><strong>{game.questionIndex + 1}<small>/5</small></strong></div>
        <div className="difficulty-badge">{game.difficulty}</div>
        <div className="score-box"><span>SCORE</span><strong>{game.score}</strong></div>
      </header>

      <section className="question-block">
        <p className="question-zh">{question.zh.question}</p>
        <h1>{question.en.question}</h1>
      </section>

      <section className="answers-grid">
        {zoneLetters.map((zone, index) => {
          const revealed = game.phase === "reveal";
          return (
            <article className={`answer-card answer-${zone.toLowerCase()} ${revealed && correct === zone ? "answer-correct" : ""} ${revealed && correct !== zone ? "answer-dim" : ""}`} key={zone}>
              <span className="answer-letter">{zone}</span>
              <div><strong>{question.zh.answers[index]}</strong><p>{question.en.answers[index]}</p></div>
              <span className="answer-corner">{String(index + 1).padStart(2, "0")}</span>
            </article>
          );
        })}
      </section>

      <footer className="display-status">
        <ZoneSummary players={game.players} compact />
        <div className="display-prompt">
          {game.phase === "question" && <><strong>CHOOSE YOUR ZONE</strong><span>移动到你的答案区域</span></>}
          {game.phase === "hold" && <><strong>HOLD POSITIONS</strong><span>We can’t see everyone clearly</span></>}
          {game.phase === "locked" && <><strong>LOCKED!</strong><span>答案已锁定</span></>}
          {game.phase === "reveal" && <><strong>{game.lastAward === 10 ? "+10 · PERFECT TEAM!" : `ANSWER ${correct}`}</strong><span>{game.lastAward === 10 ? "全员答对！" : "再接再厉！"}</span></>}
        </div>
      </footer>

      {isCounting && (
        <div className="countdown-overlay" aria-live="assertive">
          <span>LOCKING IN</span><strong key={game.countdown}>{game.countdown}</strong><small>站稳！HOLD YOUR ZONE</small>
        </div>
      )}
    </main>
  );
}
