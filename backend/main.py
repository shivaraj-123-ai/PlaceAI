import os
import json
import logging
import asyncio
from typing import Dict, List, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from supabase import create_client, Client
import google.generativeai as genai

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load env variables
load_dotenv()

app = FastAPI(title="PlaceAI Backend", version="1.0.0")

# CORS middleware to allow requests from all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import uuid
import datetime

# Mock Supabase Table Chain Emulation
class MockTable:
    def __init__(self, table_name, db):
        self.table_name = table_name
        self.db = db
        self.filters = []
        self.update_data = None
        self.insert_data = None
        self.select_columns = "*"
        self.is_delete = False

    def select(self, columns="*"):
        self.select_columns = columns
        return self

    def insert(self, data):
        self.insert_data = data
        return self

    def update(self, data):
        self.update_data = data
        return self

    def delete(self):
        self.is_delete = True
        return self

    def eq(self, column, value):
        self.filters.append((column, value))
        return self

    def execute(self):
        class MockResult:
            def __init__(self, data):
                self.data = data

        if self.insert_data is not None:
            if isinstance(self.insert_data, list):
                inserted_rows = []
                for item in self.insert_data:
                    row = dict(item)
                    row["id"] = str(uuid.uuid4())
                    row["created_at"] = datetime.datetime.now().isoformat()
                    row["updated_at"] = datetime.datetime.now().isoformat()
                    self.db[self.table_name][row["id"]] = row
                    inserted_rows.append(row)
                return MockResult(inserted_rows)
            else:
                row = dict(self.insert_data)
                row["id"] = str(uuid.uuid4())
                row["created_at"] = datetime.datetime.now().isoformat()
                row["updated_at"] = datetime.datetime.now().isoformat()
                if self.table_name == "placeai_sessions":
                    row.setdefault("aptitude_retry_count", 0)
                    row.setdefault("retry_count", 0)
                self.db[self.table_name][row["id"]] = row
                return MockResult([row])

        if self.update_data is not None:
            matching_rows = []
            for r_id, row in self.db[self.table_name].items():
                match = True
                for col, val in self.filters:
                    if row.get(col) != val:
                        match = False
                        break
                if match:
                    for k, v in self.update_data.items():
                        row[k] = v
                    row["updated_at"] = datetime.datetime.now().isoformat()
                    matching_rows.append(row)
            return MockResult(matching_rows)

        if self.is_delete:
            to_delete = []
            for r_id, row in self.db[self.table_name].items():
                match = True
                for col, val in self.filters:
                    if row.get(col) != val:
                        match = False
                        break
                if match:
                    to_delete.append(r_id)
            deleted_rows = []
            for r_id in to_delete:
                deleted_rows.append(self.db[self.table_name].pop(r_id))
            return MockResult(deleted_rows)

        # Select
        matching_rows = []
        for r_id, row in self.db[self.table_name].items():
            match = True
            for col, val in self.filters:
                if row.get(col) != val:
                    match = False
                    break
            if match:
                matching_rows.append(row)
        return MockResult(matching_rows)

class MockSupabase:
    def __init__(self):
        self.db = {
            "placeai_sessions": {},
            "placeai_answers": {},
            "placeai_question_bank": {}
        }
    def table(self, name):
        return MockTable(name, self.db)

# Initialize Supabase
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
use_mock_supabase = False

if not SUPABASE_URL or not SUPABASE_KEY or "your_supabase" in SUPABASE_URL or "your_supabase" in SUPABASE_KEY:
    logger.warning("Supabase URL or Key is missing/placeholder from environment variables. Using Mock Supabase.")
    use_mock_supabase = True
    supabase = MockSupabase()
else:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        logger.error(f"Error initializing Supabase client: {e}. Falling back to Mock Supabase.")
        use_mock_supabase = True
        supabase = MockSupabase()

# Initialize Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
print("Gemini Key loaded:", bool(GEMINI_API_KEY))
use_mock_gemini = False
gemini_model_name = "gemini-3.5-flash"

if not GEMINI_API_KEY or "your_gemini" in GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY is missing/placeholder from environment variables. Using Mock Gemini.")
    use_mock_gemini = True
else:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        logger.info(f"Using Gemini model: {gemini_model_name}")
    except Exception as e:
        logger.error(f"Error configuring Gemini: {e}. Falling back to Mock Gemini.")
        use_mock_gemini = True

