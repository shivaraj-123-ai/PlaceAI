-- Sessions table
CREATE TABLE IF NOT EXISTS placeai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_mode TEXT NOT NULL DEFAULT 'General',
  candidate_name TEXT,
  resume_text TEXT,
  resume_data JSONB,
  aptitude_questions JSONB,
  aptitude_result JSONB,
  aptitude_retry_count INTEGER DEFAULT 0,
  interview_questions_round2 JSONB,
  interview_questions_round3 JSONB,
  feedback_report JSONB,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Per-answer evaluations
CREATE TABLE IF NOT EXISTS placeai_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES placeai_sessions(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  question_index INTEGER NOT NULL,
  question_text TEXT,
  answer_text TEXT,
  filler_words JSONB,
  silence_gaps INTEGER DEFAULT 0,
  answer_length_category TEXT,
  ai_score INTEGER,
  ai_feedback TEXT,
  expression_analysis JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- In case table already exists, add the column manually:
-- ALTER TABLE placeai_answers ADD COLUMN IF NOT EXISTS expression_analysis JSONB;

-- Question Bank table
CREATE TABLE IF NOT EXISTS placeai_question_bank (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES placeai_sessions(id) ON DELETE CASCADE,
  company_mode TEXT NOT NULL,
  category TEXT NOT NULL, 
  question TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer TEXT NOT NULL,
  explanation TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Disable Row Level Security (RLS) to allow anonymous read/write access
ALTER TABLE placeai_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE placeai_answers DISABLE ROW LEVEL SECURITY;
ALTER TABLE placeai_question_bank DISABLE ROW LEVEL SECURITY;
