# Security Report

This document describes the security-relevant design decisions in MeowBTI, as required for hackathon submission.

## 1. API Key Handling

The `GEMINI_API_KEY` is read exclusively server-side, inside the `/api/verdict` Next.js Route Handler (`app/api/verdict/route.ts`). It is:
- Never passed to, embedded in, or accessible from any client-side component or bundle.
- Never logged, echoed back in responses, or exposed in error messages.
- Read via `process.env.GEMINI_API_KEY` at request time, not baked into any `NEXT_PUBLIC_*` variable (which Next.js would expose to the browser).

If the key is missing or invalid, the app degrades gracefully to a deterministic fallback verdict rather than failing or leaking configuration state to the client.

## 2. Input Validation

The `/api/verdict` endpoint validates all incoming request bodies before use:
- Rejects malformed/non-JSON bodies with a `400`.
- Rejects free-text descriptions shorter than 3 characters (prevents empty/meaningless submissions).
- Rejects free-text descriptions longer than 1000 characters (prevents excessively large payloads that would waste API tokens/cost, and reduces the surface for pathological inputs reaching the LLM prompt).

Client-side, `CatIntake.tsx` also validates uploaded files: only image MIME types are accepted, and files are capped at 10MB before being processed, in addition to being resized/re-compressed client-side to a max 600px dimension JPEG - reducing the size and type surface of user-supplied binary data before it's ever stored in app state or sent anywhere.

## 3. Rate Limiting

`/api/verdict` implements a per-IP rate limit (8 requests per 60 seconds) using the `x-forwarded-for` header (first hop only, correctly parsed from the comma-separated proxy chain) as the client identifier. This mitigates casual abuse and accidental request storms (e.g. a buggy client retry loop) from exhausting the Gemini API quota.

**Known limitation:** this rate limiter is in-memory and scoped to a single serverless function instance, so it is not a strict, globally-consistent limit across a horizontally-scaled deployment. It is documented here rather than hidden - a production hardening pass would move this to a shared store such as Redis.

## 4. Upstream Request Hardening

The server-side call to the Gemini API is wrapped in an `AbortController` with an 8-second timeout, preventing a slow or hung upstream request from indefinitely occupying server resources. Every failure mode of the upstream call - non-OK HTTP status, missing response text, unparseable JSON, or timeout - is caught and routed to a deterministic fallback rather than surfacing a raw error or stack trace to the client.

## 5. Output Validation (LLM Response Trust Boundary)

The Gemini API's response is treated as **untrusted input**, not as a trusted internal value, even though it comes from our own configured API key:
- The response is parsed as JSON inside a `try/catch`; any parse failure results in the fallback path being used, not a crash.
- The `type` field returned by the model is validated against the app's closed list of six known personality type IDs (`CAT_TYPE_LIST`) before being used anywhere. An unrecognized or hallucinated type string is rejected and the fallback path is used instead - the app never renders or stores an unvalidated string as if it were a known type.
- The `verdict` text is rendered as plain text content inside React (not via `dangerouslySetInnerHTML` or any raw HTML injection), so React's default JSX escaping applies and prevents any injected markup or script content in the model's output from being rendered as HTML.

## 6. Prompt Injection Surface (Known, Low-Impact)

User-supplied free text is included directly in the prompt sent to Gemini. In principle, a user could attempt to write instructions inside their "cat description" intended to manipulate the model's output (e.g. asking it to ignore prior instructions). Because:
- The model's output is constrained to a strict JSON shape,
- The `type` field is validated against a closed list before use, and
- The `verdict` field is only ever displayed as plain text, never executed or used to control app logic,

the worst-case outcome of a successful prompt injection is a nonsensical or off-tone *verdict sentence* - there is no path from user input to code execution, data exfiltration, unauthorized type selection outside the six valid options, or any state-changing action. This is documented as an accepted, low-severity limitation rather than a gap, given the constrained blast radius.

## 7. No Persistent User Data

The app does not currently store any personally identifiable information server-side. Cat name, photo, and quiz answers exist only in client-side React state for the duration of the session and are sent to the server solely as part of the single `/api/verdict` request body (not logged, not persisted to a database in the current build). No cookies, accounts, or tracking identifiers are used by application code.

