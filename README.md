# PlaceAI — Full Stack AI Placement Coach

PlaceAI is an AI-powered placement preparation platform. It simulates a 4-round recruitment process customized to specific tech companies (TCS, Infosys, Wipro, Accenture, Google, Amazon, or General) and the candidate's actual resume.

## Key Features

1. **Company Mode Tailoring**: Select from TCS, Infosys, Wipro, Accenture, Google, Amazon, or General. The system adjusts interview question difficulty and aptitude MCQs to match each company's target competencies.
2. **Client-Side PDF Parsing**: Client-side text extraction using `pdfjs-dist` to avoid heavy binary uploads. Gemini AI automatically parses structure (skills, education, projects, employment gaps).
3. **Round 1 — Aptitude Filter**: 20 MCQs generated via Gemini based on candidate skills (logical, quantitative, verbal, and technical). Tracks retries with a passing threshold of 60% (12/20).
4. **Round 2 — HR Live Introduction**: Interactive voice round with camera simulation. Web Speech API synthesis reads the questions out loud, and Speech Recognition captures transcription in real-time. Silence detection (>4s) triggers voice Recruiter ARIA to nudge the user.
5. **Round 3 — Technical Deep-Dive**: 9 questions split between resume deep-dives (tech choices, projects), deep core technical concepts, and company-specific design or scenario questions.
6. **Round 4 — Interactive Evaluation Report**: Comprehensive performance feedback.
   - Counting-up score animation ring.
   - Category breakdowns using Recharts.
   - Pacing metrics, filler word counts ("umm", "like", "basically"), silence counts.
   - Download report as print-friendly PDF via `jsPDF`.
   - Direct prefilled sharing to LinkedIn.

---

## Prerequisites

- **Node.js**: `v18.0.0` or higher
- **Python**: `v3.10.0` or higher (with `pip`)
- **Database**: Free tier Supabase account
- **AI Brain**: Google AI Studio API key (free tier)

---

## Step-by-Step Setup

### 1. Database Setup (Supabase)
1. Go to [Supabase Dashboard](https://supabase.com) and create a new project.
2. Open the **SQL Editor** in the left sidebar.
3. Paste the contents of `backend/supabase_migration.sql` into the editor and click **Run**.

### 2. Backend Setup
1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the `backend/` directory and populate it with your credentials:
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_KEY=your_supabase_anon_key
   ```
   *Note: Obtain your free Gemini API key from [Google AI Studio](https://aistudio.google.com/).*

### 3. Frontend Setup
1. Open a new terminal and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Install Node dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file in the `frontend/` directory:
   ```env
   VITE_API_URL=http://localhost:8080
   ```

---

## Running Locally

To start the application, run these two commands in separate terminals:

### Start Backend:
```bash
cd backend
uvicorn main:app --reload --port 8080 --timeout-keep-alive 120
```

### Start Frontend:
```bash
cd frontend
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser. (Chrome or Edge are recommended for Web Speech API compatibility).

---

## Deployment Guide

### Backend (Render.com Free Tier)
1. Push your backend code to GitHub.
2. On Render, create a new **Web Service** connected to your repository.
3. Set the **Build Command** to:
   ```bash
   pip install -r requirements.txt
   ```
4. Set the **Start Command** to:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
5. In **Environment Variables**, add:
   - `GEMINI_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_KEY`

### Frontend (Vercel Free Tier)
1. Push your frontend code to GitHub.
2. In Vercel, import your repository.
3. Set the **Framework Preset** to `Vite`.
4. In **Environment Variables**, add:
   - `VITE_API_URL` (set to your deployed Render URL, e.g. `https://your-backend.onrender.com`)
5. Deploy.
