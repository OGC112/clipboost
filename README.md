# ClipBoost 21.5.2 — Canto Asset Discovery

V21.5.2 separates real campaign media packs from requirement artwork during authenticated Smart Import. Canto galleries are inspected through hidden browser workers, generic requirement download links are stored as reference artwork, and imported asset packs can be opened safely from Review/Sources after the import browser closes.

## 21.5.2 highlights

- CLIPPING.NET `Assets` / `Assets #2` remain campaign asset packs instead of being confused with requirement download images.
- Generic `Download` links under Clip Requirements are stored as **Reference artwork** and are not counted as editable media.
- Canto gallery thumbnails no longer count as real image assets.
- ClipBoost follows Canto child media pages in the background and counts detected videos across the pack.
- Review Import now shows direct sources, asset packs, reference images, requirements and violations separately.
- Asset pack links in Review/Sources open externally, so the Smart Import window closing cannot prevent opening the second pack.
- When Smart Import starts from the campaign listing, ClipBoost keeps the actual selected campaign detail URL rather than saving `/dashboard/campaigns`.
- Existing 21.5.1 cross-checking, platform rules, Eco AI mode, stuck-project recovery and silent updater remain preserved.

# ClipBoost 21.4.9 — Stuck Project Recovery

V21.4.5 makes Campaigns substantially shorter and easier to scan. The selected campaign is now organized into **Overview / Sources / Published / Rules**, campaign cards scroll horizontally instead of growing into a long grid, and Add/Edit opens in a right-side drawer. Campaign URL import now detects login and anti-bot walls before saving anything, keeps the URL, and opens manual entry rather than polluting the brief with sign-in text.

## 21.4.5 highlights

- Four primary KPIs only: payment, minimum qualification, tracked views, and deadline.
- Compact qualification progress plus estimated/confirmed payout in Overview.
- Setup readiness collapses to one concise status instead of five full-width cards.
- Sources, published posts and rules live in dedicated tabs and only render when needed.
- Campaign selector is a single horizontal row to reduce vertical scrolling.
- Add campaign / Edit terms uses a side drawer.
- Login-only or anti-bot campaign pages return a safe manual-entry fallback; no login-page text is stored as the campaign brief.
- Existing payout models, Campaign Fit, View Potential, compliance, submission pack, source workflow and seamless updater remain preserved.

# ClipBoost 21.4.3 — Real Campaign Model

V21.4.3 makes Campaigns match real paid-clipping platforms more closely. Campaign cards now model per-view rates, bounty pools, qualification thresholds, access state, platform-specific payouts, submission status and confirmed payout. Existing Campaign → Sources → AI Studio → Export → Tracking remains intact, with the silent updater and Smart YouTube Authentication preserved.

## What changed

- Payment models: **Per views**, **Bounty pool**, **Fixed reward**, and **Custom / manual**.
- Minimum views to qualify are tracked separately from payout amounts.
- Per-platform payout rates for TikTok, Instagram, YouTube and X, with configurable rate basis (for example per 100K views).
- Campaign access: Open, Application required, or Private.
- Maximum payout, bounty pool, fixed/default rate, and confirmed payout are separate fields.
- Campaign cards now expose the real commercial terms and allowed platforms at a glance.
- Campaign detail separates **Estimated payout** from **Confirmed payout**.
- Published posts can be Pending / Accepted / Rejected and store confirmed payout.
- Submission pack includes the richer payment model and rule data.
- Public campaign URL import opportunistically recognizes obvious bounty/per-view/minimum-view terms when present on a public page. Manual review remains required.
- Campaign saving now snapshots the form before rendering the saving state, preventing typed values from being lost during save.
- Existing sources, AI Studio campaign context, View Potential, Campaign Fit, compliance checks and Used Moments remain preserved.

---

# ClipBoost 21.4.0 — Campaign Workspace

## 21.4.1 — Smart YouTube Authentication

ClipBoost now handles current YouTube ingest challenges automatically. Library → Edit with AI Studio first tries a normal download, then retries with the configured browser session when YouTube requests authentication. Firefox is recommended and can stay open. Node/EJS and FFmpeg are auto-detected from the D: tool layout, and the existing silent GitHub auto-update flow remains enabled.


