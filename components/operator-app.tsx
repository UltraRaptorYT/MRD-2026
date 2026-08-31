"use client";

import { useEffect } from "react";
import { CalibrationPanel } from "@/components/calibration-panel";
import { useGameChannel } from "@/components/use-game-channel";
import { ZoneSummary } from "@/components/zone-summary";
import { beginGame, canLock, correctZone, createInitialGame, currentQuestion, lockAnswer, makePlayers, nextQuestion, revealAnswer } from "@/lib/game";
import type { Difficulty, PlayerZone } from "@/lib/types";

const difficulties: Difficulty[] = ["easy", "medium", "hard"];
const playerZones: PlayerZone[] = ["A", "B", "C", "uncertain"];

export function OperatorApp() {
  const { game, setGame } = useGameChannel(true);
  const question = currentQuestion(game);
  const answer = correctZone(game);

  useEffect(() => {
    if (game.phase !== "countdown") return;
    if (game.countdown <= 0) {
      setGame(lockAnswer(game));
      return;
    }
    const timer = window.setTimeout(() => setGame({ ...game, countdown: game.countdown - 1, updatedAt: Date.now() }), 1000);
    return () => window.clearTimeout(timer);
  }, [game, setGame]);

  function changePlayerZone(playerId: number, zone: PlayerZone) {
    setGame({ ...game, players: game.players.map((player) => player.id === playerId ? { ...player, zone, confidence: zone === "uncertain" ? 0.48 : 0.94 } : player), updatedAt: game.updatedAt + 1 });
  }

  function openDisplay() {
    window.open("/display", "mrd-player-display", "popup=yes,width=1280,height=720");
  }

  return (
    <main className="operator-page">
      <header className="operator-header">
        <div><span className="brand-mark">M</span><div><p>MRD 2026</p><h1>Quiz control room</h1></div></div>
        <div className="operator-header-actions">
          <span className="system-ok"><i /> System ready</span>
          <button className="button button-secondary" type="button" onClick={openDisplay}>Open player display ↗</button>
        </div>
      </header>

      <div className="operator-layout">
        <CalibrationPanel />
        <section className="operator-panel game-panel">
          <div className="panel-heading">
            <div><span className="section-number">02</span><div><h2>Game control</h2><p>Run the five-question session from here.</p></div></div>
            <span className="phase-pill">{game.phase.replace("-", " ")}</span>
          </div>

          {game.phase === "idle" ? (
            <div className="setup-stack">
              <div className="control-group"><label>Difficulty</label><div className="segmented-control">{difficulties.map((difficulty) => <button type="button" className={game.difficulty === difficulty ? "active" : ""} key={difficulty} onClick={() => setGame({ ...game, difficulty, updatedAt: Date.now() })}>{difficulty}</button>)}</div></div>
              <div className="control-group"><label>Registered players</label><div className="stepper"><button type="button" onClick={() => setGame({ ...game, players: makePlayers(Math.max(1, game.players.length - 1)), updatedAt: Date.now() })}>−</button><strong>{game.players.length}</strong><button type="button" onClick={() => setGame({ ...game, players: makePlayers(Math.min(8, game.players.length + 1)), updatedAt: Date.now() })}>+</button></div></div>
              <div className="roster-preview"><span>READY roster</span><div>{game.players.map((player) => <i key={player.id}>{player.id}</i>)}</div><small>Players are locked for the full game once started.</small></div>
              <button className="button button-primary button-large" type="button" onClick={() => setGame(beginGame(game.difficulty, game.players))}>Lock roster & start game</button>
            </div>
          ) : (
            <div className="live-game-stack">
              <div className="question-mini">
                <div><span>QUESTION {game.questionIndex + 1}/5</span><span>{game.difficulty}</span></div>
                <strong>{question?.zh.question}</strong><p>{question?.en.question}</p>
                <small>Operator answer: <b>{answer}</b></small>
              </div>

              <ZoneSummary players={game.players} />

              <div className="player-simulator">
                <div className="simulator-heading"><div><strong>Detection simulator</strong><span>Real detector adapter comes next</span></div><span className="simulator-live"><i /> LIVE</span></div>
                {game.players.map((player) => (
                  <div className="player-row" key={player.id}>
                    <span className="track-id">#{String(player.id).padStart(2, "0")}</span>
                    <span className="player-state"><i /> ACTIVE</span>
                    <div className="zone-switcher">{playerZones.map((zone) => <button type="button" key={zone} className={`${zone === player.zone ? "active" : ""} zone-choice-${zone}`} onClick={() => changePlayerZone(player.id, zone)}>{zone === "uncertain" ? "?" : zone}</button>)}</div>
                    <span className="confidence">{Math.round(player.confidence * 100)}%</span>
                  </div>
                ))}
              </div>

              <div className="game-actions">
                {game.phase === "question" && <button className="button button-primary button-large" type="button" onClick={() => setGame({ ...game, phase: "countdown", countdown: 10, updatedAt: Date.now() })}>Start 10-second countdown</button>}
                {game.phase === "countdown" && <div className="operator-countdown"><strong>{game.countdown}</strong><span>seconds to lock</span></div>}
                {game.phase === "hold" && <><p className="warning-message">Resolve every uncertain player before locking.</p><button className="button button-primary" disabled={!canLock(game)} type="button" onClick={() => setGame(lockAnswer(game))}>Lock resolved answers</button></>}
                {game.phase === "locked" && <button className="button button-primary button-large" type="button" onClick={() => setGame(revealAnswer(game))}>Reveal answer {answer}</button>}
                {game.phase === "reveal" && <><div className={`award-message award-${game.lastAward}`}>{game.lastAward === 10 ? "+10 · EVERYONE CORRECT" : "+0 · NOT THIS TIME"}</div><button className="button button-primary" type="button" onClick={() => setGame(nextQuestion(game))}>{game.questionIndex === 4 ? "Show final score" : "Next question"}</button></>}
                {game.phase === "results" && <><div className="operator-result"><span>Final score</span><strong>{game.score} / 50</strong></div><button className="button button-primary" type="button" onClick={() => setGame(createInitialGame())}>Start a new game</button></>}
              </div>
            </div>
          )}
        </section>
      </div>
      <footer className="operator-footer"><span>Camera: {"—"} FPS</span><span>Detection: simulator</span><span>Sync: browser-local</span><button type="button" onClick={() => setGame(createInitialGame())}>Emergency reset</button></footer>
    </main>
  );
}
