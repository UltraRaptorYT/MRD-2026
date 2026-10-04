# Move Together · MRD 2026

A bilingual, camera-controlled quiz for **one to three players**, running in **one browser window**. Camera setup, pose tracking, player display, scores, and group photos are combined at `/`. The old `/operator` and `/display` URLs redirect here.

## Quick start

```bash
bun install
bun dev
```

1. Open **http://localhost:3000** in a current desktop Chrome or Edge browser.
2. Allow camera access when prompted. The camera starts automatically and loads the pose model; use **Restart camera** if access fails or the camera disconnects.
3. Position the camera straight toward the group so everyone’s **face, shoulders, and raised hands** remain visible. Feet may be outside the frame or hidden.
4. Choose **Calibrate face grid**. In the mirrored preview, click **two opposite corners** around the area where faces will move. A straight rectangular nine-zone grid is generated automatically, so it cannot become tilted.
5. Keep all players inside the wider grid. Players stand side-by-side in fixed lanes and only move a short distance backward or forward. Keep their faces from obscuring one another.
6. Close Setup, use **Fullscreen**, and mirror this window onto the TV/projector. No second app, operator window, or sync service is needed.

Camera access requires localhost or HTTPS. The initial model and WebAssembly download requires internet access. The optional environment variables in `.env.example` let you host those pinned assets locally. Pose inference runs on this computer; video is not streamed to a server.

## Grid and controls

The grid is **three movement depths × three player lanes**, viewed as shown in the mirrored preview:

| Movement | Left lane · P1 | Center lane · P2 | Right lane · P3 |
| --- | --- | --- | --- |
| Front ↑ · C | P1 / C | P2 / C | P3 / C |
| Center · B | P1 / B | P2 / B | P3 / B |
| Back ↓ · A | P1 / A | P2 / A | P3 / A |

Player numbers stay attached to their starting lane for the round: left is Player 1, center is Player 2, and right is Player 3. Empty lanes are fine. Do not switch lanes during a round. A single detected person in a lane is associated with that lane's player, so a temporary pose tracker ID reset does not remove them from the game. The detected nose position determines whether the player is back, centered, or forward; a raised hand held steadily joins a new lane.

- **Join:** raise either wrist above your head for one second. The first join opens a ten-second window for the other players. Only one person may occupy each lane.
- **Vote:** move forward for Hard, remain centered for Medium, or move back for Easy. The latest stable selection at the **30-second** buzzer is the vote. Most votes wins. A tie chooses randomly among the tied difficulties; no votes defaults to Easy.
- **Answer:** play **five unique random questions** from the selected bank. Answer positions are independently shuffled, keeping English and Chinese aligned. Move forward, center, or back within your lane and hold your final choice until the timer ends.
- **Score:** correct = **10 points and one correct answer** for that player; wrong, missing, ambiguous, or unconfirmed = zero. A reveal follows each question. The mini leaderboard is only for this group; equal scores share a rank.
- **Photo:** after question five, everyone can leave their rows and pose together. An eight-second countdown captures one JPEG from the live camera. The finished photo appears next to the final leaderboard.
- **Finish:** the results screen stays for **45 seconds** and automatically returns to the hand-raise start screen. **Next group** and **Reset game** can return earlier. **Retake photo** starts a fresh pose countdown.
- **Inactivity:** after **300 seconds with no detected body movement in the grid**, any active session resets. Buttons and a running camera do not count as body movement. Settings and the camera remain ready for the next group.

## Tracking and tuning

**Setup → Timing & tracking sensitivity** exposes all durations, person-detection confidence, motion sensitivity, face and gesture landmark confidence, hand height, gesture hold, answer hold, tracking reconnect time, and grid boundary tolerance. Settings and calibration auto-save to this browser. Reset to the start screen before editing them.

