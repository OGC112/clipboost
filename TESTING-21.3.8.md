# ClipBoost 21.3.8 — Fast Local AI Pipeline

## Goal

Reduce the time spent in **Analyzing with Local AI → transcription** on long Library videos without lowering transcription or render quality.

## Test

1. Open ClipBoost and go to **Settings → Local AI**.
2. Set **Workers** to **Auto (recommended)** and save.
3. In Library, choose a YouTube/Twitch video around 45–90 minutes long and click **Edit with AI Studio**.
4. During analysis verify that the status can show **preparing audio once**, **mapping speech**, **loading Whisper**, then `X/Y chunks · N workers · Z% transcript`.
5. Confirm the overall percentage is labeled `overall`, so `0/Y chunks` is no longer presented as if 42% of the transcript were complete.
6. Let analysis finish. Confirm captions, candidate clips, previews and exports behave as before.
7. Re-open/re-analyze the same project when possible and verify cached chunks are reused.

## Expected performance behavior

- The source video is decoded to analysis audio once instead of once per chunk.
- Chunk slicing from the PCM master is lightweight and does not re-decode the video.
- One faster-whisper model instance serves concurrent worker threads.
- No smaller Whisper model, lower beam size, disabled word timestamps or reduced render quality is used.

## Storage

The prepared analysis audio and chunk cache are stored under:

`<uploads>/.clipboost-cache/transcripts/<project-id>/...`

When `uploads` is redirected/junctioned to D:, these heavy analysis files follow it. Deleting a project removes its v21.3.8 cache.
