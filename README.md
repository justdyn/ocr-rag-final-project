# Tensho (OCR-RAG)

Remix 3 BFF + FastAPI app: ingest PDFs/images (Tesseract when needed), hybrid BM25 + MiniLM fused with weighted RRF, cited SSE chat, owner Library.

**Product requirements:** `.docs/prd/prd.md` (as-built vs v1 SPJ). Inventory: `.docs/prd/references/as-built-for-prd.md`. Architecture: `.docs/prd/references/frontend-architecture.md`, `.docs/prd/references/backend-architecture.md`. Features: `.docs/prd/references/feature-inventory.md`. Feature PRDs: `.docs/prd/prds/`. Frontend rules: `.docs/styleguide/styleguide.md`. Plans: `.docs/plan/` (must cite PRD + styleguide).

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
# uvicorn app.tensho:app — see backend/.env.example for LLM_API_KEY and JWT_*
```
