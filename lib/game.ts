import { selectQuestions } from "@/lib/questions";
import type { Choice, Difficulty, Game, Observation, Player, Question, Settings } from "@/lib/types";

export const difficulties: Difficulty[] = ["easy", "medium", "hard"];
export const choiceNames = ["Back", "Centre", "Front"];
export function createGame(now: number, sessionId: string): Game {
  return { sessionId, phase: "idle", deadline: null, lastMovement: now, players: [], hands: {}, questions: [], questionIndex: 0, difficulty: null, voteNote: "" };
}
export const currentQuestion = (game: Game) => game.questions[game.questionIndex];
export const remaining = (game: Game, now: number) => Math.max(0, Math.ceil(((game.deadline ?? now) - now) / 1000));
export const leaderboard = (players: Player[]) => [...players].sort((a, b) => b.correct - a.correct || a.id - b.id).map((player, index, sorted) => ({ ...player, rank: sorted.findIndex(p => p.correct === player.correct) + 1 }));

export function shuffleAnswers(question: Question, random = Math.random): Question {
  const order: Choice[] = [0, 1, 2];
  for (let i = 2; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { ...question, en: { ...question.en, answers: order.map(i => question.en.answers[i]) as [string, string, string] }, zh: { ...question.zh, answers: order.map(i => question.zh.answers[i]) as [string, string, string] }, correctAnswer: order.indexOf(question.correctAnswer) as Choice };
}

export function resolveVote(players: Player[], random = Math.random): { difficulty: Difficulty; note: string } {
  const counts = [0, 0, 0];
  players.forEach(p => { if (p.present && p.choice !== null) counts[p.choice]++; });
  const highest = Math.max(...counts);
  if (!highest) return { difficulty: "easy", note: "No votes received — starting on Easy." };
  const tied = counts.flatMap((n, i) => n === highest ? [i] : []);
  const selected = tied[Math.floor(random() * tied.length)];
  return { difficulty: difficulties[selected], note: tied.length > 1 ? "Tied vote — randomly chosen from the tied difficulties." : `${highest} vote${highest === 1 ? "" : "s"} — group choice!` };
}

const clearChoices = (players: Player[]) => players.map(p => ({ ...p, choice: null, candidate: null, candidateSince: 0, lastCorrect: null }));

export function observeGame(game: Game, observations: Observation[], moved: boolean, now: number, settings: Settings): Game {
  // A frame arriving after the buzzer cannot change a locked answer or revive
  // a session whose inactivity timer has already expired.
  if ((game.deadline !== null && now >= game.deadline) || (game.phase !== "idle" && now - game.lastMovement >= settings.inactivitySeconds * 1000)) return game;
  let next = { ...game, lastMovement: moved ? now : game.lastMovement };
  if (game.phase === "idle" || game.phase === "joining") {
    const hands: Record<number, number> = {};
    const players = [...game.players];
    for (const pose of observations) {
      if (!pose.raised || pose.row === null || observations.filter(o => o.row === pose.row).length !== 1) continue;
      hands[pose.id] = game.hands[pose.id] ?? now;
      if (now - hands[pose.id] < settings.handHoldMs || players.length >= 3 || players.some(p => p.trackId === pose.id || p.row === pose.row)) continue;
      players.push({ id: pose.row + 1, row: pose.row, trackId: pose.id, choice: null, candidate: null, candidateSince: now, lastSeen: now, present: true, correct: 0, score: 0, lastCorrect: null });
    }
    next = { ...next, hands, players };
    if (game.phase === "idle" && players.length) next = { ...next, phase: "joining", deadline: now + settings.joinSeconds * 1000, lastMovement: now };
  }
  const choosing = next.phase === "voting" || next.phase === "question";
  next.players = next.players.map(player => {
    const pose = observations.find(o => o.id === player.trackId && o.row === player.row);
    const clearRow = observations.filter(o => o.row === player.row).length === 1;
    if (!pose || !clearRow) return { ...player, present: false, ...(choosing ? { choice: null, candidate: null, candidateSince: now } : {}) };
    if (!choosing) return { ...player, present: true, lastSeen: now };
    if (pose.choice === null) return { ...player, present: true, lastSeen: now, candidate: null, choice: null, candidateSince: now };
    const same = player.candidate === pose.choice;
    const since = same ? player.candidateSince : now;
    return { ...player, present: true, lastSeen: now, candidate: pose.choice, candidateSince: since, choice: same && now - since >= settings.choiceHoldMs ? pose.choice : null };
  });
  return next;
}

export function tickGame(game: Game, now: number, settings: Settings, newId: () => string = () => crypto.randomUUID()): Game {
  if (game.phase !== "idle" && now - game.lastMovement >= settings.inactivitySeconds * 1000) return createGame(now, newId());
  if (game.deadline === null || now < game.deadline) return game;
  if (game.phase === "joining") {
    const players = game.players.filter(p => p.present && now - p.lastSeen <= settings.lostSeconds * 1000);
    return players.length ? { ...game, players: clearChoices(players), phase: "voting", deadline: now + settings.voteSeconds * 1000, hands: {} } : createGame(now, newId());
  }
  if (game.phase === "voting") {
    const vote = resolveVote(game.players.filter(p => now - p.lastSeen <= settings.lostSeconds * 1000));
    return { ...game, difficulty: vote.difficulty, voteNote: vote.note, phase: "question", deadline: now + settings.answerSeconds * 1000, players: clearChoices(game.players), questions: selectQuestions(vote.difficulty, 5).map(q => shuffleAnswers(q)) };
  }
  if (game.phase === "question") {
    const correct = currentQuestion(game).correctAnswer;
    return { ...game, phase: "reveal", deadline: now + settings.revealSeconds * 1000, players: game.players.map(p => {
      const hit = p.present && now - p.lastSeen <= settings.lostSeconds * 1000 && p.choice === correct;
      return { ...p, lastCorrect: hit, score: p.score + (hit ? 10 : 0), correct: p.correct + (hit ? 1 : 0) };
    }) };
  }
  if (game.phase === "reveal") {
    if (game.questionIndex === 4) return { ...game, phase: "photo", deadline: now + settings.photoSeconds * 1000 };
    return { ...game, phase: "question", questionIndex: game.questionIndex + 1, players: clearChoices(game.players), deadline: now + settings.answerSeconds * 1000 };
  }
  if (game.phase === "photo") return { ...game, phase: "results", deadline: now + settings.resultsSeconds * 1000 };
  if (game.phase === "results") return createGame(now, newId());
  return game;
}