## 8. Dependency & Content Safety

- No use of `eval`, `dangerouslySetInnerHTML`, or dynamic script injection anywhere in the codebase.
- Third-party libraries used (`html2canvas`, Next.js, React) are all actively maintained, widely used open-source packages installed via npm with no modifications to their source.
- The project does not execute any user-uploaded content (e.g. the uploaded cat photo is only ever rendered as an `<img>` / canvas source, never parsed, executed, or interpreted as anything other than image bytes).

## 9. Deployment Security Headers (Aikido Scan Follow-Up)

A follow-up scan of the deployed site surfaced three findings related to HTTP response headers, addressed as follows:

- **HSTS header missing (High)** - Fixed. A `Strict-Transport-Security` header (`max-age=63072000; includeSubDomains; preload`) was added via `next.config.ts`'s `headers()` configuration, ensuring browsers only ever connect to the deployed site over HTTPS.
- **Cookie missing HttpOnly flag (High)** - Investigated, not reproducible in application code. This codebase does not set any cookies anywhere in its source (no auth, no sessions, no `document.cookie` usage). Manual inspection via browser DevTools across a full user session - Application → Cookies panel, and Network tab response headers on every request including the main document and the `/api/verdict` call - did not surface any first-party cookie set by this application. This finding likely originates from the hosting/edge platform layer (Vercel) rather than from application code, and is outside this project's direct control to remediate.
- **CSP config allows inline CSS (Low)** - Accepted, deferred. A strict Content Security Policy would require a nonce-based rewrite of how styles are loaded, which risks breaking the app's Tailwind and inline-style-driven UI. Given the low severity and the risk of introducing regressions this close to submission, this was consciously deferred rather than rushed.

## 10. Aikido Security Scan Results

A scan was run via Aikido Security and is included in this submission as `aikido-security-report.pdf`.

**Overall risk score:** 61 (Medium)

**Findings:**
- **`postcss` (CVE-2026-41305)** - a dependency-level XSS vulnerability affecting `postcss` versions prior to 8.5.10, related to unescaped backtick sequences when re-stringifying CSS ASTs. This dependency is pulled in transitively via the build toolchain (Tailwind/Next.js), not used directly in application code.
  - **Assessment:** Aikido's own analysis confirms this dependency is **not used in production** - it's part of the build-time CSS pipeline, not runtime code, so the described XSS path (parsing untrusted, user-submitted CSS) does not apply to this app; MeowBTI never parses or re-stringifies user-supplied CSS at any point.
  - **Status:** Reviewed and remediated. The direct dependency was upgraded from 8.4.31 to 8.5.10.
  - **Follow-up:** after upgrading the project's direct `postcss` dependency, a separate `npm audit` surfaced the same underlying advisory (GHSA-qx2v-qp2m-jg93) via a second, independent copy of `postcss` bundled internally within `next` itself (`node_modules/next/node_modules/postcss`). This copy is maintained by the Next.js project, not by this codebase, and is not resolvable via a direct dependency upgrade here. `npm audit fix --force` offered to resolve it by downgrading `next` to a legacy `9.x` release - an unrelated major-version downgrade that would break the application - so this was intentionally not applied. The same reasoning applies: this is a build-tooling-internal dependency, not a code path that processes user-submitted CSS at runtime, so the practical risk to this deployed application is assessed as negligible. This will be resolved naturally by a future Next.js release that bundles the patched `postcss` version.

No other issues were surfaced by the scan.

## Recommended Future Hardening (Not Implemented - Out of Hackathon Scope)

Documented transparently for completeness:
- Move rate limiting to a shared store (e.g. Redis) for a durable, cross-instance limit.
- Add server-side image re-validation (e.g. magic-byte checking) in addition to the client-side MIME type check, since client-side checks can be bypassed by a modified client.
- Add a nonce-based Content Security Policy header to further reduce any residual injection surface.
- If accounts/persistence are added in the future, ensure photos and cat data are stored with proper access control per user.

---

*The Aikido Security scan report referenced above is attached alongside this document as `aikido-security-report.pdf`.*
