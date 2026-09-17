# DocIntel (OCR-RAG)

Remix 3 BFF + FastAPI app: ingest PDFs/images (Tesseract when needed), hybrid BM25 + MiniLM fused with weighted RRF, cited SSE chat, owner Library.

**Product requirements:** `.docs/prd.md` (as-built vs v1 SPJ). Inventory: `.docs/as-built-for-prd.md`. Frontend rules: `.docs/styleguide.md`.

This is not a generic Remix starter. Backend lives in `backend/`. There is no Ollama path and no required Docker Compose in v1.

## Layout

- `app/actions/<route>/controller.tsx` — routes
- `app/ui/` — shared UI (`chat-shell-*`, library)
- `app/routes.ts` — URL contract
- `backend/app/` — FastAPI

## Commands

```sh
# Frontend (repo root; Node from .nvmrc via fnm)
npm i
npm run dev
npm test
npm run typecheck

# Backend (backend/; Python 3.12.9, project venv)
# uvicorn app.main:app — see backend/.env.example for LLM_API_KEY and JWT_*
```
