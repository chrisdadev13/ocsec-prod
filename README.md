# Platanus Build Night ft. Anthropic

## 2026 - Caracas, Venezuela

---

This is the code repository for chrisdadev13 at Platanus Build Night 26, in Caracas.

* Full name: Chris Pacheco
* Github username: chrisdadev13

Remember you should push the code before the deadline and make sure its deployed.

Good luck 🍌🚀

## Vercel Workflows

The app now uses Vercel Workflows to orchestrate scan lifecycle updates.

1. Install dependencies with `pnpm install`.
2. Run the app locally with `pnpm dev`.
3. Start a scan from the repo picker. The workflow-backed API route creates the scan and advances it through its states asynchronously.

Implementation notes:

1. `next.config.mjs` is wrapped with `withWorkflow()`.
2. `app/api/scans/route.ts` starts the workflow with `start()` after creating the scan row.
3. `workflows/scan.ts` owns the durable orchestration for the scan lifecycle.
