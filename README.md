# Move Together · MRD 2026

A bilingual, camera-controlled quiz for **one to three players**, running in **one browser window**. Camera setup, pose tracking, player display, scores, and group photos are combined at `/`. The old `/operator` and `/display` URLs redirect here.

## Quick start

```bash
bun install
bun dev
```

1. Open **http://localhost:3000** in a current desktop Chrome or Edge browser.
2. Click **Start camera**, allow access, and wait for the pose model to load.
3. Position the camera straight toward the group so everyone’s **face, shoulders, and raised hands** remain visible. Feet may be outside the frame or hidden.
4. Choose **Calibrate compact face grid**. In the mirrored preview, click around the area where faces will move in this order: **top-left → top-right → bottom-right → bottom-left**. The nine-zone grid is generated automatically.
5. Keep the grid compact. Players stand side-by-side in fixed lanes and only move a short distance backward or forward. Keep their faces from obscuring one another.
6. Close Setup, use **Fullscreen**, and mirror this window onto the TV/projector. No second app, operator window, or sync service is needed.

Camera access requires localhost or HTTPS. The initial model and WebAssembly download requires internet access. The optional environment variables in `.env.example` let you host those pinned assets locally. Pose inference runs on this computer; video is not streamed to a server.

## Grid and controls

The grid is **three movement depths × three player lanes**, viewed as shown in the mirrored preview:

| Movement | Left lane · P1 | Centre lane · P2 | Right lane · P3 |
| --- | --- | --- | --- |
| Back · A | P1 / A | P2 / A | P3 / A |
| Centre · B | P1 / B | P2 / B | P3 / B |
| Front · C | P1 / C | P2 / C | P3 / C |

Player numbers stay attached to their starting lane for the round: left is Player 1, centre is Player 2, and right is Player 3. Empty lanes are fine. Do not switch lanes during a round. The detected nose position determines whether the player is back, centred, or forward, while the pose tracker maintains identity and recognises raised hands.

- **Join:** raise either wrist above your head for one second. The first join opens a ten-second window for the other players. Only one person may occupy each lane.
- **Vote:** move back for Easy, remain centred for Medium, or move forward for Hard. The latest stable selection at the **30-second** buzzer is the vote. Most votes wins. A tie chooses randomly among the tied difficulties; no votes defaults to Easy.
- **Answer:** play **five unique random questions** from the selected bank. Answer positions are independently shuffled, keeping English and Chinese aligned. Move back, centre, or forward within your lane and hold your final choice until the timer ends.
- **Score:** correct = **10 points and one correct answer** for that player; wrong, missing, ambiguous, or unconfirmed = zero. A reveal follows each question. The mini leaderboard is only for this group; equal scores share a rank.
- **Photo:** after question five, everyone can leave their rows and pose together. An eight-second countdown captures one JPEG from the live camera. The finished photo appears next to the final leaderboard.
- **Finish:** the results screen stays for **45 seconds** and automatically returns to the hand-raise start screen. **Next group** and **Reset game** can return earlier. **Retake photo** starts a fresh pose countdown.
- **Inactivity:** after **300 seconds with no detected body movement in the grid**, any active session resets. Buttons and a running camera do not count as body movement. Settings and the camera remain ready for the next group.

## Tracking and tuning

**Setup → Timing & tracking sensitivity** exposes all durations, motion sensitivity, landmark confidence, hand height, gesture hold, answer hold, tracking reconnect time, and grid boundary tolerance. Settings and calibration auto-save to this browser. Reset to the start screen before editing them.

- Lower **Movement threshold** detects smaller motions; raise it if stationary pose jitter prevents inactivity reset. This is displacement in normalized camera coordinates, measured against the last meaningful upper-body pose, including the face, wrists, and shoulders.
- **Answer hold** prevents a brief pass through a cell from selecting it. Entering a boundary, disappearing, sharing a lane, or moving to a different cell clears the previous selection until the new cell is held long enough.
- **Landmark confidence** rejects uncertain detections. A visible face is required; visible shoulders improve player association, but feet are not required.
- Tracks are matched geometrically between frames, independently of MediaPipe’s detection order. Brief losses reconnect within the configured window. Expired tracks are not assigned to the locked roster, so another person cannot inherit the score merely by entering the row. Reset for a replacement player after a prolonged loss.
- This is pose/position tracking, not biometric identification. Crossing, full occlusion, poor lighting, and tightly overlapping players can confuse association; test the actual camera and floor layout before running the event. The live skeleton and selection indicators expose what the detector sees.

**Try without a camera** provides three demo players. Toggle Present and Hand up, then use their Back / Centre / Front buttons. The same timing, voting, scoring, and inactivity engine is used. Demo mode does not fabricate a group photo.

## Group photo storage

### Local copy (works immediately)

Each captured JPEG is saved to the browser’s **IndexedDB** database `mrd-group-photos` before the cloud upload. **Setup → Saved group photos** lists previous groups and offers download or retry-upload. These copies survive game resets and page reloads, but are device/browser-specific and are lost if browser data is cleared. If browser storage fails, the results screen still offers a download of the in-memory capture.

### Cloudflare R2 cloud copy

1. In the Cloudflare dashboard, open **Storage & Databases → R2** and create a **private Standard** bucket called `mrd-group-photos`.
2. Under **R2 → Manage API Tokens**, create an **Object Read & Write** token restricted to that bucket. Copy the Access Key ID and Secret Access Key when shown.
3. Copy `.env.example` to `.env.local` and fill in `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_PHOTO_BUCKET`.
4. Restart the Next.js server. Setup should report **Cloudflare R2 photo storage configured**.

The browser posts its final JPEG to the same-origin `/api/photos` route. Only the server uses the R2 credentials; do not put them in `NEXT_PUBLIC_` variables. Photos are stored as **`mrd-group-photos/groups/<session-uuid>.jpg`** through R2’s S3-compatible API. Retries are idempotent; retaking replaces that session’s cloud image. Retrieve photos through the R2 dashboard. The bucket does not need public access or browser CORS rules.

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

The browser tests exercise the real UI/game state machine in demo mode, and load the real pose model using Chromium’s synthetic camera to check camera startup and calibration (requires internet for the model). Unit tests cover grid projection, tracking association, gesture stability, vote ties, missing players, independent scoring, randomized answers, complete rounds, inactivity, and photo API validation. A physical camera check is still needed for real lighting, occlusion, and gesture accuracy; live R2 saving requires your bucket credentials.

### Code map

- `components/quiz-app.tsx`: combined screen, setup, timers, demo controls, photo orchestration.
- `components/use-camera.ts`: camera/model lifecycle and frame inference.
- `lib/tracking.ts`: stable pose IDs, landmarks, hand gestures, movement detection.
- `lib/calibration.ts`: perspective grid and floor-cell mapping.
- `lib/game.ts`: timed game state machine, votes, individual scoring, leaderboard.
- `lib/settings.ts`: validated configuration and defaults.
- `lib/photos.ts`: capture, IndexedDB, cloud upload client.
- `app/api/photos/route.ts`: bounded, signed JPEG upload to private Cloudflare R2 storage.