V21.4.0 turns ClipBoost into a paid-campaign clipping workflow: bring the campaign brief and authorized sources, then use AI Studio to produce compliant clips optimized for retention and views.

## Campaign workflow

- **Campaigns workspace** for name, provider, campaign URL, brief, platforms, duration rules, deadline, view threshold, payout model, hashtags, mentions, CTA and forbidden terms.
- **Public campaign URL import** tries to extract public page title/description plus YouTube/Twitch source links. Manual entry always remains available for login-only/blocked sites.
- **Authorized source list** with one-click **Edit with AI Studio** and a safe **Queue all sources** batch action.
- **Campaign-aware Context Engine** keeps context completeness as the hard requirement while adding brief relevance, campaign duration fit, used-range avoidance and campaign rules to ranking.
- **View Potential** score based on hook, retention, emotion, completeness, payoff and clean speech. This is an editing signal, not a guarantee of views.
- **Campaign Fit** score for brief relevance, duration fit, performance history and compliance constraints.
- **Hook variants**: Tight hook, Balanced and More context versions for the selected moment.
- **Pre-export campaign check** for duration, forbidden terms, brief relevance, vertical output and captions.
- **Used moments** are tracked after export so the same campaign/project range can be deprioritized on later analysis.
- **Performance tracking** stores published URLs, views, clip duration and editing minutes. The workspace shows payout progress, remaining views, average/best views, learned best-performing duration and estimated revenue/hour.
- **Submission pack** exports campaign rules, tracked posts, totals and used moments as JSON.
- **Seamless updater remains enabled**: one prompt per downloaded version, silent install and automatic relaunch. Fresh installs default to the `OGC112/clipboost` GitHub release channel; `.env` can still override it.

## Important

Campaign Mode assumes you are using sources and promotional material you are authorized to reuse under the campaign rules. Site import only reads public pages; it does not bypass logins or platform protections.

---

# ClipBoost 21.3.8 — Fast Local AI Pipeline

V21.3.8 accelerates the long-video **Library → Edit with AI Studio → Analyzing with Local AI** phase without changing the Whisper model, beam size, word timestamps, Context Engine scoring, or final render quality.

## Major changes

- **Decode audio once**: ClipBoost creates one 16 kHz mono PCM analysis master and reuses it instead of asking FFmpeg to decode the full video again for every transcription chunk.
- **Fast PCM chunk slicing**: Whisper chunks are cut directly from the prepared audio master, avoiding dozens of extra FFmpeg/video-decoder launches on hour-long sources.
- **One shared Whisper model**: parallel chunk transcription uses one `WhisperModel` with CTranslate2 workers and Python threads instead of loading a complete model in every process.
- **Resumable cache v2**: chunk cache keys now include the source signature and Whisper profile so cached results stay safe when media/model settings change.
- **Heavy transcription cache follows uploads**: prepared PCM and chunk cache are stored below `uploads/.clipboost-cache`, so a moved/junctioned uploads folder keeps these large temporary analysis files on the same drive.
- **Auto workers option**: Settings now offers `Auto (recommended)` and selects 1–4 workers from available CPU/RAM. Existing explicit worker choices remain respected.
- **Clearer progress**: AI Studio distinguishes transcript percentage from overall analysis percentage and shows audio preparation/model loading/cache reuse phases.
- **Quality unchanged**: `faster-whisper` model choice, `beam_size=5`, word timestamps, VAD settings, transcript cleanup, clip selection and final render settings are unchanged.

## Recommended first test

Choose a 45–90 minute YouTube/Twitch video from Library and click **Edit with AI Studio**. Watch the transcription line in AI Studio. Compare total transcription time with 21.3.7 on a similar source. For maximum throughput, set **Settings → Local AI → Workers → Auto (recommended)**.

---

# ClipBoost 21.3.0 — Clip Intelligence v2

V21.3.0 improves the editorial decision layer in AI Studio. It focuses on choosing clips that make sense without missing context and that end on a real payoff instead of simply scoring energetic transcript windows.

## Major changes

