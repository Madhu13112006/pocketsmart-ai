# PocketSmart AI — Project Code

FastAPI application for PocketSmart AI's three budget planners (Home Interior, Party, Jewelry).

## Quick start

```bash
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
cp .env.example .env         # then fill in GOOGLE_API_KEY and SECRET_KEY

uvicorn main:app --reload --port 8000
```

Open http://127.0.0.1:8000. Stop with **Ctrl+C**.

See the repo-root `README.md` and `7.Project Documentation/Project Executable Files.md` for full setup/run details, and `tests/test_app.py` for the automated test suite (`pytest tests/ -v`).
