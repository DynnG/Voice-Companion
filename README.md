# Savi

Savi uses a React/Vite frontend and a FastAPI Python backend.

## Frontend

```sh
cd frontend
npm install
npm run dev
```

The development server uses port 3000. Build with `npm run build`; preview with
`npm run preview`. Frontend source is in `frontend/src`, static assets in
`frontend/public`, and frontend regression scripts in `frontend/test_*`.
Run those scripts with `frontend/` as the working directory.

## Backend

```sh
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Use the existing Python virtual environment if available. For tests, install
`requirements-dev.txt` and run `python -m pytest -p no:cacheprovider` from
`backend/`. Some existing tests exercise live speech models or external services.
The backend implementation and `backend/.env` are unchanged. See
[backend documentation](backend/README.md) and the
[STT deployment policy](backend/STT_DEPLOYMENT.md).

## Deployment and generated files

Root `vercel.json` keeps shared routing and points to `frontend/` (Vite) and
`backend/` (FastAPI, `main:app`). This layout change does not deploy either service.

Root `.gitignore` applies to both applications. Dependencies, build outputs,
Python caches, local models, databases and environment secrets remain ignored.
Root `.cache/` contains existing local diagnostics/tooling and is ignored.
Keep Git metadata at the repository root.