- **Boundary-aware selection**: candidate starts are snapped to natural speech/phrase boundaries rather than caption chunks.
- **Context completeness scoring**: dangling connectors, pronouns and mid-thought openings are penalized.
- **Payoff-aware endings**: conclusions, answers, reveals and natural pauses are rewarded; unfinished endings are capped.
- **Hard quality guardrails**: a clip with a weak opening or weak ending can no longer receive an elite overall score only because another model supplied a high base score.
- **Semantic deduplication v2**: candidates are compared using the full selected transcript, not only the hook/title, reducing repeated versions of the same story.
- **Phrase-aware deterministic fallback**: when Ollama cannot select a section, ClipBoost builds complete 18–60 second windows from local speech phrases instead of fixed transcript blocks.
- **Long-video coverage**: the deterministic pool keeps both top-ranked moments and timeline-spread candidates before final ranking.
- **Visible completeness metric** on candidate cards alongside Hook, Story, Retention and Clean Speech.
- **Quality Engine v2 prompt** explicitly prioritizes Context → Payoff → Hook → Retention → Diversity.
- The validated **21.2.5 seamless updater is unchanged**.

## Recommended first test

Open an existing project with a cached transcript and click **Generate variations**. Compare the top 5–10 clips against the previous version, especially the first and last spoken sentence of each clip.

---

# ClipBoost v21.2.0 — Quality Engine

V21.2.0 focuses on editorial quality rather than adding more surface features. The goal is to make generated clips feel cleaner, more intentional and closer to what a human short-form editor would choose.

## Major changes

- **Quality-first clip selection**: candidates are rescored for Hook, Story, Emotion, Retention, Clean speech and Visual quality. Boundaries are snapped to complete speech groups to reduce clips starting or ending mid-sentence.
- **Better clip diversity**: overlap and text-similarity deduplication are stricter, and long videos are sampled across more timeline sections.
- **Cleaned transcript pipeline**: common fillers and accidental repeated words/short phrases are removed from the caption transcript while word timestamps remain local.
- **Automatic punctuation**: caption groups now receive capitalization plus period/question/comma punctuation based on phrase structure and pauses.
- **Speech cleanup modes**:
  - `Clean captions` keeps the original audio but removes stutters/fillers from captions.
  - `Clean speech + captions` also removes short detected disfluencies from the rendered audio/video timeline.
  - `Off` preserves the raw word stream for captions.
- **Natural Auto Zoom v2**: no more mandatory zoom at the start and no arbitrary “zoom every few seconds” fallback. Zooms are now triggered by strong hooks, meaningful speech emphasis or reaction peaks, with larger spacing and lower zoom strength.
- **Smoother zoom motion**: zoom events are ramped through short intermediate steps instead of switching scale in one hard jump.
- **Auto Zoom modes**: Minimal, Natural and Energetic.
- **Common caption colors only**: White, Yellow, Red, Green, Blue, Purple, Orange and Black.
- **Quality score details** are shown on generated candidate cards so you can see why a clip was selected.
- **Old projects are supported**: re-running `Generate variations` upgrades the existing cached transcript to the Quality Engine cleanup format; you do not need to upload the source again as long as the original media is still available.

## Recommended first test

Use an existing long project and click **Generate variations** once. Then compare the new top clips with the previous list.

Recommended render settings:

- Speech cleanup: `Clean captions`
- Auto zoom: `Natural`
- Dynamic zoom: ON
- Smart 9:16 reframing: ON
- Speaker tracking: ON
- Caption color: White or Yellow

If the spoken stutters are distracting in the final video, switch Speech cleanup to **Clean speech + captions** and regenerate the preview before export.

---

# ClipBoost v21.1.0 — Smart Reframing & Speaker Tracking

V21.1.0 is the first computer-vision editing release. The goal is to make vertical clips feel camera-directed rather than simply center-cropped.

## Major features

