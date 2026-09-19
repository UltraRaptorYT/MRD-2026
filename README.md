# Move Together · MRD 2026

A bilingual, camera-controlled quiz for **one to three players**, running in **one browser window**. Camera setup, pose tracking, player display, scores, and group photos are combined at `/`. The old `/operator` and `/display` URLs redirect here.

## Quick start

```bash
bun install
bun dev
```

1. Open **http://localhost:3000** in a current desktop Chrome or Edge browser.
2. Click **Start camera**, allow access, and wait for the pose model to load.
3. Position the camera so everyone’s **head, raised hands, and ankles** remain visible. Use a raised, downward-looking camera with clear sightlines between rows.
4. Choose **Calibrate 3×3 grid**. In the mirrored preview, click the four floor corners in order: **back-left → back-right → front-right → front-left**. The perspective-correct nine-cell grid is generated automatically.
5. Mark those cells on the real floor. Each row must be wide enough for a player to move left / middle / right. Stagger players so they do not obscure one another.
6. Close Setup, use **Fullscreen**, and mirror this window onto the TV/projector. No second app, operator window, or sync service is needed.

Camera access requires localhost or HTTPS. The initial model and WebAssembly download requires internet access. The optional environment variables in `.env.example` let you host those pinned assets locally. Pose inference runs on this computer; video is not streamed to a server.

## Grid and controls

The grid is **three player rows × three choices**, viewed as shown in the mirrored preview:

| Floor row | Left | Middle | Right |
| --- | --- | --- | --- |
| Back · Player 1 | P1 / A | P1 / B | P1 / C |
| Middle · Player 2 | P2 / A | P2 / B | P2 / C |
| Front · Player 3 | P3 / A | P3 / B | P3 / C |

Player numbers stay attached to their starting row for the round. Empty rows are fine: a solo player in the front row is Player 3. Do not switch rows during a round. The midpoint between detected ankles determines the floor cell.

- **Join:** raise either wrist above your head for one second. The first join opens a ten-second window for the other players. Only one person may occupy each row.
- **Vote:** move left for Easy, middle for Medium, right for Hard. The latest stable selection at the **30-second** buzzer is the vote. Most votes wins. A tie chooses randomly among the tied difficulties; no votes defaults to Easy.
- **Answer:** play **five unique random questions** from the selected bank. Answer positions are independently shuffled, keeping English and Chinese aligned. Move within your own row and hold your final choice until the timer ends.
- **Score:** correct = **10 points and one correct answer** for that player; wrong, missing, ambiguous, or unconfirmed = zero. A reveal follows each question. The mini leaderboard is only for this group; equal scores share a rank.
- **Photo:** after question five, everyone can leave their rows and pose together. An eight-second countdown captures one JPEG from the live camera. The finished photo appears next to the final leaderboard.
- **Finish:** the results screen stays for **45 seconds** and automatically returns to the hand-raise start screen. **Next group** and **Reset game** can return earlier. **Retake photo** starts a fresh pose countdown.
- **Inactivity:** after **300 seconds with no detected body movement in the grid**, any active session resets. Buttons and a running camera do not count as body movement. Settings and the camera remain ready for the next group.

## Tracking and tuning

**Setup → Timing & tracking sensitivity** exposes all durations, motion sensitivity, landmark confidence, hand height, gesture hold, answer hold, tracking reconnect time, and grid boundary tolerance. Settings and calibration auto-save to this browser. Reset to the start screen before editing them.

- Lower **Movement threshold** detects smaller motions; raise it if stationary pose jitter prevents inactivity reset. This is displacement in normalized camera coordinates, measured against the last meaningful pose, including wrists, shoulders, hips, head, and ankles.
- **Answer hold** prevents a brief pass through a cell from selecting it. Entering a boundary, disappearing, sharing a row, or moving to a different cell clears the previous selection until the new cell is held long enough.
- **Landmark confidence** rejects uncertain detections. Full feet and hips must be visible for a usable observation.
- Tracks are matched geometrically between frames, independently of MediaPipe’s detection order. Brief losses reconnect within the configured window. Expired tracks are not assigned to the locked roster, so another person cannot inherit the score merely by entering the row. Reset for a replacement player after a prolonged loss.
- This is pose/position tracking, not biometric identification. Crossing, full occlusion, poor lighting, and tightly overlapping players can confuse association; test the actual camera and floor layout before running the event. The live skeleton and selection indicators expose what the detector sees.

**Try without a camera** provides three demo players. Toggle Present and Hand up, then use their Left / Middle / Right buttons. The same timing, voting, scoring, and inactivity engine is used. Demo mode does not fabricate a group photo.

## Group photo storage

### Local copy (works immediately)

Each captured JPEG is saved to the browser’s **IndexedDB** database `mrd-group-photos` before the cloud upload. **Setup → Saved group photos** lists previous groups and offers download or retry-upload. These copies survive game resets and page reloads, but are device/browser-specific and are lost if browser data is cleared. If browser storage fails, the results screen still offers a download of the in-memory capture.

### Supabase cloud copy

1. Create a Supabase project.
2. In **Storage**, create a **private** bucket called `mrd-group-photos`. Set allowed MIME type to `image/jpeg` and maximum file size to 3 MB.
3. Copy `.env.example` to `.env.local` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_PHOTO_BUCKET`.
4. Restart the Next.js server. Setup should report **Supabase photo storage configured**.

The browser posts its final JPEG to the same-origin `/api/photos` route. Only the server uses the service-role key; do not put it in a `NEXT_PUBLIC_` variable. Photos are stored as **`mrd-group-photos/groups/<session-uuid>.jpg`**. Retries are idempotent; retaking replaces that session’s cloud image. Retrieve cloud photos through the Supabase Storage dashboard. No public bucket or public read policy is needed.

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

The browser tests exercise the real UI/game state machine in demo mode, and load the real pose model using Chromium’s synthetic camera to check camera startup and calibration (requires internet for the model). Unit tests cover grid projection, tracking association, gesture stability, vote ties, missing players, independent scoring, randomized answers, complete rounds, inactivity, and photo API validation. A physical camera check is still needed for real lighting, occlusion, and gesture accuracy; live Supabase saving requires your project credentials.

### Code map

- `components/quiz-app.tsx`: combined screen, setup, timers, demo controls, photo orchestration.
- `components/use-camera.ts`: camera/model lifecycle and frame inference.
- `lib/tracking.ts`: stable pose IDs, landmarks, hand gestures, movement detection.
- `lib/calibration.ts`: perspective grid and floor-cell mapping.
- `lib/game.ts`: timed game state machine, votes, individual scoring, leaderboard.
- `lib/settings.ts`: validated configuration and defaults.
- `lib/photos.ts`: capture, IndexedDB, cloud upload client.
- `app/api/photos/route.ts`: bounded JPEG upload to private Supabase storage.
