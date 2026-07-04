# Frontend mock assumed API contracts the backend must honor or renegotiate

> The agent-built frontend invented a pagination envelope — `{items, page, page_size, total}` for `GET /events/{id}/images` — because no backend schema existed yet.

**Type**: project note (cross-component contract)

**Why it mattered**: building the frontend in parallel (against mocks) was a big
time win, but every gap in the shared schemas got filled by the frontend's guess.
Documented guesses are fine; *undocumented* ones become silent integration failures
in Phase 5.

**How to apply**: match the envelope in `frontend/lib/types.ts` exactly or change
both sides in the same commit. Grep `frontend/lib/types.ts` and
`frontend/lib/api-client.ts` for assumptions before finalizing any endpoint.

**Status**: Phase 5 reconciled the gallery/image contracts — `ImagePage
{items, page, page_size, total}` is now a shared schema
(`shared/clairvision_shared/schemas/image.py`) implemented by
`GET /events/{id}/images`, and thumbnail/full URL shapes + FastAPI `detail` error
bodies match. Remaining unreconciled: search result fields (Phase 7). Delete this
lesson after Phase 7.