- **Local face tracking** powered by OpenCV. ClipBoost samples each selected clip, follows face positions and caches the tracking result locally.
- **Speaker-aware framing** uses lower-face motion as a lightweight local cue for the active speaker. It is designed as a practical heuristic, not biometric speaker identification.
- **Tracking modes**: Active speaker, Center subject and Two-person / split.
- **Camera movement control**: Low, Balanced or High. Tracking is smoothed before rendering so the virtual camera does not jump on every frame.
- **Real moving 9:16 crop**: FFmpeg now receives face-aware crop positions for each timeline section instead of using one fixed centered crop.
- **Reaction detection**: strong face-motion peaks can add tasteful reaction punch-ins when Dynamic Zoom is enabled.
- **Scene-aware framing**: detected scene changes create framing reset boundaries so a crop from the previous shot is not blindly carried into the next one.
- **Tracking diagnostics in preview**: rendered previews show detected face count, speaker switches and reaction peaks.
- **System Health** now checks the OpenCV tracking engine in addition to FFmpeg, Python, Ollama and integrations.
- **Tracking cache**: once a clip is tracked, changing captions or reopening the project can reuse the local tracking data.

## Local AI dependency update

Run once after applying this version:

```powershell
python -m pip install -r requirements-local-ai.txt
```

This adds `opencv-python-headless` and `numpy`. All face/speaker framing analysis remains on your PC; no face data is uploaded to a cloud service by this feature.

## Recommended first test

In AI Studio choose:

- Smart 9:16 reframing: ON
- Speaker tracking: ON
- Tracking mode: Active speaker
- Camera movement: Balanced
- Reaction detection: ON
- Scene-aware cuts: ON

The first preview of a clip may take a little longer because ClipBoost creates and caches the tracking pass. Later renders of the same clip reuse it.

## Automatic release versioning

The GitHub Actions workflow now treats the `package.json` version as the minimum release version. That means this major/minor update publishes as **v21.1.0** even when the previous GitHub release is v21.0.x.

---

# ClipBoost v21.0.4 — Creative Engine Update

V21.0.4 is a larger editing/desktop release focused on making ClipBoost feel more like a real automatic short-form editor.

## Highlights

- **Functional edit presets**: Dynamic, Clean, Gaming and Podcast. Each preset changes silence-cut aggressiveness, hook punch-ins and zoom rhythm in the actual FFmpeg render.
- **Caption designer**: Bold Viral, Clean, Neon and Minimal caption looks, plus Top / Center / Bottom positioning and Small / Medium / Large sizing. Preview and export use the same settings.
- **Persistent editor preferences**: your preset, caption design, edit intensity and toggles survive reloads/restarts.
- **Update Center in the top bar**: download progress and update-ready state are visible inside ClipBoost instead of relying on Windows dialogs.
- **System Health diagnostics** in Settings: one-click checks for FFmpeg, FFprobe, Python, Ollama, YouTube and Twitch plus the current data/export paths.
- **Studio keyboard shortcuts**: Ctrl+E exports the current clip, Ctrl+Shift+E exports all clips, and Left/Right switches between generated candidates.
- **Automatic GitHub release workflow** remains included and uses the fixed build-only + GitHub-release publishing flow.

## Publish this update

With the permanent development folder connected to GitHub, use `Publish ClipBoost Update.bat`. GitHub Actions will build and publish the Windows installer automatically. With v21.0.3 already released, this push is built as **v21.0.4**.

# ClipBoost v21.0.3 — Custom dialogs

This build replaces native Windows/browser alerts with ClipBoost-styled dialogs for updates, creator removal, exports, errors, and project deletion.

## V21.0.2 fullscreen preview fix

Short previews now keep their 9:16 aspect ratio in fullscreen instead of using `object-fit: cover`. The video stays centered on a black background with side bars on widescreen displays.

# ClipBoost V21 — Real Auto Editing

V21 turns the AI Edit Planner into a real FFmpeg render pipeline. Edited previews and exports now apply silence removal, vertical reframing, punch-ins/dynamic zooms, and burned captions. AI Studio can export one clip or all generated clips.

# ClipBoost Desktop V20.2

This build fixes the blank Electron window caused by the frontend script not being bundled by Vite.

## Run in desktop development mode

```powershell
npm install
npm run desktop
```

## Build the Windows installer

```powershell
npm install
npm run desktop:build
```

The installer is written to `release\ClipBoost-Setup-20.2.0.exe`.

Your `.env` and ClipBoost data remain in the Windows user data directory when installed.

