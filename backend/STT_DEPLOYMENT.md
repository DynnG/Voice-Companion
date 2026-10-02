# STT storage investigation and deployment policy

## Download path and model identity

Previously `main.lifespan` called `STTService.get_instance().load_model()`.
`WhisperModel(model_size_or_path=MODEL_SIZE, compute_type="int8", download_root=.../huggingface/hub)`
calls faster-whisper's `download_model`, which calls HF `snapshot_download`.
The downloaded patterns are `config.json`, `preprocessor_config.json` (if present),
`model.bin`, `tokenizer.json`, and `vocabulary.*`. It does not download the entire
OpenAI PyTorch repository. INT8 here is an inference setting, not a request for
smaller on-disk weights.

| Selection | Exact repository | Weights | Final selected files, approximately |
| --- | --- | --- | --- |
| Vercel default `base` | `Systran/faster-whisper-base` | 145 MB | 148 MB (141 MiB) |
| Local default / current backend `.env` `small` | `Systran/faster-whisper-small` | 484 MB | 486 MB (464 MiB) |

Sizes are decimal MB from HF listings inspected on 2026-10-02; tokenizer is
2.2 MB and vocabulary 460 kB. `WHISPER_MODEL_SIZE` overrides the platform default;
config loads backend/root dotenv with `override=True`. Therefore a bundled dotenv
can also select `small` on Vercel. The supplied error does not contain a model ID;
we have not inspected deployed environment variables, startup model log, or disk
metrics, so the exact deployed selection cannot be proven from this error alone.
Do not report `base` as confirmed production selection without checking that log.

