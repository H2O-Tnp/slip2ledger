# Slip2Ledger — Single‑Page Web App (Vanilla JS + Express + MongoDB + Gemini)

## Run
1) Copy env and fill secrets
```
cp backend/.env.example backend/.env
# fill MONGO_URL and GOOGLE_API_KEY
```
2) Install & start
```
npm i
npm run dev
```
Then open http://localhost:3221/

## Features
- SPA, responsive (desktop side summary, mobile bottom summary)
- CRUD: create/read/update/delete entries
- LLM: backend /ai/extract (Gemini 2.0 Flash) parses slip image to fields
- No frontend JS libraries or CDNs; only standard Web APIs
- Backend uses only Express/Mongoose/cors/dotenv as required

## Endpoints
- `GET /entries` — list
- `POST /entries` — create
- `PUT /entries/:id` — update
- `DELETE /entries/:id` — delete
- `POST /ai/extract` — { mime, dataBase64 } → { type, amount, category, note }