# Mock Gemini Response Generator
def mock_gemini_response(prompt: str) -> dict:
    prompt_lower = prompt.lower()
    
    # Evaluate Answer (Check this first to avoid conflicts with question text)
    if "evaluate the candidate's spoken response" in prompt_lower or "interview/answer" in prompt_lower:
        return {
            "ai_score": 85,
            "ai_feedback": "Excellent response. You clearly articulated your experience and structured your thoughts well.",
            "answer_length_category": "good"
        }
        
    # Synthesize Feedback Report (Check this early to avoid conflicts)
    if "synthesize the candidate's performance across all rounds" in prompt_lower or "placement coach" in prompt_lower or "feedback_report" in prompt_lower:
        import re
        candidate_name = "User"
        name_match = re.search(r"Candidate Name:\s*([^\n]+)", prompt)
        if name_match:
            candidate_name = name_match.group(1).strip()
            
        company_mode = "General"
        company_match = re.search(r"Company Mode:\s*([^\n]+)", prompt)
        if company_match:
            company_mode = company_match.group(1).strip()

        def extract_json_by_prefix(prefix, is_list=False):
            idx = prompt.find(prefix)
            if idx == -1:
                return [] if is_list else {}
            
            start_char = "[" if is_list else "{"
            end_char = "]" if is_list else "}"
            
            json_start = prompt.find(start_char, idx + len(prefix))
            if json_start == -1:
                return [] if is_list else {}
                
            depth = 0
            json_end = -1
            for i in range(json_start, len(prompt)):
                if prompt[i] == start_char:
                    depth += 1
                elif prompt[i] == end_char:
                    depth -= 1
                    if depth == 0:
                        json_end = i + 1
                        break
            if json_end != -1:
                try:
                    return json.loads(prompt[json_start:json_end])
                except Exception:
                    pass
            return [] if is_list else {}

        aptitude_result = extract_json_by_prefix("Round 1 (Aptitude) Result:", is_list=False)
        answers_data = extract_json_by_prefix("Rounds 2 & 3 Answers & Evaluations:", is_list=True)
        resume_data = extract_json_by_prefix("Resume Data:", is_list=False)

        # 1. Aptitude score (out of 100)
        apt_score = 75
        if aptitude_result:
            score = aptitude_result.get("score")
            total = aptitude_result.get("total_questions")
            if score is not None and total:
                apt_score = round((score / total) * 100)

        # 2. Communication and Technical scores
        round2_scores = [ans.get("ai_score", 70) for ans in answers_data if ans.get("round") == 2]
        round3_scores = [ans.get("ai_score", 70) for ans in answers_data if ans.get("round") == 3]

        comm_score = round(sum(round2_scores) / len(round2_scores)) if round2_scores else 75
        tech_score = round(sum(round3_scores) / len(round3_scores)) if round3_scores else 75

        # Sum filler words and silence gaps
        filler_words = {"umm": 0, "like": 0, "basically": 0, "you_know": 0, "so": 0}
        total_silence_gaps = 0
        for ans in answers_data:
            total_silence_gaps += ans.get("silence_gaps", 0)
            fw = ans.get("filler_words") or {}
            for k in filler_words.keys():
                filler_words[k] += fw.get(k, 0)
                if k == "you_know":
                    filler_words[k] += fw.get("you know", 0)

        # Confidence Score based on filler words and silence gaps
        total_fillers = sum(filler_words.values())
        confidence_deduction = (total_fillers * 2) + (total_silence_gaps * 3)
        confidence_score = max(50, min(100, 95 - confidence_deduction))

        # Structure Score
        lengths = []
        for ans in answers_data:
            text = ans.get("answer_text", "")
            lengths.append(len(text.split()))
        avg_len = sum(lengths) / len(lengths) if lengths else 40

        structure_score = 75
        if avg_len >= 50:
            structure_score = 90
        elif avg_len >= 25:
            structure_score = 80
        else:
            structure_score = 65

        # Resume Alignment
        resume_alignment = 80
        skills = resume_data.get("skills", [])
        if len(skills) > 4:
            resume_alignment = 88
        elif len(skills) > 2:
            resume_alignment = 82

        # Overall Score
        overall_score = round(
            0.20 * apt_score +
            0.30 * comm_score +
            0.30 * tech_score +
            0.10 * confidence_score +
            0.10 * structure_score
        )

        grade = "Needs Work"
        if overall_score >= 85:
            grade = "Excellent"
        elif overall_score >= 70:
            grade = "Good"
        elif overall_score >= 55:
            grade = "Average"

        where_got_stuck = []
        for ans in answers_data:
            sg = ans.get("silence_gaps", 0)
            if sg > 0:
                where_got_stuck.append({
                    "question_text": ans.get("question_text", ""),
                    "pause_seconds": sg * 3,
                    "suggestion": "Keep your responses concise and practice talking through your thought process out loud to avoid pauses."
                })
        where_got_stuck = where_got_stuck[:2]

        best_ans = None
        if answers_data:
            best_ans = max(answers_data, key=lambda x: x.get("ai_score", 0))

        if best_ans:
            best_moment = {
                "question_text": best_ans.get("question_text", ""),
                "score": best_ans.get("ai_score", 80),
                "reason": best_ans.get("ai_feedback", "You structured this answer logically and demonstrated solid understanding.")
            }
        else:
            best_moment = {
                "question_text": "Could you walk me through the tech stack of your E-Commerce Platform project?",
                "score": 82,
                "reason": "You provided a clear layout of components and database structures."
            }

        weak_ans = None
        if answers_data:
            weak_ans = min(answers_data, key=lambda x: x.get("ai_score", 100))

        if weak_ans and weak_ans != best_ans:
            needs_improvement = {
                "question_text": weak_ans.get("question_text", ""),
                "missing": "Depth and structure. The answer was somewhat high-level without enough concrete technical details or architectural context.",
                "how_to_improve": f"Try elaborating more on {weak_ans.get('question_text')}. Explain your choices, trade-offs, and structure the answer using the STAR method (Situation, Task, Action, Result)."
            }
        else:
            needs_improvement = {
                "question_text": "What are indexes in SQL, and how do they optimize query performance?",
                "missing": "Explanation of index data structures (B-Trees) and write/insert overhead.",
                "how_to_improve": "Specifically state that indexes speed up read query times but introduce write overhead on INSERT/UPDATE statements since index tables must be updated."
            }

        speaking_pace = "Good"
        if avg_len > 80:
            speaking_pace = "Too Fast"
        elif avg_len < 15:
            speaking_pace = "Too Slow"

        action_items = []
        if tech_score < 75:
            action_items.append("Revise core technical topics and write out architectural outlines for your projects.")
        else:
            action_items.append("Practice advanced system design concepts like database scaling and caching.")

        if comm_score < 75 or total_fillers > 5:
            action_items.append("Practice speaking in front of a mirror or recording yourself to reduce filler word usage.")
        else:
            action_items.append("Refine your STAR methodology framework when answering behavioral questions.")

        action_items.append("Conduct a mock peer interview focused specifically on resume projects and system design trade-offs.")

        study_recs = "Focus on data structures and system design. Spend 30 minutes daily practice answering questions out loud to build fluency and reduce silence gaps."
        if tech_score < comm_score:
            study_recs = "Spend the first 4 days deep-diving into database indexing, ACID properties, and API architecture. Follow up by practicing speaking pace."
        elif comm_score < tech_score:
            study_recs = "Focus extensively on communication pacing and structure. Record your answers, count your filler words, and practice speaking cleanly without 'umm' or 'like'."

        return {
            "overall_score": overall_score,
            "grade": grade,
            "breakdown": {
                "aptitude": apt_score,
                "communication": comm_score,
                "technical": tech_score,
                "confidence": confidence_score,
                "structure": structure_score,
                "resume_alignment": resume_alignment
            },
            "where_you_got_stuck": where_got_stuck,
            "best_moment": best_moment,
            "needs_improvement": needs_improvement,
            "speech_analysis": {
                "filler_words": filler_words,
                "speaking_pace": speaking_pace,
                "clarity_score": 85 if total_fillers < 10 else 72,
                "silence_gaps_count": total_silence_gaps
            },
            "top_3_action_items": action_items[:3],
            "study_plan": {
                "recommendations": study_recs,
                "estimated_time": "1 week of daily 30-minute practice"
            }
        }

    # 1. Parse Resume
    if "parse the following candidate resume text" in prompt_lower or "expert resume parsing ai" in prompt_lower:
        # Extract name dynamically from the resume text in the prompt
        resume_text_marker = "resume text:\n"
        idx = prompt_lower.find(resume_text_marker)
        candidate_name = ""
        if idx != -1:
            actual_resume_text = prompt[idx + len(resume_text_marker):].strip()
            # Let's take the first line as candidate name if it exists and looks like a name
            lines = [l.strip() for l in actual_resume_text.split('\n') if l.strip()]
            if lines:
                first_line = lines[0]
                # A candidate name is usually 1-4 words and doesn't contain common resume headings
                words = first_line.split()
                if len(words) >= 1 and len(words) <= 4 and not any(k in first_line.lower() for k in ["resume", "curriculum", "cv", "profile", "summary", "page", "contact"]):
                    candidate_name = "".join(c for c in first_line if c.isalnum() or c.isspace()).strip()
        
        return {
            "candidate_name": candidate_name,
            "skills": ["JavaScript", "React", "Node.js", "Python", "SQL", "HTML/CSS"],
            "projects": [
                {
                    "title": "E-Commerce Platform",
                    "description": "Built a scalable e-commerce site with React and Node.js.",
                    "tech_stack": ["React", "Node.js", "Express", "SQL"]
                },
                {
                    "title": "Data Analytics Dashboard",
                    "description": "Created a dashboard to visualize complex metrics.",
                    "tech_stack": ["Python", "Flask", "React"]
                }
            ],
            "education": [
                {
                    "degree": "B.Tech in Computer Science",
                    "institution": "Tech University",
                    "year": "2025"
                }
            ],
            "experience": [
                {
                    "role": "Software Engineer Intern",
                    "company": "Tech Solutions",
                    "duration": "6 months",
                    "description": "Developed features for the main web application using React."
                }
            ],
            "gaps": [
                {
                    "period": "None",
                    "explanation": "No employment gaps identified."
                }
            ]
        }
    
    # 2. Aptitude Questions (New 100-question bank and sampling model)
    if "logical reasoning" in prompt_lower and "25" in prompt_lower:
        return [
            {
                "question_index": i,
                "category": "Logical Reasoning",
                "question_text": f"Logical Reasoning question {i}.",
                "options": {
                    "A": "Option A text",
                    "B": "Option B text",
                    "C": "Option C text",
                    "D": "Option D text"
                },
                "correct_answer": "A",
                "explanation": f"Explanation for Logical Reasoning question {i}."
            } for i in range(1, 26)
        ]
        
    if "quantitative aptitude" in prompt_lower and "20" in prompt_lower:
        return [
            {
                "question_index": i,
                "category": "Quantitative Aptitude",
                "question_text": f"Quantitative Aptitude question {i}.",
                "options": {
                    "A": "Option A text",
                    "B": "Option B text",
                    "C": "Option C text",
                    "D": "Option D text"
                },
                "correct_answer": "B",
                "explanation": f"Explanation for Quantitative Aptitude question {i}."
            } for i in range(1, 21)
        ]
        
    if "technical mcq" in prompt_lower and "35" in prompt_lower:
        return [
            {
                "question_index": i,
                "category": "Technical MCQ",
                "question_text": f"Technical MCQ question {i}.",
                "options": {
                    "A": "Option A text",
                    "B": "Option B text",
                    "C": "Option C text",
                    "D": "Option D text"
                },
                "correct_answer": "C",
                "explanation": f"Explanation for Technical MCQ question {i}."
            } for i in range(1, 36)
        ]
        
    if "verbal / english" in prompt_lower and "20" in prompt_lower:
        return [
            {
                "question_index": i,
                "category": "Verbal / English",
                "question_text": f"Verbal / English question {i}.",
                "options": {
                    "A": "Option A text",
                    "B": "Option B text",
                    "C": "Option C text",
                    "D": "Option D text"
                },
                "correct_answer": "D",
                "explanation": f"Explanation for Verbal / English question {i}."
            } for i in range(1, 21)
        ]

    # 20-question mockup compatibility
    if "generating technical multiple-choice questions" in prompt_lower or "online aptitude test" in prompt_lower or "aptitude_questions" in prompt_lower or "generate exactly 20 multiple-choice questions" in prompt_lower or "generate exactly 15 multiple-choice questions" in prompt_lower:
        return [
            {
                "question_index": 1,
                "category": "Logical Reasoning",
                "question_text": "Look at this series: 2, 1, (1/2), (1/4), ... What number should come next?",
                "options": {
                    "A": "1/3",
                    "B": "1/8",
                    "C": "2/8",
                    "D": "1/16"
                },
                "correct_answer": "B",
                "explanation": "This is a simple division series. Each number is 1/2 of the previous number. Next is (1/4)/2 = 1/8."
            },
            {
                "question_index": 2,
                "category": "Logical Reasoning",
                "question_text": "If the code word for 'READY' is 'IWDAB', what is the code word for 'PEOPLE'?",
                "options": {
                    "A": "KTBKHA",
                    "B": "KVEKOV",
                    "C": "KSBLHA",
                    "D": "LVEKOV"
                },
                "correct_answer": "B",
                "explanation": "In this cipher, each letter is replaced by its opposite counterpart in the alphabet (A <-> Z, B <-> Y, ..., P <-> K, E <-> V, O <-> L, etc.). So PEOPLE becomes KVEKOV."
            },
            {
                "question_index": 3,
                "category": "Logical Reasoning",
                "question_text": "Find the odd one out among the following choices:",
                "options": {
                    "A": "Python",
                    "B": "Java",
                    "C": "C++",
                    "D": "HTML"
                },
                "correct_answer": "D",
                "explanation": "Python, Java, and C++ are high-level programming languages, while HTML is a markup language used for structural design."
            },
            {
                "question_index": 4,
                "category": "Logical Reasoning",
                "question_text": "A is the father of B, but B is not his son. What is B's relationship to A?",
                "options": {
                    "A": "Daughter",
                    "B": "Son-in-law",
                    "C": "Brother",
                    "D": "Uncle"
                },
                "correct_answer": "A",
                "explanation": "Since A is the father of B and B is not a son, B must be A's daughter."
            },
            {
                "question_index": 5,
                "category": "Logical Reasoning",
                "question_text": "Choose the word that is an indispensable and necessary part of the word 'Book':",
                "options": {
                    "A": "Fiction",
                    "B": "Pages",
                    "C": "Pictures",
                    "D": "Library"
                },
                "correct_answer": "B",
                "explanation": "A book must have pages. It does not necessarily have to be fiction, contain pictures, or reside in a library."
            },
            {
                "question_index": 6,
                "category": "Quantitative Aptitude",
                "question_text": "A train running at the speed of 60 km/hr crosses a pole in 9 seconds. What is the length of the train?",
                "options": {
                    "A": "120 metres",
                    "B": "180 metres",
                    "C": "324 metres",
                    "D": "150 metres"
                },
                "correct_answer": "D",
                "explanation": "Speed = 60 * (5/18) m/s = 50/3 m/s. Length of the train = Speed * Time = (50/3) * 9 = 150 metres."
            },
            {
                "question_index": 7,
                "category": "Quantitative Aptitude",
                "question_text": "A sum of money at simple interest amounts to $815 in 3 years and to $854 in 4 years. What is the principal sum?",
                "options": {
                    "A": "$650",
                    "B": "$690",
                    "C": "$698",
                    "D": "$700"
                },
                "correct_answer": "C",
                "explanation": "Interest for 1 year = $854 - $815 = $39. Interest for 3 years = 39 * 3 = $117. Principal = $815 - $117 = $698."
            },
            {
                "question_index": 8,
                "category": "Quantitative Aptitude",
                "question_text": "If 20% of an electricity bill is deducted, then $100 is still to be paid. How much was the original bill amount?",
                "options": {
                    "A": "$120",
                    "B": "$125",
                    "C": "$130",
                    "D": "$140"
                },
                "correct_answer": "B",
                "explanation": "If 20% is deducted, 80% is left. 0.80 * Bill = $100 => Bill = 100 / 0.80 = $125."
            },
            {
                "question_index": 9,
                "category": "Quantitative Aptitude",
                "question_text": "A father is twice as old as his son. 20 years ago, the age of the father was 12 times the age of the son. What is the present age of the father?",
                "options": {
                    "A": "44 years",
                    "B": "32 years",
                    "C": "40 years",
                    "D": "22 years"
                },
                "correct_answer": "A",
                "explanation": "Let son's present age be x, father's be 2x. 20 years ago: 2x - 20 = 12(x - 20) => 2x - 20 = 12x - 240 => 10x = 220 => x = 22. Father's age = 2x = 44."
            },
            {
                "question_index": 10,
                "category": "Technical MCQ",
                "question_text": "Which of the following is NOT a built-in Hook in React?",
                "options": {
                    "A": "useState",
                    "B": "useEffect",
                    "C": "useFetch",
                    "D": "useContext"
                },
                "correct_answer": "C",
                "explanation": "useState, useEffect, and useContext are standard React hooks. useFetch is not built-in, though it is a common custom hook pattern."
            },
            {
                "question_index": 11,
                "category": "Technical MCQ",
                "question_text": "What is the output of 'console.log(typeof NaN)' in JavaScript?",
                "options": {
                    "A": "number",
                    "B": "NaN",
                    "C": "undefined",
                    "D": "object"
                },
                "correct_answer": "A",
                "explanation": "In JavaScript, NaN stands for 'Not-a-Number', but its primitive type is 'number'."
            },
            {
                "question_index": 12,
                "category": "Technical MCQ",
                "question_text": "In React, which Hook invocation matches the behavior of the 'componentDidMount' class lifecycle method?",
                "options": {
                    "A": "useEffect with a state dependency",
                    "B": "useEffect with an empty dependency array []",
                    "C": "useMemo",
                    "D": "useEffect with no dependency array"
                },
                "correct_answer": "B",
                "explanation": "Passing an empty array [] to useEffect tells React to run the effect callback only once after the component mounts."
            },
            {
                "question_index": 13,
                "category": "Technical MCQ",
                "question_text": "Which data structure is commonly used in relational databases like MySQL/PostgreSQL to index columns for range query efficiency?",
                "options": {
                    "A": "Hash Map",
                    "B": "Binary Search Tree",
                    "C": "B-Tree / B+ Tree",
                    "D": "Singly Linked List"
                },
                "correct_answer": "C",
                "explanation": "B-Trees keep keys in a sorted sequence, facilitating log-time lookups, insertions, deletions, and sequential range queries."
            },
            {
                "question_index": 14,
                "category": "Technical MCQ",
                "question_text": "In Node.js, what is the core responsibility of the Event Loop?",
                "options": {
                    "A": "Executing heavy CPU-bound math processes",
                    "B": "Offloading asynchronous I/O operations and executing their associated callbacks",
                    "C": "Compiling source files to V8 bytecode",
                    "D": "Opening connection sockets to databases"
                },
                "correct_answer": "B",
                "explanation": "The Event Loop enables non-blocking asynchronous I/O by coordinating callbacks, delegating work, and handling completed actions."
            },
            {
                "question_index": 15,
                "category": "Technical MCQ",
                "question_text": "Which of the following built-in data types is mutable in Python?",
                "options": {
                    "A": "List",
                    "B": "Tuple",
                    "C": "String",
                    "D": "Integer"
                },
                "correct_answer": "A",
                "explanation": "Lists are mutable (can be changed after creation), whereas tuples, strings, and integers are immutable."
            },
            {
                "question_index": 16,
                "category": "Technical MCQ",
                "question_text": "What is the primary function of the 'alt' attribute on an HTML image tag?",
                "options": {
                    "A": "Provides CSS classes for hover states",
                    "B": "Identifies fallback image paths",
                    "C": "Supplies text alternatives for screen readers and cases where images fail to render",
                    "D": "Dictates float alignments"
                },
                "correct_answer": "C",
                "explanation": "The 'alt' attribute describes image content for screen readers (accessibility) and is shown if the image fails to load."
            },
            {
                "question_index": 17,
                "category": "Verbal / English",
                "question_text": "Which of the following words is most nearly OPPOSITE in meaning to 'OBSTINATE'?",
                "options": {
                    "A": "Stubborn",
                    "B": "Flexible",
                    "C": "Dogged",
                    "D": "Rigid"
                },
                "correct_answer": "B",
                "explanation": "Obstinate means stubborn or unyielding. The opposite is flexible, compliant, or accommodating."
            },
            {
                "question_index": 18,
                "category": "Verbal / English",
                "question_text": "Fill in the blank: 'Neither the manager nor the employees _______ present at the meeting.'",
                "options": {
                    "A": "was",
                    "B": "were",
                    "C": "is",
                    "D": "has been"
                },
                "correct_answer": "B",
                "explanation": "When two subjects are joined by 'neither/nor', the verb agrees with the subject closer to it. 'Employees' is plural, so 'were' is correct."
            },
            {
                "question_index": 19,
                "category": "Verbal / English",
                "question_text": "Select the option with the correct spelling:",
                "options": {
                    "A": "Accomodate",
                    "B": "Accommodate",
                    "C": "Acomodate",
                    "D": "Acommodate"
                },
                "correct_answer": "B",
                "explanation": "The correct spelling is 'Accommodate' containing double 'c' and double 'm'."
            },
            {
                "question_index": 20,
                "category": "Verbal / English",
                "question_text": "Find the word closest in meaning (synonym) to 'PRUDENT':",
                "options": {
                    "A": "Reckless",
                    "B": "Careless",
                    "C": "Wise / Cautious",
                    "D": "Extravagant"
                },
                "correct_answer": "C",
                "explanation": "Prudent means showing care and thought for the future, i.e., wise, sensible, and cautious."
            }
        ]
    
    # 3. Generate Interview Questions (HR or Technical)
    if "conducting a professional hiring interview" in prompt_lower or "aria, your ai recruiter" in prompt_lower or "round 2: hr live intro" in prompt_lower or "round 3: tech deep-dive" in prompt_lower or "generate questions for the candidate" in prompt_lower or "interview_questions" in prompt_lower or "interview/questions" in prompt_lower:
        if "round is 2" in prompt_lower or "round 2" in prompt_lower:
            return [
                {"question_index": 1, "category": "HR", "question_text": "Hello! I'm ARIA, your AI recruiter. Welcome to PlaceAI. Could you please start by introducing yourself?"},
                {"question_index": 2, "category": "HR", "question_text": "Why are you interested in joining our company?"},
                {"question_index": 3, "category": "HR", "question_text": "What would you say are your top 3 strengths relevant to this role?"},
                {"question_index": 4, "category": "HR", "question_text": "Tell me about a challenging situation you faced at work or university and how you overcame it."},
                {"question_index": 5, "category": "HR", "question_text": "Where do you see yourself professionally in the next 3 to 5 years?"}
            ]
        else:
            return [
                {"question_index": 1, "category": "Resume Deep Dive", "question_text": "Could you walk me through the tech stack of your E-Commerce Platform project?"},
                {"question_index": 2, "category": "Resume Deep Dive", "question_text": "How did you practically implement React and SQL in your applications?"},
                {"question_index": 3, "category": "Resume Deep Dive", "question_text": "What was the biggest technical challenge you faced in your Data Analytics Dashboard and how did you solve it?"},
                {"question_index": 4, "category": "Technical Skill", "question_text": "Explain the difference between functional components and class components in React."},
                {"question_index": 5, "category": "Technical Skill", "question_text": "How does Node.js handle asynchronous operations under the hood?"},
                {"question_index": 6, "category": "Technical Skill", "question_text": "What are indexes in SQL, and how do they optimize query performance?"},
                {"question_index": 7, "category": "Technical Skill", "question_text": "What is the difference between list and tuple in Python?"},
                {"question_index": 8, "category": "Company-Specific", "question_text": "How would you design a highly scalable cache system for search queries?"},
                {"question_index": 9, "category": "Company-Specific", "question_text": "How do you handle delivering high quality code under extremely tight deadlines?"}
            ]
            
    return {}

