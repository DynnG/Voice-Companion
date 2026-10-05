# Savi

Savi is an AI-powered voice interview companion designed to simulate job interviews. Users provide a target job title, interact with Savi through voice or text, answer interview questions, receive AI-generated feedback, and review/download their completed interview.

Savi uses a React/Vite frontend and a FastAPI Python backend.

## Features

- Target Job Title input and validation
- Popular job role selection
- AI-generated interview questions
- Voice interaction with Savi
- Text/chat answer input
- Live interview transcript
- AI Notes / answer feedback
- Interview progress/session tracking
- Interview completion screen
- Downloadable Interview Review
- New Interview flow
- Savi speech/audio interaction

## How It Works

1. The user enters or selects a Target Job Title.
2. The application validates the job title.
3. The interview session begins.
4. Savi asks interview questions.
5. The user answers through the available voice or text input.
6. Savi processes the response and continues the interview.
7. AI Notes provide feedback on the user's answer.
8. The interview reaches the completion state.
9. The user can download the Interview Review.
10. The Interview Complete screen remains visible until the user closes it.
11. Clicking the X on the completion screen starts the existing New Interview/reset flow and returns the user to the Target Job Title setup screen.

## Project Structure

- `frontend/`: React application built with Vite and TypeScript. Contains UI components, state management, and service calls.
- `backend/`: Python application built with FastAPI. Handles API endpoints, state, external AI integration, Speech-to-Text (STT), and Text-to-Speech (TTS).

## External Services

- **Gemini (Google AI):** Used to generate interview questions, process candidate answers, and provide AI feedback notes.

## Requirements

- Node.js
- npm
- Python
- Gemini API key

## Environment Variables

The backend requires environment variables to interface with external services. Create a `.env` file in the `backend/` directory.

```env
GEMINI_API_KEY=your_api_key_here
```
> **IMPORTANT:** Never expose a real API key. API keys and secrets must not be committed to Git.

## Installation and Setup

To run Savi locally, you will need to run the frontend and backend in separate terminal windows.

### Frontend

```sh
cd frontend
npm install
npm run dev
```

The development server uses port 3000. Build with `npm run build`; preview with `npm run preview`. Frontend source is in `frontend/src`, static assets in `frontend/public`, and frontend regression scripts in `frontend/test_*`. Run those scripts with `frontend/` as the working directory.

### Backend

```sh
cd backend
python -m pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Use the existing Python virtual environment if available. 

## Development / Testing

For tests, install `requirements-dev.txt` and run `python -m pytest -p no:cacheprovider` from `backend/`. Some existing tests exercise live speech models or external services. The backend implementation and `backend/.env` are unchanged.

To verify frontend TypeScript types, you can run:
```sh
cd frontend
npm run typecheck
```

## Interview Review

At the end of an interview (or when triggered manually), the application generates an Interview Review. This includes:
- Interview questions
- User answers
- AI Notes/feedback
- Session information
- Downloadable review

After the interview is completed, the Interview Complete screen remains open until the user explicitly closes it with the X button. Closing it returns the user to the Target Job Title setup for a new interview.

## Target Job Title

Before starting, the user provides a target job title:
- Users can type a custom job title.
- Popular roles are available as shortcuts.
- Unsupported numbers and special characters are removed from typed input.
- Job-title validation is performed before starting the interview.
- Job-title capitalization is normalized appropriately when the interview begins.

## Troubleshooting

- **Missing Gemini API key:** Ensure `GEMINI_API_KEY` is correctly set in `backend/.env`.
- **Backend not running:** Ensure the FastAPI server is running on port 8000.
- **Frontend unable to communicate with backend:** Check that both servers are running concurrently in separate terminals.
- **Python virtual environment not activated:** Ensure your local environment is active before running `pip install` or `uvicorn`.
- **Frontend dependencies not installed:** Run `npm install` in the `frontend/` directory.

## Deployment and generated files

Root `vercel.json` keeps shared routing and points to `frontend/` (Vite) and `backend/` (FastAPI, `main:app`). This layout change does not deploy either service.

Root `.gitignore` applies to both applications. Dependencies, build outputs, Python caches, local models, databases and environment secrets remain ignored. Root `.cache/` contains existing local diagnostics/tooling and is ignored. Keep Git metadata at the repository root.

## Contribution / Git Workflow

1. Create a feature branch.
2. Make the change.
3. Test locally.
4. Run the appropriate checks.
5. Commit.
6. Push the branch.
7. Open a Pull Request.

## Documentation References

See [backend documentation](backend/README.md) and the [STT deployment policy](backend/STT_DEPLOYMENT.md).
