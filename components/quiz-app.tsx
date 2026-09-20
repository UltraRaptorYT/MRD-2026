"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useCamera } from "@/components/use-camera";
import { project, validFloor } from "@/lib/calibration";
import {
  choiceNames,
  createGame,
  currentQuestion,
  difficulties,
  leaderboard,
  observeGame,
  remaining,
  tickGame,
} from "@/lib/game";
import {
  capturePhoto,
  listLocalPhotos,
  saveLocalPhoto,
  uploadPhoto,
  type SavedPhoto,
} from "@/lib/photos";
import {
  defaults,
  numericSettings,
  sanitizeSettings,
  SETTINGS_KEY,
} from "@/lib/settings";
import type { Choice, Game, Observation, Point, Settings } from "@/lib/types";

const rowNames = ["Back row", "Middle row", "Front row"];
const colors = ["#ff927f", "#f5d875", "#8cb7ff"];
const skeleton = [
  [11, 12],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];
type DemoPlayer = { active: boolean; raised: boolean; choice: Choice };
const initialDemo = (): DemoPlayer[] =>
  Array.from({ length: 3 }, () => ({
    active: false,
    raised: false,
    choice: 1,
  }));

export function QuizApp({ initialSetup = false }: { initialSetup?: boolean }) {
  const [settings, setSettings] = useState(defaults);
  const [game, setGame] = useState(() => createGame(0, ""));
  const gameRef = useRef(game);
  const [now, setNow] = useState(0);
  const [poses, setPoses] = useState<Observation[]>([]);
  const [setup, setSetup] = useState(initialSetup);
  const [calibrating, setCalibrating] = useState<Point[] | null>(null);
  const [notice, setNotice] = useState("");
  const [demo, setDemo] = useState(false);
  const [demoPlayers, setDemoPlayers] = useState(initialDemo);
  const demoMovement = useRef(false);
  const lastFrame = useRef(0);
  const [cloudConfigured, setCloudConfigured] = useState<boolean | null>(null);
  const [photo, setPhoto] = useState<{
    url: string;
    message: string;
    busy: boolean;
    cloud: boolean;
  }>({ url: "", message: "", busy: false, cloud: false });
  const savedPhoto = useRef<SavedPhoto | null>(null);
  const photoUrl = useRef("");
  const [gallery, setGallery] = useState<SavedPhoto[] | null>(null);

  const publish = useCallback((next: Game) => {
    gameRef.current = next;
    setGame(next);
  }, []);
  function receiveFrame(
    observations: Observation[],
    moved: boolean,
    time: number,
  ) {
    if (demo) return;
    lastFrame.current = time;
    setPoses(observations);
    if (calibrating !== null) return;
    publish(observeGame(gameRef.current, observations, moved, time, settings));
  }
  const camera = useCamera(settings, receiveFrame);

  function clearPhoto() {
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = "";
    savedPhoto.current = null;
    setPhoto({ url: "", message: "", busy: false, cloud: false });
  }
  function reset() {
    publish(createGame(Date.now(), crypto.randomUUID()));
    clearPhoto();
    setDemoPlayers(initialDemo());
    setNotice("");
  }

  const initialize = useEffectEvent(() => {
    try {
      setSettings(
        sanitizeSettings(
          JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"),
        ),
      );
    } catch {
      setNotice("Saved settings could not be loaded. Using defaults.");
    }
    publish(createGame(Date.now(), crypto.randomUUID()));
    setNow(Date.now());
  });
  useEffect(() => {
    const frame = requestAnimationFrame(initialize);
    fetch("/api/photos")
      .then((r) => r.json())
      .then((data) => setCloudConfigured(data.configured))
      .catch(() => setCloudConfigured(false));
    return () => {
      cancelAnimationFrame(frame);
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    };
  }, []);
  useEffect(() => {
    if (initialSetup) setSetup(true);
  }, [initialSetup]);

  async function takePhoto(session: Game) {
    if (photo.busy) return;
    const id = session.sessionId;
    setPhoto((p) => ({ ...p, busy: true, message: "Capturing your group…" }));
    try {
      if (!camera.videoRef.current || camera.status !== "live")
        throw new Error(
          demo
            ? "Demo finished. A live camera is needed for a real group photo."
            : "Start the camera, then use Retake photo.",
        );
      const blob = await capturePhoto(camera.videoRef.current, settings.mirror);
      const record = { id, blob, createdAt: Date.now() };
      let localSaved = false;
      try {
        await saveLocalPhoto(record);
        localSaved = true;
      } catch {
        /* Keep a downloadable memory copy and still attempt cloud storage. */
      }
      if (gameRef.current.sessionId !== id) return;
      savedPhoto.current = record;
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
      photoUrl.current = URL.createObjectURL(blob);
      setPhoto({
        url: photoUrl.current,
        message: localSaved
          ? "Saved on this device. Uploading to Supabase…"
          : "Local storage unavailable. Uploading to Supabase…",
        busy: true,
        cloud: false,
      });
      try {
        const path = await uploadPhoto(record);
        if (gameRef.current.sessionId === id)
          setPhoto((p) => ({
            ...p,
            busy: false,
            cloud: true,
            message: `Saved to Supabase · ${path}`,
          }));
      } catch (error) {
        if (gameRef.current.sessionId === id)
          setPhoto((p) => ({
            ...p,
            busy: false,
            message: `${localSaved ? "Saved on this device." : "Download this photo before resetting."} ${error instanceof Error ? error.message : "Cloud upload failed."}`,
          }));
      }
    } catch (error) {
      if (gameRef.current.sessionId === id)
        setPhoto((p) => ({
          ...p,
          busy: false,
          message:
            error instanceof Error ? error.message : "Photo capture failed.",
        }));
    }
  }

  async function retryUpload(record: SavedPhoto) {
    setNotice("Uploading photo…");
    try {
      const path = await uploadPhoto(record);
      setNotice(`Saved to Supabase · ${path}`);
      if (gameRef.current.sessionId === record.id)
        setPhoto((p) => ({
          ...p,
          cloud: true,
          message: `Saved to Supabase · ${path}`,
        }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  const onTick = useEffectEvent(() => {
    const time = Date.now();
    setNow(time);
    let current = gameRef.current;
    if (demo) {
      const observations: Observation[] = demoPlayers.flatMap((p, row) =>
        p.active
          ? [
              {
                id: 100 + row,
                row: row as Choice,
                choice: p.choice,
                raised: p.raised,
                foot: project(
                  settings.floor,
                  (p.choice + 0.5) / 3,
                  (row + 0.5) / 3,
                ),
                landmarks: [],
              },
            ]
          : [],
      );
      setPoses(observations);
      current = observeGame(
        current,
        observations,
        demoMovement.current,
        time,
        settings,
      );
      demoMovement.current = false;
    } else if (time - lastFrame.current > 600) {
      current = observeGame(current, [], false, time, settings);
      setPoses([]);
    }
    const next = tickGame(current, time, settings);
    if (current.phase === "photo" && next.phase === "results")
      void takePhoto(current);
    if (next.sessionId !== current.sessionId) {
      clearPhoto();
      setDemoPlayers(initialDemo());
    }
    if (next !== gameRef.current) publish(next);
  });
  useEffect(() => {
    const timer = setInterval(onTick, 100);
    return () => clearInterval(timer);
  }, []);

  function updateSettings(next: Settings) {
    const safe = sanitizeSettings(next);
    setSettings(safe);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(safe));
      setNotice("Setup saved on this device.");
    } catch {
      setNotice("Setup is active, but this browser could not save it.");
    }
  }

  function floorClick(event: React.PointerEvent<SVGSVGElement>) {
    if (calibrating === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const points = [
      ...calibrating,
      {
        x: (event.clientX - rect.left) / rect.width,
        y: (event.clientY - rect.top) / rect.height,
      },
    ];
    if (points.length < 4) {
      setCalibrating(points);
      return;
    }
    if (!validFloor(points)) {
      setNotice(
        "Invalid floor. Click back-left, back-right, front-right, front-left in that order.",
      );
      setCalibrating([]);
      return;
    }
    updateSettings({ ...settings, floor: points });
    setCalibrating(null);
  }

  function download(record: SavedPhoto) {
    const url = URL.createObjectURL(record.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `mrd-group-${record.id}.jpg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const question = currentQuestion(game);
  const seconds = remaining(game, now);
  const choosing = game.phase === "voting" || game.phase === "question";
  const finished = game.phase === "photo" || game.phase === "results";
  const idle = game.phase === "idle";
  const rows = leaderboard(game.players);
  const cameraLarge =
    idle || game.phase === "joining" || finished || calibrating !== null;
  const floor = settings.floor;

  return (
    <main className="quiz-shell">
      <header className="topbar">
        <Link href="/" className="brand">
          <span>M</span>
          <div>
            MOVE TOGETHER<small>MRD 2026 · THE GRID QUIZ</small>
          </div>
        </Link>
        <div className="toolbar">
          <span
            className={`status ${camera.status === "live" || demo ? "online" : ""}`}
          >
            <i />
            {demo
              ? "Demo mode"
              : camera.status === "live"
                ? "Tracking live"
                : camera.status === "starting"
                  ? "Loading detector…"
                  : "Camera offline"}
          </span>
          <button onClick={() => setSetup(!setup)} aria-expanded={setup}>
            Setup
          </button>
          <button
            onClick={() => {
              if (document.fullscreenElement)
                void document
                  .exitFullscreen()
                  .catch(() => setNotice("Could not exit fullscreen."));
              else
                void document.documentElement
                  .requestFullscreen()
                  .catch(() =>
                    setNotice("Fullscreen is unavailable in this browser."),
                  );
            }}
          >
            Fullscreen
          </button>
          <button onClick={reset}>Reset game</button>
        </div>
      </header>

      {setup && (
        <div
          className="setup-layer"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setSetup(false);
          }}
        >
          <section
            className="setup-panel"
            aria-label="Game setup"
            role="dialog"
            aria-modal="true"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">ONE CAMERA. ONE SCREEN.</p>
                <h2>Set up once. Play all day.</h2>
                <p>
                  Point the camera at the floor with everyone’s head and feet
                  visible. Each player owns one row.
                </p>
              </div>
              <button onClick={() => setSetup(false)}>Close setup ×</button>
            </div>
            <div className="setup-columns">
              <div className="setup-step">
                <b>01 · Connect</b>
                <p>
                  Allow camera access, then mirror this browser onto your TV or
                  projector.
                </p>
                <label>
                  Camera
                  <select
                    disabled={!idle || camera.status === "starting"}
                    value={settings.cameraId}
                    onChange={(e) => {
                      camera.stop();
                      updateSettings({ ...settings, cameraId: e.target.value });
                    }}
                  >
                    <option value="">Default camera</option>
                    {camera.devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || "Camera"}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary"
                  disabled={camera.status === "starting" || demo || !idle}
                  onClick={() => void camera.start()}
                >
                  {camera.status === "starting"
                    ? "Loading camera & model…"
                    : camera.status === "live"
                      ? "Restart camera"
                      : "Start camera"}
                </button>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={settings.mirror}
                    disabled={!idle}
                    onChange={(e) => {
                      camera.stop();
                      updateSettings({ ...settings, mirror: e.target.checked });
                    }}
                  />
                  Mirror camera (restart after changing)
                </label>
              </div>
              <div className="setup-step">
                <b>02 · Mark the floor</b>
                <p>
                  Click just four outer corners in the preview. The nine cells
                  are created automatically.
                </p>
                <button
                  disabled={!idle || demo}
                  onClick={() => {
                    setCalibrating([]);
                    setNotice("");
                  }}
                >
                  Calibrate 3×3 grid
                </button>
                <p className="muted">
                  Back row = P1 · Middle row = P2 · Front row = P3. One person
                  per row; keep sightlines clear.
                </p>
              </div>
              <div className="setup-step">
                <b>03 · Ready to play</b>
                <p>
                  Raise one hand above your head and hold it to join. Move left
                  / middle / right inside your row.
                </p>
                <span className="storage-badge">
                  {cloudConfigured === null
                    ? "Checking photo storage…"
                    : cloudConfigured
                      ? "Supabase photo storage configured"
                      : "Photos saved locally · add Supabase keys for cloud"}
                </span>
                <button
                  onClick={async () => {
                    try {
                      setGallery(await listLocalPhotos());
                    } catch {
                      setNotice(
                        "Local photo storage is unavailable in this browser.",
                      );
                    }
                  }}
                >
                  Saved group photos
                </button>
              </div>
            </div>
            <details>
              <summary>
                Timing & tracking sensitivity{" "}
                {idle ? "· auto-saved" : "· reset the game to edit"}
              </summary>
              <fieldset disabled={!idle} className="settings-grid">
                {(
                  Object.keys(
                    numericSettings,
                  ) as (keyof typeof numericSettings)[]
                ).map((key) => {
                  const [min, max, step, label] = numericSettings[key];
                  return (
                    <label key={key}>
                      {label}
                      <input
                        aria-label={label}
                        type="number"
                        min={min}
                        max={max}
                        step={step}
                        value={settings[key]}
                        onChange={(e) => {
                          if (e.target.value !== "")
                            updateSettings({
                              ...settings,
                              [key]: Number(e.target.value),
                            });
                        }}
                      />
                    </label>
                  );
                })}
              </fieldset>
              <button
                disabled={!idle}
                onClick={() =>
                  updateSettings({
                    ...defaults,
                    floor: settings.floor,
                    cameraId: settings.cameraId,
                    mirror: settings.mirror,
                  })
                }
              >
                Restore timing defaults
              </button>
            </details>
            <p className="setup-privacy">
              Movement detection runs locally. Only the final group photo is
              uploaded.
            </p>
          </section>
        </div>
      )}

      {notice && (
        <div className="notice" role="status">
          {notice}
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            ×
          </button>
        </div>
      )}
      {camera.error && !demo && (
        <div className="notice error" role="alert">
          {camera.error}
          <button
            disabled={camera.status === "starting"}
            onClick={() => {
              if (!finished) reset();
              void camera.start();
            }}
          >
            {finished ? "Reconnect camera for photo" : "Restart camera & game"}
          </button>
        </div>
      )}
      {gallery !== null && (
        <section className="setup-panel">
          <div className="section-heading">
            <h2>Saved group photos · {gallery.length}</h2>
            <button onClick={() => setGallery(null)}>Close ×</button>
          </div>
          <p>
            Local originals stay on this browser and device. Cloud copies are in
            your private Supabase bucket.
          </p>
          {gallery.length === 0 && <p>No photos saved yet.</p>}
          <div className="gallery">
            {gallery.map((record) => (
              <div key={record.id}>
                <span>{new Date(record.createdAt).toLocaleString()}</span>
                <code>{record.id.slice(0, 8)}</code>
                <button onClick={() => download(record)}>Download</button>
                <button onClick={() => void retryUpload(record)}>
                  Upload to Supabase
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className={`play-area ${cameraLarge ? "wide-camera" : ""}`}>
        <div className="game-content">
          <div className="round-meta">
            <span>
              {idle
                ? "THE NEXT GROUP STARTS HERE"
                : game.phase === "joining"
                  ? "BUILD YOUR GROUP"
                  : game.phase === "voting"
                    ? "YOUR GROUP. YOUR CHALLENGE."
                    : finished
                      ? "GROUP COMPLETE"
                      : `QUESTION ${game.questionIndex + 1} / 5 · ${game.difficulty}`}
            </span>
            {game.deadline !== null && (
              <div
                className="timer"
                aria-label={`${seconds} seconds remaining`}
              >
                {seconds}
                <small>sec</small>
              </div>
            )}
          </div>

          {idle && (
            <div className="hero">
              <p className="eyebrow">
                1–3 PLAYERS · 5 QUESTIONS · YOUR OWN SCORE
              </p>
              <h1>
                Step in.
                <br />
                <em>Hands up.</em>
              </h1>
              <p className="chinese">举手加入，一起挑战！</p>
              <p>Choose an empty row and raise a hand to join the next game.</p>
              <div className="instruction-chips">
                <span>01 Raise a hand</span>
                <span>02 Vote together</span>
                <span>03 Move to answer</span>
              </div>
              {camera.status !== "live" && !demo && (
                <button
                  className="primary"
                  disabled={camera.status === "starting"}
                  onClick={() => void camera.start()}
                >
                  {camera.status === "starting"
                    ? "Loading detector…"
                    : "Start camera"}
                </button>
              )}
            </div>
          )}
          {game.phase === "joining" && (
            <div className="hero">
              <p className="eyebrow">
                {game.players.length} / 3 PLAYERS JOINED
              </p>
              <h1>
                You’re in.
                <br />
                <em>Who’s next?</em>
              </h1>
              <p>
                One player per row. Raise your hand now to join. The roster
                locks when the timer ends.
              </p>
              <p className="chinese">每排一位玩家，举手加入。</p>
            </div>
          )}
          {game.phase === "voting" && (
            <div className="question-heading">
              <h1>Pick your difficulty.</h1>
              <p className="chinese">移动到左、中、右，投票选择难度。</p>
              <p>
                Move within your row. Most votes wins; ties are randomly
                decided. Hold your final choice until zero.
              </p>
            </div>
          )}
          {(game.phase === "question" || game.phase === "reveal") &&
            question && (
              <div className="question-heading">
                <p className="eyebrow">
                  {game.questionIndex === 0
                    ? game.voteNote
                    : "YOUR ANSWER. YOUR POINTS."}
                </p>
                <p className="chinese">{question.zh.question}</p>
                <h1>{question.en.question}</h1>
                <p>
                  {game.phase === "reveal"
                    ? `Correct answer: ${choiceNames[question.correctAnswer]} · +10 for each correct player`
                    : "Move to your answer and hold until the timer ends. Correct +10 · Wrong +0"}
                </p>
              </div>
            )}
          {(choosing || game.phase === "reveal") && (
            <div className="answer-options">
              {choiceNames.map((label, index) => (
                <article
                  key={label}
                  className={`answer-option ${game.phase === "reveal" ? (question?.correctAnswer === index ? "correct-answer" : "dimmed") : ""}`}
                  style={
                    { "--option-color": colors[index] } as React.CSSProperties
                  }
                >
                  <span>
                    {index === 0 ? "←" : index === 1 ? "●" : "→"} {label}
                  </span>
                  <h2>
                    {game.phase === "voting"
                      ? difficulties[index]
                      : question?.en.answers[index]}
                  </h2>
                  <p>
                    {game.phase === "voting"
                      ? ["轻松入门", "进阶挑战", "高手模式"][index]
                      : question?.zh.answers[index]}
                  </p>
                  <div className="vote-dots">
                    {game.players
                      .filter(
                        (p) =>
                          p.choice === index &&
                          (game.phase === "reveal" || p.present),
                      )
                      .map((p) => (
                        <b key={p.id}>P{p.id}</b>
                      ))}
                  </div>
                </article>
              ))}
            </div>
          )}
          {game.phase === "photo" && (
            <div className="hero">
              <p className="eyebrow">ONE LAST THING…</p>
              <h1>
                Get together.
                <br />
                <em>Strike a pose.</em>
              </h1>
              <p>
                Your group photo will be taken when the countdown reaches zero.
                Look at the camera!
              </p>
              <p className="chinese">合影时间！看镜头，一起摆个姿势。</p>
            </div>
          )}
          {game.phase === "results" && (
            <div className="hero results-copy">
              <p className="eyebrow">FIVE QUESTIONS. ONE GREAT GROUP.</p>
              <h1>
                Nice moves.
                <br />
                <em>
                  {rows
                    .filter((p) => p.rank === 1)
                    .map((p) => `P${p.id}`)
                    .join(" + ")}{" "}
                  {rows.filter((p) => p.rank === 1).length > 1
                    ? "tie!"
                    : "wins!"}
                </em>
              </h1>
              <p>
                Next group in {seconds} seconds, or reset when you’re ready.
              </p>
              <p className="photo-message" role="status">
                {photo.message}
              </p>
              <div className="photo-actions">
                {savedPhoto.current && (
                  <button
                    onClick={() =>
                      savedPhoto.current && download(savedPhoto.current)
                    }
                  >
                    Download photo
                  </button>
                )}
                {photo.url && !photo.cloud && (
                  <button
                    disabled={photo.busy}
                    onClick={() =>
                      savedPhoto.current && void retryUpload(savedPhoto.current)
                    }
                  >
                    Retry cloud upload
                  </button>
                )}
                <button
                  disabled={photo.busy}
                  onClick={() => {
                    publish({
                      ...gameRef.current,
                      phase: "photo",
                      deadline: Date.now() + settings.photoSeconds * 1000,
                    });
                  }}
                >
                  Retake photo
                </button>
                <button className="primary" onClick={reset}>
                  Next group →
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="camera-column">
          <div className="camera-heading">
            <span>
              {finished ? "YOUR GROUP PHOTO" : "YOUR LIVE PLAY ZONES"}
            </span>
            <span>{demo ? "DEMO" : "3 × 3 GRID"}</span>
          </div>
          <div
            className={`camera-view ${calibrating !== null ? "calibrating" : ""}`}
            style={{ aspectRatio: camera.aspectRatio }}
          >
            <video
              ref={camera.videoRef}
              muted
              playsInline
              style={{ transform: settings.mirror ? "scaleX(-1)" : undefined }}
            />
            {photo.url && game.phase === "results" && (
              <Image
                className="group-photo"
                src={photo.url}
                alt="Your group's end-of-game pose"
                fill
                unoptimized
              />
            )}
            {camera.status !== "live" && !photo.url && (
              <div className="camera-placeholder">
                <strong>
                  {demo
                    ? "DEMO PLAY FLOOR"
                    : camera.status === "starting"
                      ? "Loading pose tracker…"
                      : "Your camera appears here"}
                </strong>
                <span>
                  {demo
                    ? "Use the player controls below"
                    : "All three players’ full bodies should be visible"}
                </span>
              </div>
            )}
            {(!finished || calibrating !== null) && (
              <svg
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
                onPointerDown={floorClick}
                aria-label="Live 3 by 3 floor grid"
                className="floor-overlay"
              >
                {Array.from({ length: 9 }, (_, i) => {
                  const row = Math.floor(i / 3),
                    col = i % 3;
                  const corners = [
                    [col, row],
                    [col + 1, row],
                    [col + 1, row + 1],
                    [col, row + 1],
                  ].map(([x, y]) => project(floor, x / 3, y / 3));
                  const center = project(
                    floor,
                    (col + 0.5) / 3,
                    (row + 0.5) / 3,
                  );
                  const occupied = poses.some(
                    (p) => p.row === row && p.choice === col,
                  );
                  return (
                    <g key={i}>
                      <polygon
                        points={corners
                          .map((p) => `${p.x * 1000},${p.y * 1000}`)
                          .join(" ")}
                        stroke={colors[row]}
                        fill={colors[row]}
                        fillOpacity={occupied ? 0.35 : 0.05}
                        strokeWidth="2"
                      />
                      <text
                        x={center.x * 1000}
                        y={center.y * 1000}
                        fill={colors[row]}
                        textAnchor="middle"
                        fontSize="25"
                      >
                        P{row + 1} · {choiceNames[col]}
                      </text>
                    </g>
                  );
                })}
                {poses.map((p) => (
                  <g key={p.id}>
                    {skeleton.map(([a, b]) => {
                      const x = p.landmarks[a],
                        y = p.landmarks[b];
                      return x &&
                        y &&
                        (x.visibility ?? 0) >= settings.confidence &&
                        (y.visibility ?? 0) >= settings.confidence ? (
                        <line
                          key={`${a}-${b}`}
                          x1={x.x * 1000}
                          y1={x.y * 1000}
                          x2={y.x * 1000}
                          y2={y.y * 1000}
                          stroke={p.row === null ? "#fff" : colors[p.row]}
                          strokeWidth="4"
                        />
                      ) : null;
                    })}
                    <circle
                      cx={p.foot.x * 1000}
                      cy={p.foot.y * 1000}
                      r="10"
                      fill={p.raised ? "#53efb5" : "white"}
                    />
                  </g>
                ))}
                {calibrating?.map((p, i) => (
                  <g key={i}>
                    <circle
                      cx={p.x * 1000}
                      cy={p.y * 1000}
                      r="10"
                      fill="#fff"
                    />
                    <text
                      x={p.x * 1000 + 15}
                      y={p.y * 1000}
                      fill="#fff"
                      fontSize="30"
                    >
                      {i + 1}
                    </text>
                  </g>
                ))}
              </svg>
            )}
            {game.phase === "photo" && (
              <div className="photo-countdown">
                {seconds}
                <small>SMILE!</small>
              </div>
            )}
          </div>
          {calibrating !== null ? (
            <div className="calibration-prompt">
              Click corner {calibrating.length + 1}:{" "}
              <b>
                {
                  ["back-left", "back-right", "front-right", "front-left"][
                    calibrating.length
                  ]
                }
              </b>
              <button onClick={() => setCalibrating(null)}>Cancel</button>
            </div>
          ) : (
            <div className="camera-caption">
              <span>
                {finished
                  ? "Get everyone in frame for your group photo."
                  : "Choose within your row. Stay off the lines. A raised hand joins the game."}
              </span>
              {idle && camera.status === "live" && !demo && (
                <button
                  onClick={() => {
                    setCalibrating([]);
                    setNotice("");
                  }}
                >
                  Calibrate 3×3 grid
                </button>
              )}
            </div>
          )}
          <label className="check demo-switch">
            <input
              aria-label="Try without a camera"
              type="checkbox"
              checked={demo}
              disabled={!idle}
              onChange={(e) => {
                camera.stop();
                reset();
                setDemo(e.target.checked);
                setPoses([]);
              }}
            />
            <span>
              <strong>Demo mode</strong>
              <small>Try the grid without a camera</small>
            </span>
          </label>
          <div className="player-lanes">
            {rowNames.map((name, row) => {
              const player = game.players.find((p) => p.row === row);
              const seen = poses.filter((p) => p.row === row);
              return (
                <div
                  key={name}
                  style={
                    { "--player-color": colors[row] } as React.CSSProperties
                  }
                >
                  <b>P{row + 1}</b>
                  <span>
                    {name}
                    <small>
                      {player
                        ? !player.present
                          ? "Tracking lost — return to your row"
                          : player.choice !== null
                            ? `${choiceNames[player.choice]} selected`
                            : choosing
                              ? "Hold a cell to select"
                              : "Joined ✓"
                        : seen.length > 1
                          ? "Only one person per row"
                          : "Raise a hand to join"}
                    </small>
                  </span>
                  {player && (
                    <strong>
                      {player.score}
                      <small>PTS</small>
                    </strong>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </section>

      {game.players.length > 0 && (
        <section className="leaderboard" aria-label="Group leaderboard">
          <div>
            <p className="eyebrow">THIS GROUP ONLY</p>
            <h2>Mini leaderboard</h2>
          </div>
          <div className="leaderboard-players">
            {rows.map((p) => (
              <article
                key={p.id}
                style={
                  { "--player-color": colors[p.row] } as React.CSSProperties
                }
              >
                <span className="rank">#{p.rank}</span>
                <div>
                  <strong>Player {p.id}</strong>
                  <small>
                    {p.correct} / 5 correct{" "}
                    {game.phase === "reveal"
                      ? p.lastCorrect
                        ? "· +10 ✓"
                        : "· +0"
                      : ""}
                  </small>
                </div>
                <b>
                  {p.score}
                  <small>pts</small>
                </b>
              </article>
            ))}
          </div>
        </section>
      )}

      {demo && (
        <section className="demo-panel">
          <div className="section-heading">
            <h2>Demo players</h2>
            <span>
              Toggle hand up to join; change cell to simulate movement.
            </span>
          </div>
          <div className="demo-players">
            {demoPlayers.map((p, row) => {
              function change(patch: Partial<DemoPlayer>) {
                demoMovement.current = true;
                setDemoPlayers((current) =>
                  current.map((value, i) =>
                    i === row ? { ...value, ...patch } : value,
                  ),
                );
              }
              return (
                <div key={row}>
                  <strong>Player {row + 1}</strong>
                  <label className="check">
                    <input
                      aria-label={`Player ${row + 1} present`}
                      type="checkbox"
                      checked={p.active}
                      onChange={(e) => change({ active: e.target.checked })}
                    />
                    Present
                  </label>
                  <label className="check">
                    <input
                      aria-label={`Player ${row + 1} hand raised`}
                      type="checkbox"
                      checked={p.raised}
                      disabled={!p.active}
                      onChange={(e) => change({ raised: e.target.checked })}
                    />
                    Hand up
                  </label>
                  <div className="demo-choices">
                    {choiceNames.map((name, col) => (
                      <button
                        aria-label={`Player ${row + 1} ${name}`}
                        aria-pressed={p.choice === col}
                        disabled={!p.active}
                        key={name}
                        onClick={() => change({ choice: col as Choice })}
                      >
                        {name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <footer className="footer">
        <span>MRD 2026 · MOVE TOGETHER</span>
        <span>
          {settings.inactivitySeconds}s without movement → start screen
        </span>
        <span>
          {game.players.length}/3 players · camera + game in one window
        </span>
      </footer>
    </main>
  );
}