# ClipBoost V15 — Resilient Local AI + AI Edit Planner

This build keeps the YouTube/Twitch Library, automatic source ingestion and local AI pipeline, and adds a more reliable transcription engine plus the first automatic edit-planning layer.

## What changed

- Faster-Whisper now transcribes in resumable chunks.
- Completed chunks are cached under `storage/transcript-cache/<project-id>/`.
- If transcription stalls, the server watchdog kills the stuck process and retries with smaller chunks.
- Re-opening/re-analyzing a project reuses an existing finished transcript instead of starting over.
- Real chunk progress is exposed to AI Studio.
- Each candidate clip now receives an **AI Edit Plan** with:
  - opening punch-in
  - auto-reframe pass
  - silence cuts
  - dynamic zoom moments based on transcript emphasis
- AI Studio shows the number of planned cuts/zooms for the selected candidate.

## Recommended local settings (Windows / CPU)

```env
PYTHON_BIN=python
LOCAL_WHISPER_MODEL=small
LOCAL_WHISPER_DEVICE=cpu
LOCAL_WHISPER_COMPUTE_TYPE=int8
LOCAL_WHISPER_CHUNK_SECONDS=180
LOCAL_WHISPER_CHUNK_TIMEOUT_MS=600000
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:3b
```

For a slower CPU, try 120-second chunks:

```env
LOCAL_WHISPER_CHUNK_SECONDS=120
```

## Setup

```powershell
python -m pip install -r requirements-local-ai.txt
npm install
npm run dev
```

Open `http://localhost:8000`.

The first use of a Faster-Whisper model may download model files. FFmpeg/FFprobe must be available in PATH.

## V16 — Multi-clip long-form detection

AI Studio now supports adaptive clip counts for long-form content:

- < 5 min: ~3 clips
- 5–15 min: ~5 clips
- 15–30 min: ~8 clips
- 30–60 min: ~12 clips
- 60–120 min: ~16 clips
- 2h+: up to 20 clips

Use **How many clips? → Auto / 5 / 10 / 20**, then **Generate variations** to re-run clip selection using the cached transcript. Long videos are analyzed in multiple timeline sections so recommendations are distributed across the full source, with overlap/text-similarity deduplication.

## V17 — Fast transcription (CPU)

V17 keeps the same Whisper model quality while speeding long videos through:
- 120-second speech chunks by default
- 2 parallel Whisper workers on CPU
- long-silence skipping before transcription
- per-chunk cache and resume
- live progress showing chunks, workers, and skipped silence

Recommended `.env` settings:

```env
LOCAL_WHISPER_MODEL=small
LOCAL_WHISPER_DEVICE=cpu
LOCAL_WHISPER_COMPUTE_TYPE=int8
LOCAL_WHISPER_CHUNK_SECONDS=120
LOCAL_WHISPER_WORKERS=2
LOCAL_WHISPER_CPU_THREADS=0
LOCAL_WHISPER_SKIP_SILENCE=true
```

`LOCAL_WHISPER_CPU_THREADS=0` lets ClipBoost divide available CPU threads between workers automatically. If your PC remains responsive and has many CPU cores, try `LOCAL_WHISPER_WORKERS=3`. If the machine becomes sluggish or transcription slows down, go back to `2`.

## V18 navigation + multi-clip fixes

- Pages now use hash routes (`#/library`, `#/studio`, etc.), so refreshing keeps the current page.
- AI Studio remembers the last opened project in the browser and restores it after a refresh.
- The local AI selection always fills long-form analyses with transcript-based fallback moments when the local LLM returns too few clips.
- AI Studio now shows the full generated clip browser with a visible clip count and selectable cards.

## V19 Smart Timeline

The AI Studio timeline now visualizes real analysis data:
- AI clip ranges
- selected clip range
- scene changes
- detected silence regions
- interactive playhead
- click anywhere on the timeline to seek the source video
- click a clip segment to select and preview that candidate

Existing projects analyzed before V19 may not contain saved scene/silence arrays. Re-run Generate variations / analysis once to populate the richer timeline signals.

## Desktop app (Windows / Electron)

ClipBoost can now run as a native desktop app. Electron starts the local Node backend automatically, opens ClipBoost in its own window, and shuts the backend down when the app closes.