# Helper function to invoke Gemini and parse JSON
async def call_gemini_json(prompt: str) -> dict:
    if use_mock_gemini:
        return mock_gemini_response(prompt)
    
    # Try the configured model first, then fall back to standard alternatives
    models_to_try = [gemini_model_name]
    for fallback in ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash", "gemini-1.5-pro"]:
        if fallback not in models_to_try:
            models_to_try.append(fallback)
            
    last_err = None
    for model_name in models_to_try:
        try:
            logger.info(f"Attempting to query Gemini API with model: {model_name}")
            model = genai.GenerativeModel(model_name)
            system_instruction = "You are a professional recruitment AI assistant. You must return only valid JSON without any markdown code block wrappers or comments. Respond with a raw JSON structure matching the requested schema."
            
            # Using asyncio.wait_for to enforce the 110.0s timeout on the async Gemini API call
            async def gemini_call():
                return await model.generate_content_async(
                    f"{system_instruction}\n\nUser Request:\n{prompt}",
                    request_options={"timeout": 110.0}
                )
            
            response = await asyncio.wait_for(
                gemini_call(),
                timeout=110.0
            )
            
            text = response.text.strip()
            
            # Clean any accidental markdown code fences
            if text.startswith("```json"):
                text = text[7:]
            elif text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]
            text = text.strip()
            
            return json.loads(text)
        except json.JSONDecodeError as jde:
            logger.error(f"Failed to decode JSON from Gemini response using {model_name}: '{text}' - Error: {jde}")
            # Try a regex-like clean up or manual strip
            try:
                # Fallback extract JSON block
                start = text.find("{")
                end = text.rfind("}") + 1
                if start != -1 and end != -1:
                    return json.loads(text[start:end])
                
                start_arr = text.find("[")
                end_arr = text.rfind("]") + 1
                if start_arr != -1 and end_arr != -1:
                    return json.loads(text[start_arr:end_arr])
            except Exception as ex:
                logger.error(f"Fallback JSON parsing failed: {ex}")
            last_err = jde
        except Exception as e:
            logger.error(f"Error querying Gemini API with model {model_name}: {e}")
            last_err = e
            # Continue loop to try next fallback model
            
    # If all models failed, log warning and fall back to mock Gemini response so the app doesn't crash
    logger.warning(f"All Gemini models failed. Falling back to mock Gemini response. Last error: {last_err}")
    return mock_gemini_response(prompt)