Sources: [base files](https://huggingface.co/Systran/faster-whisper-base/tree/main),
[small files](https://huggingface.co/Systran/faster-whisper-small/tree/main),
[faster-whisper download implementation](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/utils.py).

## All relevant cache / scratch locations

`runtime_storage` configures these before importing speech libraries:

| Variable / purpose | Vercel path |
| --- | --- |
| `TMPDIR`, Python `tempfile.tempdir`; multipart spools and audio fallback files | `/tmp/savi-transcription` |
| `HF_HOME`; token/config root | `/tmp/savi-transcription/huggingface` |
| `HF_HUB_CACHE`, `HUGGINGFACE_HUB_CACHE`, `TRANSFORMERS_CACHE`, explicit Whisper `download_root` | `/tmp/savi-transcription/huggingface/hub` |
| Hub repository blobs, partial downloads, revisions, snapshots | `hub/models--Systran--faster-whisper-{base,small}/{blobs,refs,snapshots}`; `blobs/*.incomplete` (version-dependent unique suffixes) |
| Hub download locks | `hub/.locks/models--Systran--faster-whisper-{base,small}` |
| `HF_XET_CACHE`; Xet logs and per-CAS environment cache | `/tmp/savi-transcription/huggingface/xet`; `logs/`, environment-specific `chunk_cache`, `shard_cache`/`shard-cache`, `staging` depending on hf-xet version |
| HF downstream assets default (not used by this preload) | `/tmp/savi-transcription/huggingface/assets`; explicit `HF_ASSETS_CACHE` can override |
| `XDG_CACHE_HOME` generic downstream cache | `/tmp/savi-transcription/cache` |
| Legacy `WHISPER_CACHE_DIR` config directory (created, but not passed to Whisper) | `/tmp/savi-transcription/whisper_models`, unless overridden |

There is no separate STT `local_dir` copy in the current call. Linux snapshots
normally symlink to blobs; symlinks do not duplicate weights. The incomplete
reconstructed file becomes the final blob through a same-volume move, so it is
incorrect to universally assume two complete weight files during reconstruction.
Older Xet clients can cache chunks in addition to reconstructed bytes; current
HF documentation says recent clients no longer use the download chunk cache.
Shard/staging caches primarily serve uploads and their configured GB limits are
not preallocated download requirements. Reconstruction buffers can be in RAM;
a configured 512 MB buffer is not proof of 512 MB extra disk usage.

The repository sets `HF_HUB_DISABLE_XET=1` and disables hf_transfer before imports.
The reported Xet reconstruction error therefore suggests an older deployment,
different dependency/import ordering, or different effective configuration.
Those settings are read at HF import time. Requirements have no HF/Xet upper pins,
so deployed behavior can differ from local faster-whisper 1.2.1 / Hub 1.33.0.
Disabling Xet does not make a large model fit.

Sources: [HF cache layout](https://huggingface.co/docs/huggingface_hub/guides/manage-cache),
[HF environment variables and import timing](https://huggingface.co/docs/huggingface_hub/package_reference/environment_variables).

## Peak disk budget and failure

For an empty Linux Hub cache with same-volume moves and no download chunk cache,
STT alone needs roughly its final size (148 MB base / 486 MB small), plus small
metadata/log overhead. With an additional model-sized chunk cache or retained
partial/copy, an illustrative budget is about 293 MB base / 970 MB small, plus
overhead. These are scenarios, not measured peaks or guaranteed upper bounds.
Concurrent downloads, old revisions and failed attempts can increase usage further.

Vercel staff document a 512 MB `/tmp` limit; that space is shared by all application
scratch files. `small` leaves only about 26 MB if using decimal 512 MB (about
51 MB if the actual quota is 512 MiB), before Kokoro, uploads and reconstruction
overhead. Kokoro's existing `/tmp/savi-kokoro` model/voices and partial downloads
share that same filesystem, although they are not HF STT cache directories.
Changing subdirectories cannot increase the quota.

The error proves reconstruction could not allocate disk blocks. It does not prove
which cache consumed them. `small` plus cache/scratch overhead is unsuitable;
`base` alone can fit, so a `base` failure requires additional disk consumers or
different actual limits. Exact production peak needs deployed `df`, per-directory
usage, dependency versions and effective model/cache config. No deployment was
accessed or model downloaded as part of this fix.

Source: [Vercel staff storage-limit answer](https://community.vercel.com/t/how-do-install-dependencies-in-the-tmp-directory/1849).

## Architecture and operations

Vercel always skips startup STT preload, even with `STT_PRELOAD=true`. Request-time
local model initialization is also prohibited, preventing the same cold-start
download from merely moving to the first request. Local development continues to
use faster-whisper; `STT_PRELOAD=false` optionally makes local initialization lazy.
Local preload exceptions are caught and cannot prevent the API lifespan from
yielding. The existing TTS and database initialization code is unchanged.

Lazy loading `small` on Vercel is not a realistic fix. `base` is physically smaller
and might be viable in an isolated, measured runtime, but there is no verified
shared storage/memory budget here and ephemeral caches are not durable between
instances. This deployment deliberately does not enable lazy local STT on Vercel.
Dedicated inference hosting with persistent model storage is recommended.

Set `STT_SERVICE_URL` to the full `/transcribe` URL of a dedicated non-Vercel
backend implementing the existing STT JSON contract. This adapter sends multipart
audio with language/beam overrides and `generate_ai_response=false`; the public
API continues to perform Gemini processing and persistence itself. The dedicated
response must include text/transcription/raw_text, language/probability, duration,
processing/inference times, timings, model, segments, words and hesitation_evidence.
Deploy the existing backend on a host with persistent model storage or implement
that contract in a managed inference wrapper. Keep the endpoint distinct from
the public Vercel API to avoid proxy loops. Protect it with an authenticated
gateway; `STT_SERVICE_TOKEN` supplies a Bearer header (the existing backend itself
does not validate that token). Use HTTPS in production. No credentials are logged.

External timeout, HTTP failure or incomplete response returns HTTP 503 without
falling back to a local download. Missing external configuration on Vercel also
returns an actionable 503 for transcription; other APIs still start and respond.
STT remains implemented locally and through the adapter, but production
transcription requires configuring/deploying the dedicated service. The adapter
was tested with mocks; no real remote inference endpoint was available.
Public route/form fields and successful transcription JSON remain unchanged.
UI, microphone, Kokoro and SQLite code were not modified.

## Unauthenticated HF warning

Public repositories allow anonymous downloads, which explains the warning.
Add a read-scoped `HF_TOKEN` in Vercel environment variables for any remaining
authenticated HF Hub requests and redeploy; set it on the dedicated model host
as well. HF reads the environment before imports. Authentication can affect access
and rate limits; it does not reduce weight sizes, expand `/tmp`, or solve errno 28.
`HF_TOKEN` and the dedicated endpoint's `STT_SERVICE_TOKEN` are separate credentials.