### Run the desktop app during development

```powershell
npm install
npm run desktop
```

No browser and no separate `npm run dev` terminal are required.

### Build a Windows installer

```powershell
npm install
npm run desktop:build
```

The installer is created in:

```text
release\ClipBoost-Setup-20.1.0.exe
```

The NSIS installer creates a Desktop shortcut and a Start Menu shortcut.

### Desktop data and API keys

The desktop build deliberately keeps user data outside the installation directory. On Windows it uses Electron's user-data folder (normally under `%APPDATA%\ClipBoost`). It contains:

- `data\` — Library, downloaded sources, project metadata and exports.
- `.env` — YouTube/Twitch/local-AI settings.

Use the desktop menu `ClipBoost -> Open config (.env)` to edit the desktop app's configuration. The first development launch copies your project `.env` into the desktop configuration folder when possible. Packaged installers never bundle your private `.env` secrets.

FFmpeg, Python/faster-whisper, Ollama and yt-dlp continue to run locally and must be installed on the machine, just like in the web-development version.

## Desktop V20.3 - blank-screen hardening + auto-update

The Electron runtime now serves the source UI directly from the local ClipBoost backend instead of relying on the Vite production bundle. This makes the Windows desktop build much more robust.

### Desktop test

```powershell
npm install
npm run desktop
```

### Build installer

```powershell
npm run desktop:build
```

The installer is written to `release/`.

### Automatic updates

Installed builds check for updates automatically shortly after startup. Updates use GitHub Releases.

In ClipBoost's desktop `.env`, configure:

```env
CLIPBOOST_UPDATE_OWNER=YOUR_GITHUB_USERNAME
CLIPBOOST_UPDATE_REPO=YOUR_REPOSITORY_NAME
```

The repository must publish electron-builder release artifacts. When a new version is downloaded, ClipBoost asks whether to **Restart & Install**. There is also **ClipBoost > Check for updates** in the desktop menu.

## V20.4 — Windows system tray

- Closing the main window with **X** now hides ClipBoost to the Windows notification area instead of stopping the backend.
- Click the ClipBoost tray icon to show/hide the app.
- Right-click the tray icon for **Open ClipBoost**, **Check for updates**, **Open data folder**, **Open config (.env)** and **Quit ClipBoost**.
- **Quit ClipBoost** is the action that fully stops the local backend.
- A second launch of ClipBoost brings the existing window back instead of starting a duplicate instance.


## V20.6 preview reliability

AI Studio now generates a lightweight cached 9:16 MP4 for each selected candidate clip. This makes the short preview independent from the full source video's seek state. Click any generated clip to prepare and play its own preview. Editing Start/End invalidates that cached preview and regenerates it automatically.

## Automatic GitHub releases

This version includes `.github/workflows/release-windows.yml`.

After it is pushed to `main`, every subsequent code push to `main` automatically:

1. Reads the latest `vX.Y.Z` Git tag.
2. Increments the patch version for the build.
3. Builds the Windows NSIS installer on GitHub Actions.
4. Creates the new GitHub Release.
5. Uploads `ClipBoost-Setup-X.Y.Z.exe`, `latest.yml`, and the `.blockmap` file.
6. Makes the release available to ClipBoost's Electron auto-updater.

The repository workflow requires **Settings → Actions → General → Workflow permissions → Read and write permissions** so GitHub Actions can create releases.

### Publish an update from Windows

Double-click `Publish ClipBoost Update.bat`. It stages changes, creates a commit, and pushes `main`. GitHub handles the Windows build and Release automatically.

### Refresh the local development folder

Double-click `Update ClipBoost Dev.bat` to run `git pull --rebase origin main` followed by `npm install`.

## 21.2.1 Twitch Live Fix
- Dedicated batch live-status refresh for followed Twitch creators.
- Automatic refresh every 60 seconds while Library → Twitch → Live is open.
- Watch Live opens Twitch externally for reliable Electron desktop playback.

## v21.2.2 — Seamless Update Fix
- Deduplicates updater events so the **Update ready** modal appears once per version.
- Coalesces overlapping update checks.
- `Restart & install` now launches the NSIS updater silently and relaunches ClipBoost automatically.
- Replaces the assisted NSIS installer with a current-user one-click installer, removing the **Just me / all users** and **Next** steps.
- Adds an in-app **Installing silently…** state before ClipBoost closes for the update.



## 21.3.1 — Auto Director + Library Refresh Fix

- AI Studio now exposes only clip count and caption preference; technical edit controls are automatic per clip.
- Auto Director adapts framing, face/duo tracking, speech cleanup, scene cuts, camera motion, caption design and zoom behavior from the source.
- YouTube and Twitch Refresh buttons now use dedicated refresh-all backend endpoints with visible progress/result feedback.


## 21.4.2 — Campaign Workflow Polish

Campaigns is now designed as an operational workspace rather than a long configuration form:
- focused campaign dashboard with views, payout target, deadline and performance summary;
- setup-readiness checks for brief, authorized sources, duration rules, publishing rules and payout;
- one-click **Start creating clips** from the campaign dashboard;
- campaign context follows sources into AI Studio automatically;
- source management with add/remove and direct **Edit with AI Studio** actions;
- compact campaign form with advanced rules collapsed into a dedicated section;
- editable published-view tracking so campaign feedback can stay current;
- publishing-checklist copy action for hashtags, mentions, CTA and platform rules;
- AI Studio can jump directly back to the active campaign;
- existing View Potential, Campaign Fit, hook variants, compliance checks, Used Moments and submission packs remain active;
- Smart YouTube Authentication from 21.4.1 and the validated seamless updater are preserved.


## 21.4.9

- Projects no longer become permanently undeletable when an ingest or Local AI analysis is interrupted.
- ClipBoost tracks active yt-dlp, FFmpeg and local Python processes per project.
- Deleting a project that is still processing now stops its local child processes first, then removes the project.
- A deletion tombstone prevents a late background task from recreating a deleted project metadata file.
- After an app/server restart, stale `ingesting` / `analyzing` metadata is recovered automatically instead of polling forever.
- Recovered projects show `Needs attention`; if the source file already exists they can be opened and analyzed again, or deleted safely.
- Project polling stops after recovery instead of looping indefinitely.
- All 21.4.7 Campaign setup, Trends removal, YouTube authentication and updater behavior are preserved.

## 21.4.7

Campaign setup is now centered and progressive: only essential fields are shown first, advanced payout/rule fields stay collapsed, and payment inputs adapt to the selected payment model. The unused Trends page has also been removed from navigation and routing.


## 21.4.9 — Eco AI mode

- Optional Eco AI mode releases unused local AI after 2–20 minutes of ClipBoost inactivity.
- Idle cleanup never interrupts an active analysis/export job.
- Fully quitting ClipBoost now stops ClipBoost-owned FFmpeg/Python/yt-dlp workers and unloads the configured Ollama model.
- Closing to tray remains available; Eco mode still activates while the window is hidden.


## 21.5.1 — Campaign Smart Import

- Campaign URL import can now use an authenticated Electron browser session instead of relying only on public HTTP pages.
- Sign in to campaign sites inside the dedicated import window; ClipBoost keeps that browser session persistent without asking for API access.
- After authentication, ClipBoost reads the rendered campaign DOM and follows the campaign requirements link using the same session.
- Smart Import extracts campaign name, provider, per-view payout/rate basis, start date, payment method, account limit, audience, media sources, asset/resource links, requirements, violations and visible campaign stats when the page exposes them.
- Unknown values stay unknown: rate basis is not reused as a minimum-view qualification and missing deadlines are not converted to `0 days`.
- Imported campaigns open in a review step before being saved.
- Campaign Sources separates editable media sources from external asset/reference folders.
- Campaign Rules shows imported requirements, violations/disqualifiers, audience and the original requirements link.
- Imported requirements are included in campaign context, checklists and submission packs.
- Existing public URL import remains available as a browser/dev fallback.


## 21.5.1 Smart Import cross-check
Authenticated campaign import now cross-checks the campaign listing for qualification thresholds, classifies linked asset packs, keeps start-date metadata visible, and stores provider-wide terms once as shared platform rules.
