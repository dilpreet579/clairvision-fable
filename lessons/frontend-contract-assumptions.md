# Frontend mock assumed API contracts the backend must honor or renegotiate

> The agent-built frontend invented a pagination envelope — `{items, page, page_size, total}` for `GET /events/{id}/images` — because no backend schema existed yet.

**Type**: project note (cross-component contract)

**Why it mattered**: building the frontend in parallel (against mocks) was a big
time win, but every gap in the shared schemas got filled by the frontend's guess.
Documented guesses are fine; *undocumented* ones become silent integration failures
in Phase 5.

**How to apply**: when implementing the FastAPI gallery endpoint, either match the
envelope in `frontend/lib/types.ts` exactly or change both sides in the same commit.
Grep `frontend/lib/types.ts` and `frontend/lib/api-client.ts` for other assumptions
before finalizing any endpoint (thumbnail URL shape, error body with FastAPI
`detail`, search result fields). Delete this lesson once Phase 5 reconciles the
contracts.
