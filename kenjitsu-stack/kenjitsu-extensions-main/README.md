
**kenjitsu-extensions** A lightweight Node.js scraper that extracts video sources from streaming sites.


> **Disclaimer:**
> This package is **unofficial** and has **no affiliation** with  any third-party providers. It does not host, own, or distribute content. All data remains the property of its respective owners.
-----

## Security and runtime behavior

- TLS certificate validation is enabled by default (`ignoreTlsErrors: false`). A caller may explicitly opt in to bypassing validation for one provider instance by passing `{ ignoreTlsErrors: true }`; this weakens transport security and should be limited to a known provider and temporary compatibility need.
- HTTP requests use `impit` with a Chrome-compatible HTTP fingerprint (`browser: 'chrome142'`) and a 15-second timeout by default. `impit` is a native HTTP client binding; it is not a headless browser and does not install browser components. This project's source does not invoke a shell or spawn processes. The platform loader bundled by `impit` may read Linux runtime files and, as a final libc-detection fallback on Linux, run `ldd --version` through `child_process.execSync`; it does not take user-controlled command input. Prebuilt N-API binaries are selected as optional dependencies during package installation.
- The library has no telemetry, analytics, persistent machine identifier, or automatic data upload. Network traffic is initiated only by an explicit provider or metadata method call.
- The library does not write or remove files. It does not log cookies, authorization data, request headers, playback URLs, signed URLs, tokens, responses, or sessions.

## Tests

`pnpm test` runs only offline tests. Existing provider integration checks are marked as live and skipped by default because they contact third-party services.

## AnimePahe

This version does not implement or export an AnimePahe provider. The word `animepahe` remains only in a metadata provider-name union and historical comments; there is no AnimePahe class, request path, extractor, constructor, or public export.