- Lower **Movement threshold** detects smaller motions; raise it if stationary pose jitter prevents inactivity reset. This is displacement in normalized camera coordinates, measured against the last meaningful upper-body pose, including the face, wrists, and shoulders.
- **Answer hold** prevents a brief pass through a cell from selecting it. Entering a boundary, disappearing, sharing a lane, or moving to a different cell clears the previous selection until the new cell is held long enough.
- **Person detection confidence** now defaults to 10%. The detector can return up to ten poses, but zone assignment requires a reliable nose or at least two reliable face landmarks to avoid false points on the background. Keep faces visible and evenly lit. Restart the camera after changing this setting.
- **Face and gesture landmark confidence** now defaults to 45% and filters unreliable face anchors as well as hand gestures and the displayed skeleton. The nose is preferred for zone selection, with a multi-point face center as a fallback. Feet are not required.
- The full MediaPipe pose model runs in a Web Worker, trying GPU first and CPU if GPU setup fails. Browsers that cannot run the worker use a CPU main-thread fallback. The camera caption shows raw poses, poses accepted by the face/landmark check, inference time, and the active delegate. If raw poses stay at one with all players visible, the detector is the bottleneck; if raw poses are higher but usable poses are low, review face visibility and landmark confidence.
- Game slots follow the fixed lanes rather than continuous person IDs. A unique detected person in a player's lane restores that player automatically after a tracking interruption; ambiguous lanes are treated as missing. This assumes players stay in their assigned lanes. Close overlap, full occlusion, poor lighting, or lane swapping can still confuse camera-only tracking.
- This is pose/position tracking, not biometric identification. The live skeleton, lane indicators, and detector diagnostics expose what the camera pipeline sees. Consider a YOLO Pose prototype only if the live raw pose count remains one with multiple visible players; it adds a separate runtime or service and can still miss or swap people.

## Group photo storage

### Local copy (works immediately)

Each captured JPEG is saved to the browser’s **IndexedDB** database `mrd-group-photos` before the cloud upload. **Setup → Saved group photos** lists previous groups and offers download or retry-upload. These copies survive game resets and page reloads, but are device/browser-specific and are lost if browser data is cleared. If browser storage fails, the results screen still offers a download of the in-memory capture.

### Supabase Storage cloud copy

1. In the Supabase dashboard, open **Storage** and create a **private** bucket called `mrd-group-photos`. Set its allowed MIME type to `image/jpeg` and file size limit to `3 MB`.
2. In **Project Settings → API Keys**, create or copy a server-side **secret key** (`sb_secret_...`). Do not expose it in a `NEXT_PUBLIC_` variable.
3. Copy `.env.example` to `.env.local`. Set `SUPABASE_URL` (or use the existing `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_SECRET_KEY`, and `SUPABASE_PHOTO_BUCKET`.
4. Restart the Next.js server. Setup should report **Supabase photo storage configured**.

The browser posts its final JPEG to the same-origin `/api/photos` route. The server uses the Supabase secret key to upload directly to the private bucket; do not put that key in a browser variable. Photos are stored as **`mrd-group-photos/groups/<session-uuid>.jpg`**. Retries are idempotent; retaking replaces that session’s cloud image. The results screen shows a QR code that downloads the photo on a phone using a signed link valid for one hour. Saved local photos also have a **Show download QR** option. Retrieve photos through the Storage dashboard. The bucket does not need public access or browser CORS rules.

Failed cloud uploads retain the local original and show a retry/download action. Uploads have a timeout and do not block the 45-second reset. The upload endpoint is designed for this event kiosk; use the hosting platform’s access controls if deploying the operator experience publicly.

## Question bank

Edit `data/questions.json`. Each difficulty needs at least five questions. Every entry has a unique `id`, `difficulty`, `zh` and `en` question/three-answer arrays, and a zero-based `correctAnswer`. The bank is validated when loaded. The included bank contains six questions per difficulty.

## Development and checks

```bash
bun run lint
bun run typecheck
bun run test
bunx playwright install chromium
bun run test:e2e
bun run build
bun start
```

The browser tests load the real pose model using Chromium’s synthetic camera to check camera startup and calibration (requires internet for the model). Unit tests cover grid projection, tracking association, gesture stability, vote ties, missing players, independent scoring, randomized answers, complete rounds, inactivity, and photo API validation. A physical camera check is still needed for real lighting, occlusion, and gesture accuracy; live Supabase saving requires your bucket and server key.

### Code map

- `components/quiz-app.tsx`: combined screen, setup, timers, and photo orchestration.
- `components/use-camera.ts`: camera/model lifecycle and frame inference.
- `lib/tracking.ts`: pose acceptance, landmarks, hand gestures, movement detection, and tracker IDs used for continuity diagnostics.
- `lib/calibration.ts`: straight rectangular grid and cell mapping.
- `lib/game.ts`: timed game state machine, votes, individual scoring, leaderboard.
- `lib/settings.ts`: validated configuration and defaults.
- `lib/photos.ts`: capture, IndexedDB, cloud upload client.
- `app/api/photos/route.ts`: bounded JPEG upload to private Supabase Storage.