# Pydantic Schemas
class CreateSessionRequest(BaseModel):
    company_mode: str
    candidate_name: Optional[str] = ""

class UpdateSessionNameRequest(BaseModel):
    candidate_name: str

class ResumeParseRequest(BaseModel):
    resume_text: str

class AptitudeSubmitRequest(BaseModel):
    answers: dict  # maps question_index string to option selected: {"1": "A", "2": "B", ...}
    time_taken: int  # in seconds

class InterviewQuestionsRequest(BaseModel):
    round: int

class InterviewAnswerRequest(BaseModel):
    round: int
    question_index: int
    question_text: str
    answer_text: str
    duration_sec: int
    hesitation_count: int
    silence_gaps: int
    filler_words_detected: dict
    expression_analysis: Optional[List[dict]] = []

# API Endpoints

@app.get("/api/health")
def health_check():
    return {"status": "healthy", "supabase_connected": supabase is not None}

@app.post("/api/sessions")
def create_session(body: CreateSessionRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        data = {
            "company_mode": body.company_mode,
            "candidate_name": body.candidate_name or ""
        }
        res = supabase.table("placeai_sessions").insert(data).execute()
        if not res.data:
            raise HTTPException(status_code=500, detail="Failed to create session in database")
        return {"session_id": res.data[0]["id"], "session": res.data[0]}
    except Exception as e:
        logger.error(f"Error creating session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_id}")
def get_session(session_id: str):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        res = supabase.table("placeai_sessions").select("*").eq("id", session_id).execute()
    except Exception as e:
        logger.error(f"Error fetching session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data[0]

@app.delete("/api/sessions/{session_id}")
def delete_session(session_id: str):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        # Delete related answers
        supabase.table("placeai_answers").delete().eq("session_id", session_id).execute()
        # Delete session
        supabase.table("placeai_sessions").delete().eq("id", session_id).execute()
        return {"status": "success", "message": "Session deleted"}
    except Exception as e:
        logger.error(f"Error deleting session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sessions/{session_id}/resume")
async def parse_resume(session_id: str, body: ResumeParseRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    # Check session
    session_res = supabase.table("placeai_sessions").select("*").eq("id", session_id).execute()
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    prompt = f"""
    You are an expert resume parsing AI. Parse the following candidate resume text and extract the candidate's name, their key technical skills, list of projects, education details, work experience, and any gaps in their resume.
    Return a valid JSON object with the following fields:
    {{
      "candidate_name": "Candidate's real name if explicitly found/clear in the resume text. Return an empty string \"\" if not clearly identified. Do NOT guess or invent a name.",
      "skills": ["Skill 1", "Skill 2", ...],
      "projects": [
         {{
           "title": "Project Name",
           "description": "Brief description",
           "tech_stack": ["Tech 1", ...]
         }}
      ],
      "education": [
         {{
           "degree": "Degree Name",
           "institution": "University/College",
           "year": "Year"
         }}
      ],
      "experience": [
         {{
           "role": "Role Title",
           "company": "Company Name",
           "duration": "Duration",
           "description": "Brief description"
         }}
      ],
      "gaps": [
         {{
           "period": "Gap duration/years",
           "explanation": "Brief explanation or placeholder if none identified"
         }}
      ]
    }}
    Resume Text:
    {body.resume_text}
    """
    
    # Call Gemini to parse resume text
    parsed_data = await call_gemini_json(prompt)
    candidate_name = parsed_data.get("candidate_name", "")
    if not candidate_name or not isinstance(candidate_name, str) or candidate_name.strip().lower() in ["guest", "candidate", "jane doe", "john doe", "null", "none"]:
        candidate_name = ""
    parsed_data["candidate_name"] = candidate_name
    
    try:
        # Update session row with parsed details
        update_data = {
            "resume_text": body.resume_text,
            "resume_data": parsed_data,
            "candidate_name": candidate_name
        }
        supabase.table("placeai_sessions").update(update_data).eq("id", session_id).execute()
        return {"resume_data": parsed_data, "candidate_name": candidate_name}
    except Exception as e:
        logger.error(f"Error updating session with resume data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/sessions/{session_id}/name")
def update_session_name(session_id: str, body: UpdateSessionNameRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        res = supabase.table("placeai_sessions").update({
            "candidate_name": body.candidate_name.strip()
        }).eq("id", session_id).execute()
        if not res.data:
            raise HTTPException(status_code=404, detail="Session not found")
        return {"status": "success", "session": res.data[0]}
    except Exception as e:
        logger.error(f"Error updating candidate name: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def load_question_bank_from_file() -> list:
    import re
    base_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(base_dir, "..", "placeai_question_bank.json")
    if not os.path.exists(path):
        path = "placeai_question_bank.json"
    if not os.path.exists(path):
        logger.warning("placeai_question_bank.json not found.")
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        # Clean JS-style single line comments (e.g. // SECTION)
        content = re.sub(r'(?<!:)\/\/.*', '', content)
        data = json.loads(content)
        return data[0].get("questions", [])
    except Exception as e:
        logger.error(f"Error parsing placeai_question_bank.json: {e}")
        return []

def sync_question_bank_to_db():
    if use_mock_supabase:
        return
    try:
        # Check if question bank already has entries
        count_res = supabase.table("placeai_question_bank").select("id", count="exact").limit(1).execute()
        if count_res.count is None or count_res.count == 0:
            logger.info("Database question bank is empty. Importing placeai_question_bank.json...")
            questions = load_question_bank_from_file()
            if not questions:
                return
            
            db_entries = []
            for q in questions:
                db_entries.append({
                    "company_mode": "General",
                    "category": q.get("category"),
                    "question": q.get("question"),
                    "option_a": q.get("option_a"),
                    "option_b": q.get("option_b"),
                    "option_c": q.get("option_c"),
                    "option_d": q.get("option_d"),
                    "correct_answer": q.get("correct_answer"),
                    "explanation": q.get("explanation", "")
                })
            
            # Insert in chunks of 50
            chunk_size = 50
            for i in range(0, len(db_entries), chunk_size):
                chunk = db_entries[i:i+chunk_size]
                supabase.table("placeai_question_bank").insert(chunk).execute()
            logger.info("Successfully imported question bank to Supabase.")
    except Exception as e:
        logger.error(f"Error syncing question bank to database: {e}")

@app.post("/api/sessions/{session_id}/aptitude/questions")
async def generate_aptitude_questions(session_id: str):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    session_res = supabase.table("placeai_sessions").select("*").eq("id", session_id).execute()
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_res.data[0]
    resume_data = session.get("resume_data") or {}
    skills = resume_data.get("skills", ["General Programming", "Logic", "Math"])
    company_mode = session.get("company_mode", "General")
    
    import re
    import random
    
    # Auto sync questions to DB if using real Supabase
    sync_question_bank_to_db()
    
    all_qs = []
    
    # If using real Supabase, try to load from DB
    if not use_mock_supabase:
        try:
            db_res = supabase.table("placeai_question_bank").select("*").execute()
            if db_res.data:
                for row in db_res.data:
                    all_qs.append({
                        "category": row.get("category"),
                        "question": row.get("question"),
                        "option_a": row.get("option_a"),
                        "option_b": row.get("option_b"),
                        "option_c": row.get("option_c"),
                        "option_d": row.get("option_d"),
                        "correct_answer": row.get("correct_answer"),
                        "explanation": row.get("explanation")
                    })
        except Exception as e:
            logger.error(f"Error reading from placeai_question_bank table: {e}. Falling back to file.")
            
    # If empty (or mock), read from JSON file
    if not all_qs:
        all_qs = load_question_bank_from_file()
        
    if not all_qs:
        logger.error("No questions found in file or database.")
        raise HTTPException(status_code=500, detail="Question bank is empty or could not be loaded")
        
    # Group questions by category
    logical_pool = [q for q in all_qs if q.get("category") == "logical_reasoning"]
    quant_pool = [q for q in all_qs if q.get("category") == "quantitative_aptitude"]
    verbal_pool = [q for q in all_qs if q.get("category") == "verbal_english"]
    tech_pool = [q for q in all_qs if q.get("category") in ["technical_general", "technical_mcq"]]
    
    # Ensure pools are not empty
    if not logical_pool or not quant_pool or not verbal_pool or not tech_pool:
        logical_pool = [q for q in all_qs if "logic" in str(q.get("category")).lower()]
        quant_pool = [q for q in all_qs if "quant" in str(q.get("category")).lower()]
        verbal_pool = [q for q in all_qs if "verbal" in str(q.get("category")).lower() or "english" in str(q.get("category")).lower()]
        tech_pool = [q for q in all_qs if "tech" in str(q.get("category")).lower()]
        
    selected_qs = []
    
    # 1. 5 Logical
    random.shuffle(logical_pool)
    for q in logical_pool[:5]:
        selected_qs.append({
            "category": "Logical Reasoning",
            "question_text": q["question"],
            "options": {
                "A": q["option_a"],
                "B": q["option_b"],
                "C": q["option_c"],
                "D": q["option_d"]
            },
            "correct_answer": q["correct_answer"],
            "explanation": q.get("explanation", "")
        })
        
    # 2. 4 Quant
    random.shuffle(quant_pool)
    for q in quant_pool[:4]:
        selected_qs.append({
            "category": "Quantitative Aptitude",
            "question_text": q["question"],
            "options": {
                "A": q["option_a"],
                "B": q["option_b"],
                "C": q["option_c"],
                "D": q["option_d"]
            },
            "correct_answer": q["correct_answer"],
            "explanation": q.get("explanation", "")
        })
        
    # 3. 4 Verbal
    random.shuffle(verbal_pool)
    for q in verbal_pool[:4]:
        selected_qs.append({
            "category": "Verbal / English",
            "question_text": q["question"],
            "options": {
                "A": q["option_a"],
                "B": q["option_b"],
                "C": q["option_c"],
                "D": q["option_d"]
            },
            "correct_answer": q["correct_answer"],
            "explanation": q.get("explanation", "")
        })
        
    # 4. 7 Technical (dynamic if gemini available, static fallback if not)
    if not use_mock_gemini:
        try:
            prompt = f"""
            You are a professional hiring evaluator generating technical multiple-choice questions for an online aptitude test.
            Based on the candidate's skills and target company, generate exactly 7 technical multiple-choice questions (MCQs).
            Target Company: {company_mode}
            Candidate Skills: {skills}

            Each question must have exactly 4 options: A, B, C, D, and specify the correct answer ('A', 'B', 'C', or 'D') and a clear, detailed explanation.
            Return a valid JSON array of exactly 7 question objects matching this structure:
            [
              {{
                "category": "Technical MCQ",
                "question_text": "The text of the question",
                "options": {{
                  "A": "Option A text",
                  "B": "Option B text",
                  "C": "Option C text",
                  "D": "Option D text"
                }},
                "correct_answer": "A" | "B" | "C" | "D",
                "explanation": "Detailed explanation of why the answer is correct"
              }}
            ]
            """
            logger.info("Generating 7 dynamic technical questions via Gemini...")
            tech_questions = await call_gemini_json(prompt)
            if isinstance(tech_questions, list) and len(tech_questions) >= 7:
                for tq in tech_questions[:7]:
                    tq["category"] = "Technical MCQ"
                    selected_qs.append(tq)
            else:
                raise Exception("Invalid Gemini response format")
        except Exception as e:
            logger.error(f"Error generating dynamic technical questions: {e}. Falling back to static.")
            random.shuffle(tech_pool)
            for q in tech_pool[:7]:
                selected_qs.append({
                    "category": "Technical MCQ",
                    "question_text": q["question"],
                    "options": {
                        "A": q["option_a"],
                        "B": q["option_b"],
                        "C": q["option_c"],
                        "D": q["option_d"]
                    },
                    "correct_answer": q["correct_answer"],
                    "explanation": q.get("explanation", "")
                })
    else:
        random.shuffle(tech_pool)
        for q in tech_pool[:7]:
            selected_qs.append({
                "category": "Technical MCQ",
                "question_text": q["question"],
                "options": {
                    "A": q["option_a"],
                    "B": q["option_b"],
                    "C": q["option_c"],
                    "D": q["option_d"]
                },
                "correct_answer": q["correct_answer"],
                "explanation": q.get("explanation", "")
            })
            
    # Randomize final selected order and set index
    random.shuffle(selected_qs)
    for idx, q in enumerate(selected_qs):
        q["question_index"] = idx + 1

    try:
        supabase.table("placeai_sessions").update({
            "aptitude_questions": selected_qs
        }).eq("id", session_id).execute()
        return {"questions": selected_qs}
    except Exception as e:
        logger.error(f"Error saving aptitude questions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sessions/{session_id}/aptitude/submit")
def submit_aptitude(session_id: str, body: AptitudeSubmitRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    session_res = supabase.table("placeai_sessions").select("*").eq("id", session_id).execute()
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_res.data[0]
    questions = session.get("aptitude_questions")
    if not questions:
        raise HTTPException(status_code=400, detail="Aptitude questions not generated yet")
    
    # Evaluate answers
    correct_count = 0
    wrong_count = 0
    skipped_count = 0
    breakdown = {
        "Logical Reasoning": {"correct": 0, "total": 0},
        "Quantitative Aptitude": {"correct": 0, "total": 0},
        "Technical MCQ": {"correct": 0, "total": 0},
        "Verbal / English": {"correct": 0, "total": 0}
    }
    
    question_review = []
    
    for q in questions:
        q_idx_str = str(q["question_index"])
        category = q["category"]
        correct_ans = q["correct_answer"]
        user_ans = body.answers.get(q_idx_str, "")
        
        breakdown[category]["total"] += 1
        
        is_correct = False
        if not user_ans or user_ans == "":
            skipped_count += 1
        elif user_ans.upper() == correct_ans.upper():
            correct_count += 1
            is_correct = True
            breakdown[category]["correct"] += 1
        else:
            wrong_count += 1
            
        question_review.append({
            "question_index": q["question_index"],
            "category": category,
            "question_text": q["question_text"],
            "options": q["options"],
            "correct_answer": correct_ans,
            "user_answer": user_ans,
            "is_correct": is_correct,
            "explanation": q.get("explanation", "")
        })
        
    result_data = {
        "score": correct_count,
        "total_questions": len(questions),
        "time_taken_seconds": body.time_taken,
        "correct_count": correct_count,
        "wrong_count": wrong_count,
        "skipped_count": skipped_count,
        "breakdown": breakdown,
        "review": question_review
    }
    
    # Increment aptitude retry count if they fail
    # Pass threshold is 9/15 (60%)
    passed = correct_count >= 9
    
    # We update the retry count
    current_retries = session.get("aptitude_retry_count") or 0
    new_retries = current_retries if passed else current_retries + 1
    
    try:
        supabase.table("placeai_sessions").update({
            "aptitude_result": result_data,
            "aptitude_retry_count": new_retries
        }).eq("id", session_id).execute()
        
        return {
            "passed": passed,
            "score": correct_count,
            "total": len(questions),
            "result": result_data,
            "aptitude_retry_count": new_retries
        }
    except Exception as e:
        logger.error(f"Error submitting aptitude answers: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sessions/{session_id}/interview/questions")
async def generate_interview_questions(session_id: str, body: InterviewQuestionsRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    session_res = supabase.table("placeai_sessions").select("*").eq("id", session_id).execute()
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_res.data[0]
    candidate_name = session.get("candidate_name") or "User"
    company_mode = session.get("company_mode", "General")
    resume_data = session.get("resume_data") or {}
    
    resume_text = session.get("resume_text") or ""
    if not resume_text and resume_data:
        # Reconstruct resume text representation from resume_data if raw text is not present
        resume_text = f"Candidate Name: {candidate_name}\n"
        skills = resume_data.get("skills", [])
        if isinstance(skills, list):
            resume_text += f"Skills: {', '.join(skills)}\n"
        projects = resume_data.get("projects", [])
        if isinstance(projects, list) and projects:
            resume_text += "Projects:\n"
            for p in projects:
                p_stack = p.get("tech_stack", [])
                stack_str = ", ".join(p_stack) if isinstance(p_stack, list) else str(p_stack)
                resume_text += f"- {p.get('title')}: {p.get('description')} (Tech: {stack_str})\n"
        education = resume_data.get("education", [])
        if isinstance(education, list) and education:
            resume_text += "Education:\n"
            for e in education:
                resume_text += f"- {e.get('degree')} from {e.get('institution')} ({e.get('year')})\n"
        experience = resume_data.get("experience", [])
        if isinstance(experience, list) and experience:
            resume_text += "Experience:\n"
            for exp in experience:
                resume_text += f"- {exp.get('role')} at {exp.get('company')} ({exp.get('duration')}): {exp.get('description')}\n"

    if body.round == 2:
        c_name = candidate_name if candidate_name and candidate_name.strip() else "there"
        c_company = company_mode if company_mode and company_mode.strip() != "General" else "our company"
        questions = [
            {
                "question_index": 1,
                "category": "HR",
                "question_text": f"Hello {c_name}! I'm ARIA, your AI recruiter. Welcome to PlaceAI. Could you please start by introducing yourself?"
            },
            {
                "question_index": 2,
                "category": "HR",
                "question_text": f"Why are you interested in joining {c_company}?"
            },
            {
                "question_index": 3,
                "category": "HR",
                "question_text": "What would you say are your top 3 strengths relevant to this role?"
            },
            {
                "question_index": 4,
                "category": "HR",
                "question_text": "Tell me about a challenging situation you faced at work or university and how you overcame it."
            },
            {
                "question_index": 5,
                "category": "HR",
                "question_text": "Where do you see yourself professionally in the next 3 to 5 years?"
            }
        ]
    else:
        prompt = f"""
        You are ARIA, an AI Recruiter at PlaceAI, conducting a professional hiring interview (Round 3: Tech Deep-Dive).
        
        Read this resume extremely carefully line by line:

        {resume_text}

        Extract the following with full detail:
        - Candidate's exact project names and tech stacks used
        - Every skill listed with context of how it was used
        - Company names, roles, duration if any experience exists
        - College name, degree, year of graduation
        - Any gaps in education or experience timeline
        - Certifications mentioned
        - Any specific tools, frameworks, libraries mentioned

        Now generate interview questions that are 
        hyper-specific to THIS candidate only.
        Questions must reference exact project names,
        exact skills, exact technologies from their resume.

        EXAMPLES OF GOOD QUESTIONS:
        - 'I see you built [exact project name from resume] using [exact tech stack]. Can you walk me through how you handled [specific challenge in that domain]?'
        - 'Your resume mentions [exact skill]. Can you show a real example of how you used it in [their specific project]?'
        - 'I notice a gap between [date] and [date] in your resume. Can you explain what you were doing during that time?'
        - 'You listed [exact tool] as a skill but none of your projects mention using it. Can you elaborate on your experience with it?'

        RULES:
        - Never ask generic questions like 'Tell me about your skills'
        - Every question must mention something specific from their actual resume
        - Cross-check skills vs projects — if skill is listed but not used in any project, ask about it specifically
        - If candidate has no experience, focus deeply on their projects and education

        For this Round 3 (Tech Deep-Dive), generate exactly 9 technical and company-specific questions tailored to the company '{company_mode}':
        - Section A: Resume Deep Dive (3 questions based on their projects/skills in their resume):
          - Question 1: Ask about walking through the tech stack of a specific project (e.g. Project Name).
          - Question 2: Ask how they used a specific skill mentioned in their resume practically.
          - Question 3: Ask about the biggest technical challenge in a project and how they solved it.
        - Section B: Technical Skill Questions (4 questions based on their skills):
          - Generate 4 deep-dive technical questions appropriate for their skills list. (e.g., if skills list includes React, SQL, Python, generate questions specific to those)
        - Section C: Company-Specific Questions (2 questions):
          - Generate 2 questions relevant to the company '{company_mode}' and where possible, reference their tech stack:
            - TCS: Agile Scrum methodology, sprint work.
            - Infosys: Client communication, managing difficult client expectations.
            - Google: Design a highly scalable system (like URL shortener, search cache) relevant to their stack.
            - Amazon: Projects demonstrating high ownership (Amazon Leadership Principle).
            - Wipro: Quick technology adaptation and independent learning.
            - Accenture: Delivering quality code under tight client deadlines.
            - General: Standard technical design + team collaboration mix.

        Return a valid JSON array of exactly 9 question objects matching this structure:
        [
          {{
            "question_index": 1,
            "category": "Resume Deep Dive" | "Technical Skill" | "Company-Specific",
            "question_text": "Question text here"
          }},
          ...
        ]
        """
        questions = await call_gemini_json(prompt)
    
    # Unpack questions if they are wrapped in an object
    if isinstance(questions, dict):
        if "questions" in questions:
            questions = questions["questions"]
        elif "interview_questions" in questions:
            questions = questions["interview_questions"]
        elif "data" in questions:
            questions = questions["data"]
        else:
            # Try to find the first list in the dictionary values
            for val in questions.values():
                if isinstance(val, list):
                    questions = val
                    break
                    
    # Double-check that it is now a list
    if not isinstance(questions, list):
        logger.warning(f"Failed to resolve a list from Gemini's response: {questions}")
        # Return fallback mock questions to avoid crashes
        if body.round == 2:
            questions = [
                {"question_index": 1, "category": "HR", "question_text": f"Hello {candidate_name}! I'm ARIA, your AI recruiter. Welcome to PlaceAI. Could you please start by introducing yourself?"},
                {"question_index": 2, "category": "HR", "question_text": f"Why are you interested in joining {company_mode}?"},
                {"question_index": 3, "category": "HR", "question_text": "What would you say are your top 3 strengths relevant to this role?"},
                {"question_index": 4, "category": "HR", "question_text": "Tell me about a challenging situation you faced and how you overcame it."},
                {"question_index": 5, "category": "HR", "question_text": "Where do you see yourself professionally in the next 3 to 5 years?"}
            ]
        else:
            questions = [
                {"question_index": 1, "category": "Resume Deep Dive", "question_text": "Could you walk me through the tech stack of your most notable project?"},
                {"question_index": 2, "category": "Resume Deep Dive", "question_text": "How did you practically implement your key technical skills in your projects?"},
                {"question_index": 3, "category": "Resume Deep Dive", "question_text": "What was the biggest technical challenge you faced and how did you solve it?"},
                {"question_index": 4, "category": "Technical Skill", "question_text": "Explain the difference between SQL database indexing and a full-table scan."},
                {"question_index": 5, "category": "Technical Skill", "question_text": "What is the difference between synchronous and asynchronous tasks?"},
                {"question_index": 6, "category": "Technical Skill", "question_text": "How do you handle error management in your applications?"},
                {"question_index": 7, "category": "Technical Skill", "question_text": "Explain the concept of REST APIs and how headers/bodies are used."},
                {"question_index": 8, "category": "Company-Specific", "question_text": f"How would you ensure high system scalability for products at {company_mode}?"},
                {"question_index": 9, "category": "Company-Specific", "question_text": "How do you manage to deliver quality code under extremely tight deadlines?"}
            ]
            
    # Normalize keys for questions to guarantee correct structure
    normalized_questions = []
    if isinstance(questions, list):
        for idx, q in enumerate(questions):
            if isinstance(q, dict):
                q_text = q.get("question_text") or q.get("question") or ""
                q_cat = q.get("category") or ("Resume Deep Dive" if idx < 3 else ("Technical Skill" if idx < 7 else "Company-Specific"))
                normalized_questions.append({
                    "question_index": q.get("question_index") or (idx + 1),
                    "category": q_cat,
                    "question_text": q_text
                })
        questions = normalized_questions

    db_field = "interview_questions_round2" if body.round == 2 else "interview_questions_round3"
    
    try:
        supabase.table("placeai_sessions").update({
            db_field: questions
        }).eq("id", session_id).execute()
        return {"questions": questions}
    except Exception as e:
        logger.error(f"Error saving interview questions: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sessions/{session_id}/interview/answer")
async def submit_interview_answer(session_id: str, body: InterviewAnswerRequest):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    session_res = supabase.table("placeai_sessions").select("*").eq("id", session_id).execute()
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    company_mode = session_res.data[0].get("company_mode", "General")
    
    # Prompt Gemini to evaluate this specific answer
    prompt = f"""
    You are ARIA, an AI Recruiter. Evaluate the candidate's spoken response to the following question.
    Question: {body.question_text}
    Candidate Answer: {body.answer_text}
    Metrics:
    - Hesitation count (long pauses): {body.hesitation_count}
    - Silence gaps: {body.silence_gaps}
    - Speaking duration: {body.duration_sec} seconds
    - Selected Company Mode: {company_mode}

    Provide a fair score out of 100 for this answer. Take into account accuracy, depth, structure (e.g., STAR method for behavioral questions), and communication flow.
    Provide a concise, encouraging feedback statement (under 3 sentences).
    Determine if the answer length category is "too short" (under 15 words/very quick), "good" (well-structured, 30-80 words), or "detailed" (highly informative).
    
    Return a valid JSON object with the following fields:
    {{
      "ai_score": integer (0 to 100),
      "ai_feedback": "Your constructive feedback string",
      "answer_length_category": "too short" | "good" | "detailed"
    }}
    """
    
    eval_result = await call_gemini_json(prompt)
    
    # Store in placeai_answers table
    try:
        answer_data = {
            "session_id": session_id,
            "round": body.round,
            "question_index": body.question_index,
            "question_text": body.question_text,
            "answer_text": body.answer_text,
            "filler_words": body.filler_words_detected,
            "silence_gaps": body.silence_gaps,
            "answer_length_category": eval_result.get("answer_length_category", "good"),
            "ai_score": eval_result.get("ai_score", 70),
            "ai_feedback": eval_result.get("ai_feedback", "Nice attempt!")
        }
        
        # Check if this answer already exists to avoid duplicates
        existing_res = supabase.table("placeai_answers")\
            .select("id")\
            .eq("session_id", session_id)\
            .eq("round", body.round)\
            .eq("question_index", body.question_index)\
            .execute()
            
        if existing_res.data:
            # Update existing
            res = supabase.table("placeai_answers")\
                .update(answer_data)\
                .eq("id", existing_res.data[0]["id"])\
                .execute()
        else:
            # Insert new
            res = supabase.table("placeai_answers").insert(answer_data).execute()
            
        return {
            "id": res.data[0]["id"],
            "ai_score": eval_result.get("ai_score"),
            "ai_feedback": eval_result.get("ai_feedback"),
            "answer_length_category": eval_result.get("answer_length_category")
        }
    except Exception as e:
        logger.error(f"Error saving answer evaluation: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sessions/{session_id}/feedback")
async def generate_feedback_report(session_id: str):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    
    session_res = supabase.table("placeai_sessions").select("*").eq("id", session_id).execute()
    if not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = session_res.data[0]
    candidate_name = session.get("candidate_name") or "User"
    company_mode = session.get("company_mode", "General")
    resume_data = session.get("resume_data") or {}
    aptitude_result = session.get("aptitude_result") or {}
    
    # Retrieve all answers
    answers_res = supabase.table("placeai_answers").select("*").eq("session_id", session_id).execute()
    answers_data = answers_res.data or []
    
    prompt = f"""
    You are an expert Placement Coach. Synthesize the candidate's performance across all rounds of the interview process to build a comprehensive feedback report.
    Candidate Name: {candidate_name}
    Company Mode: {company_mode}
    Resume Data: {json.dumps(resume_data)}
    Round 1 (Aptitude) Result: {json.dumps(aptitude_result)}
    Rounds 2 & 3 Answers & Evaluations: {json.dumps(answers_data)}

    Calculate an overall score out of 100 based on the weights:
    - Aptitude: 20%
    - Communication: 30% (from Round 2 and Round 3 behavioral)
    - Technical Knowledge: 30% (from Round 3 technical)
    - Confidence: 10% (from hesitation, silence gaps, answer lengths)
    - Structure: 10% (STAR method usage in answers)

    Evaluate and provide the 6 required cards in the feedback report:
    1. Where You Got Stuck: Identify specific questions where silence gaps or long pauses happened, and give advice.
    2. Your Best Moment: Highlight the highest scoring answer, quote the question, and explain why it was excellent.
    3. Needs Improvement: Identify the weakest answer, explain what was missing, and give a concrete example of how to improve it.
    4. Speech Analysis: Summarize overall filler words used, speaking pace (Too Fast/Good/Too Slow), clarity, and silence gaps count.
    5. Top 3 Action Items: List 3 personalized, concrete next steps.
    6. Personalised Study Plan: Detail a week-by-week practice schedule based on their weaknesses.

    Return a valid JSON object matching the following structure:
    {{
      "overall_score": integer (0-100),
      "grade": "Excellent" (85+) | "Good" (70-84) | "Average" (55-69) | "Needs Work" (under 55),
      "breakdown": {{
        "aptitude": integer (0-100),
        "communication": integer (0-100),
        "technical": integer (0-100),
        "confidence": integer (0-100),
        "structure": integer (0-100),
        "resume_alignment": integer (0-100)
      }},
      "where_you_got_stuck": [
        {{
          "question_text": "Question text",
          "pause_seconds": integer,
          "suggestion": "Concrete suggestion"
        }}
      ],
      "best_moment": {{
        "question_text": "Question text",
        "score": integer,
        "reason": "Why it was good"
      }},
      "needs_improvement": {{
        "question_text": "Question text",
        "missing": "What was missing",
        "how_to_improve": "Concrete improvement code or text template"
      }},
      "speech_analysis": {{
        "filler_words": {{
           "umm": integer,
           "like": integer,
           "basically": integer,
           "you_know": integer,
           "so": integer
        }},
        "speaking_pace": "Too Fast" | "Good" | "Too Slow",
        "clarity_score": integer (0-100),
        "silence_gaps_count": integer
      }},
      "top_3_action_items": [
         "Action item 1",
         "Action item 2",
         "Action item 3"
      ],
      "study_plan": {{
         "recommendations": "Text description",
         "estimated_time": "e.g., 2 weeks of daily 30-minute practice"
      }}
    }}
    """
    
    report = await call_gemini_json(prompt)
    
    # Store feedback report and increment session retry count if it is a retry (checked in DB)
    current_retry_count = session.get("retry_count") or 0
    
    try:
        supabase.table("placeai_sessions").update({
            "feedback_report": report
        }).eq("id", session_id).execute()
        return report
    except Exception as e:
        logger.error(f"Error saving feedback report: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/sessions/{session_id}/feedback")
def get_feedback_report(session_id: str):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        res = supabase.table("placeai_sessions").select("feedback_report").eq("id", session_id).execute()
    except Exception as e:
        logger.error(f"Error fetching feedback report: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    return res.data[0]

@app.post("/api/sessions/{session_id}/retry")
def increment_retry(session_id: str):
    if not supabase:
        raise HTTPException(status_code=503, detail="Supabase not configured")
    try:
        # Get current retry
        session_res = supabase.table("placeai_sessions").select("retry_count").eq("id", session_id).execute()
    except Exception as e:
        logger.error(f"Error fetching session for retry: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if not session_res.data:
        raise HTTPException(status_code=404, detail="Session not found")

    current_retry = session_res.data[0].get("retry_count") or 0

    try:
        # Delete previous evaluations in placeai_answers table for Round 2 and Round 3
        # so they can do a fresh set of interview answers
        supabase.table("placeai_answers").delete().eq("session_id", session_id).execute()

        # Increment retry count
        supabase.table("placeai_sessions").update({
            "retry_count": current_retry + 1,
            "feedback_report": None  # clear old report
        }).eq("id", session_id).execute()

        return {"retry_count": current_retry + 1}
    except Exception as e:
        logger.error(f"Error incrementing retry: {e}")
        raise HTTPException(status_code=500, detail=str(e))
