# next build clobbers a running dev server's .next

Running `npx next build` for a typecheck while `next dev` is serving from the
same directory corrupts the dev server's `.next` state — every page then dies
with `Error: Cannot find module './510.js'` (webpack-runtime chunk mismatch).

**Why it mattered:** mid-Phase-G the preview browser suddenly showed a Next.js
Server Error on every route right after a successful `next build`, which looks
exactly like a code regression but isn't.

**Fix/avoid:** stop the dev server, `Remove-Item -Recurse -Force .next`,
restart. Better: don't run production builds while the dev server is up — or
rely on the dev server's own compile + `tsc --noEmit` for type checking.

Related: react-refresh HMR also emits scary `Cannot update a component
(HotReload) while rendering ImageCard` console errors after live-editing a
mounted component — those are dev artifacts too; verify with a clean reload
before chasing them.
