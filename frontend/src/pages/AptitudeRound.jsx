import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, CheckCircle, Clock, RotateCcw, AlertCircle, Bookmark, BarChart as ChartIcon, Check, X, ArrowRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../utils/api';

export default function AptitudeRound({ sessionId, onNextRound, API_URL }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // { "1": "A", "2": "C" }
  const [markedForReview, setMarkedForReview] = useState({}); // { "1": true }
  
  // Timer state: 30 minutes in seconds (1800)
  const [timeLeft, setTimeLeft] = useState(1800);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [testActive, setTestActive] = useState(true);

  // Result state
  const [result, setResult] = useState(null);
  const [aptitudeRetryCount, setAptitudeRetryCount] = useState(0);

  // Fetch or generate questions on load
  useEffect(() => {
    async function loadAptitude() {
      setLoading(true);
      try {
        // Fetch session first to check if questions already exist
        const sessionRes = await apiFetch(`${API_URL}/api/sessions/${sessionId}`);
        const sessionData = await sessionRes.json();
        
        if (sessionData.aptitude_questions && sessionData.aptitude_questions.length > 0) {
          setQuestions(sessionData.aptitude_questions);
          // If already has results, show results screen instead of active test
          if (sessionData.aptitude_result) {
            setResult(sessionData.aptitude_result);
            setAptitudeRetryCount(sessionData.aptitude_retry_count || 0);
            setTestActive(false);
          }
        } else {
          // Generate new questions
          const genRes = await apiFetch(`${API_URL}/api/sessions/${sessionId}/aptitude/questions`, {
            method: 'POST'
          });
          const genData = await genRes.json();
          setQuestions(genData.questions);
        }
      } catch (err) {
        console.error("Error loading aptitude questions:", err);
      } finally {
        setLoading(false);
      }
    }
    loadAptitude();
  }, [sessionId, API_URL]);

  // Timer loop
  useEffect(() => {
    if (!testActive || loading || questions.length === 0) return;

    if (timeLeft <= 0) {
      setIsTimeUp(true);
      handleSubmit();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, testActive, loading, questions]);

  const handleSelectOption = (qIdx, option) => {
    setAnswers(prev => ({
      ...prev,
      [qIdx]: option
    }));
  };

  const toggleMarkForReview = (qIdx) => {
    setMarkedForReview(prev => ({
      ...prev,
      [qIdx]: !prev[qIdx]
    }));
  };

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const handleSubmit = async () => {
    setTestActive(false);
    setLoading(true);
    
    const timeSpent = 1800 - timeLeft;
    
    try {
      const submitRes = await apiFetch(`${API_URL}/api/sessions/${sessionId}/aptitude/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: answers,
          time_taken: timeSpent
        })
      });
      
      const submitData = await submitRes.json();
      setResult(submitData.result);
      setAptitudeRetryCount(submitData.aptitude_retry_count);
    } catch (err) {
      console.error("Error submitting answers:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    setLoading(true);
    setResult(null);
    setAnswers({});
    setMarkedForReview({});
    setTimeLeft(1800);
    setIsTimeUp(false);
    
    try {
      const genRes = await apiFetch(`${API_URL}/api/sessions/${sessionId}/aptitude/questions`, {
        method: 'POST'
      });
      const genData = await genRes.json();
      setQuestions(genData.questions);
      setTestActive(true);
    } catch (err) {
      console.error("Error regenerating aptitude test:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 flex flex-col items-center justify-center text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold mb-4"></div>
        <p className="text-sm font-semibold text-gold animate-pulse">Loading Aptitude Test Environment...</p>
        <p className="text-xs text-gray-500 mt-1">Generating MCQs tailored to your resume skills...</p>
      </div>
    );
  }

  // Active Test layout
  if (testActive && questions.length > 0) {
    const q = questions[currentIdx];
    const qIdxStr = q.question_index.toString();
    const selectedOpt = answers[qIdxStr] || '';
    const isMarked = markedForReview[qIdxStr] || false;
    const isFiveMinLeft = timeLeft <= 300;

    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        
        {/* Test Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-4 mb-6 gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-gold">Round 1 of 4</span>
            <h2 className="text-2xl font-bold text-white mt-1">Aptitude Filter</h2>
          </div>
          <div className="flex items-center gap-4">
            {/* Timer */}
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-bold text-sm transition-colors ${
              isFiveMinLeft 
                ? 'bg-red-950/20 border-red-500 text-red-400 animate-pulse' 
                : 'bg-navy-dark border-white/10 text-white'
            }`}>
              <Clock className="w-4 h-4 text-gold" />
              <span>Time Remaining: {formatTime(timeLeft)}</span>
            </div>
            
            <button
              onClick={handleSubmit}
              className="bg-gold hover:bg-gold-dark text-navy font-bold px-5 py-2 rounded-lg text-sm shadow transition-all duration-300"
            >
              Submit Test
            </button>
          </div>
        </div>

        {/* Questions Grid & Nav Panel */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Main Question Box */}
          <div className="lg:col-span-8 bg-darkcard border border-white/5 p-6 rounded-xl glass-panel space-y-6">
            
            {/* Index & Category tag */}
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <span className="text-xs font-bold text-gray-400 uppercase">
                Question {currentIdx + 1} of {questions.length}
              </span>
              <span className="text-xs bg-gold/15 text-gold border border-gold/30 px-3 py-1 rounded-full font-semibold">
                {q.category}
              </span>
            </div>

            {/* Question Text */}
            <p className="text-lg text-white font-medium leading-relaxed">
              {q.question_text}
            </p>

            {/* Options List */}
            <div className="space-y-3">
              {Object.entries(q.options).map(([optKey, optText]) => {
                const isSelected = selectedOpt === optKey;
                return (
                  <button
                    key={optKey}
                    onClick={() => handleSelectOption(qIdxStr, optKey)}
                    className={`w-full text-left p-4 rounded-lg border transition-all flex items-start gap-3 ${
                      isSelected
                        ? 'bg-gold/15 border-gold text-white shadow shadow-gold/15'
                        : 'bg-navy-dark border-white/5 text-gray-300 hover:border-white/20'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                      isSelected ? 'bg-gold text-navy' : 'bg-white/10 text-gray-400'
                    }`}>
                      {optKey}
                    </span>
                    <span className="text-sm font-medium">{optText}</span>
                  </button>
                );
              })}
            </div>

            {/* Navigation buttons inside question box */}
            <div className="flex items-center justify-between pt-4 border-t border-white/5">
              <button
                onClick={() => toggleMarkForReview(qIdxStr)}
                className={`flex items-center gap-1 px-4 py-2 rounded-lg text-xs font-semibold border transition-all ${
                  isMarked
                    ? 'bg-yellow-950/20 border-yellow-500 text-yellow-400'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                {isMarked ? 'Marked for Review' : 'Mark for Review'}
              </button>

              <div className="flex items-center gap-3">
                <button
                  onClick={() => setCurrentIdx(prev => Math.max(0, prev - 1))}
                  disabled={currentIdx === 0}
                  className={`p-2 rounded-lg border flex items-center gap-1 text-xs font-semibold ${
                    currentIdx === 0
                      ? 'border-white/5 text-gray-700 cursor-not-allowed'
                      : 'border-white/10 text-gray-300 hover:bg-white/5'
                  }`}
                >
                  ← Back
                </button>

                <span className="text-xs font-semibold text-gray-400">
                  Question {currentIdx + 1} of {questions.length}
                </span>

                <button
                  onClick={() => setCurrentIdx(prev => Math.min(questions.length - 1, prev + 1))}
                  disabled={currentIdx === questions.length - 1}
                  className={`p-2 rounded-lg border flex items-center gap-1 text-xs font-semibold ${
                    currentIdx === questions.length - 1
                      ? 'border-white/5 text-gray-700 cursor-not-allowed'
                      : 'border-white/10 text-gray-300 hover:bg-white/5'
                  }`}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>

          {/* Side navigation matrix */}
          <div className="lg:col-span-4 bg-darkcard border border-white/5 p-4 rounded-xl glass-panel space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Question Palette</h3>
            
            <div className="grid grid-cols-5 gap-2">
              {questions.map((item, idx) => {
                const keyStr = item.question_index.toString();
                const answered = !!answers[keyStr];
                const marked = !!markedForReview[keyStr];
                const active = idx === currentIdx;

                let btnClass = "bg-navy-dark border-white/5 text-gray-400";
                if (active) btnClass = "bg-gold text-navy font-bold border-gold";
                else if (marked) btnClass = "bg-yellow-950/40 border-yellow-500 text-yellow-400";
                else if (answered) btnClass = "bg-green-950/20 border-green-500/30 text-green-400";

                return (
                  <button
                    key={idx}
                    onClick={() => setCurrentIdx(idx)}
                    className={`h-9 w-full rounded flex items-center justify-center text-xs font-semibold transition-all border ${btnClass}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>

            {/* Legend indicators */}
            <div className="border-t border-white/5 pt-3 space-y-2 text-[10px] text-gray-400">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-green-950/20 border border-green-500/30 inline-block" />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-yellow-950/40 border border-yellow-500 inline-block" />
                <span>Marked for Review</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded bg-navy-dark border border-white/5 inline-block" />
                <span>Not Attempted</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // Result screen layout
  if (result) {
    const passed = result.score >= 9;
    const chartData = Object.entries(result.breakdown).map(([cat, data]) => ({
      category: cat,
      Score: data.correct,
      Total: data.total
    }));

    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-8 animate-scale-up">
        
        {/* Score Card Banner */}
        <div className={`p-8 rounded-2xl glass-panel border flex flex-col md:flex-row items-center justify-between gap-6 ${
          passed 
            ? 'bg-green-950/15 border-green-500/20 shadow-lg shadow-green-500/5' 
            : 'bg-red-950/15 border-red-500/20 shadow-lg shadow-red-500/5'
        }`}>
          <div>
            <span className={`text-xs uppercase tracking-widest font-bold ${passed ? 'text-green-400' : 'text-red-400'}`}>
              {passed ? 'Congratulations!' : 'Aptitude filter failed'}
            </span>
            <h2 className="text-3xl font-extrabold text-white mt-1">
              Score: {result.score} / {result.total_questions}
            </h2>
            <p className="text-sm text-gray-400 mt-2 max-w-md">
              {passed 
                ? "Excellent performance. You have successfully cleared the cut-off score of 60% (9/15) to advance to the face-to-face rounds."
                : `You scored ${result.score}/15. A minimum score of 9 is required to pass this stage.`}
            </p>
            <div className="flex items-center gap-4 text-xs mt-3 text-gray-300 font-medium">
              <span>Time Spent: {Math.floor(result.time_taken_seconds / 60)}m {result.time_taken_seconds % 60}s</span>
              <span>•</span>
              <span className="text-green-400">{result.correct_count} Correct</span>
              <span>•</span>
              <span className="text-red-400">{result.wrong_count} Wrong</span>
              <span>•</span>
              <span className="text-gray-400">{result.skipped_count} Skipped</span>
            </div>
          </div>

          <div className="shrink-0 text-center">
            {passed ? (
              <button
                onClick={onNextRound}
                className="bg-gradient-to-r from-gold-dark via-gold to-gold-light text-navy font-bold py-3 px-6 rounded-lg text-sm shadow hover:shadow-gold/30 hover:scale-102 transition-all flex items-center gap-2 uppercase tracking-wide"
              >
                Proceed to Round 2
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : aptitudeRetryCount < 2 ? (
              <div className="space-y-2">
                <button
                  onClick={handleRetry}
                  className="bg-gold hover:bg-gold-dark text-navy font-bold py-3 px-6 rounded-lg text-sm shadow transition-all flex items-center gap-2 uppercase tracking-wide justify-center w-full"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retry Aptitude Test
                </button>
                <span className="text-[10px] text-gray-400 block">
                  ({2 - aptitudeRetryCount} of 2 retries remaining)
                </span>
              </div>
            ) : (
              <div className="text-center p-3 border border-red-500/30 rounded-lg bg-red-950/20 max-w-[220px]">
                <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-1" />
                <span className="text-xs text-red-200 font-bold block">Maximum retries reached</span>
                <span className="text-[10px] text-gray-400 block mt-1">Practice and return later!</span>
              </div>
            )}
          </div>
        </div>

        {/* Category Graph Breakdown */}
        <div className="bg-darkcard border border-white/5 p-6 rounded-xl glass-panel">
          <div className="flex items-center gap-2 mb-6">
            <ChartIcon className="w-5 h-5 text-gold" />
            <h3 className="text-lg font-bold text-white">Score Breakdown by Category</h3>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="category" stroke="#9ca3af" fontSize={11} tickLine={false} />
                <YAxis stroke="#9ca3af" fontSize={11} tickLine={false} allowDecimals={false} domain={[0, 5]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} 
                  labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                />
                <Bar dataKey="Score" fill="#c8952a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Total" fill="rgba(255,255,255,0.05)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Question-by-Question Review */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white mb-2">Question Review & Explanations</h3>
          
          {result.review.map((rev, index) => {
            return (
              <div key={index} className="bg-darkcard border border-white/5 p-6 rounded-xl glass-panel space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-xs text-gray-400 font-bold uppercase">Question {index + 1}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-white/5 border border-white/10 px-2 py-0.5 rounded text-gray-300">
                      {rev.category}
                    </span>
                    {rev.is_correct ? (
                      <span className="text-xs bg-green-950/20 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                        <Check className="w-3 h-3" /> Correct
                      </span>
                    ) : (
                      <span className="text-xs bg-red-950/20 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full flex items-center gap-1 font-semibold">
                        <X className="w-3 h-3" /> Incorrect
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-white text-sm font-medium leading-relaxed">{rev.question_text}</p>

                {/* Option review */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {Object.entries(rev.options).map(([optKey, optText]) => {
                    const isCorrectOpt = optKey.upper === rev.correct_answer.upper;
                    const isUserSelected = optKey.upper === rev.user_answer.upper;
                    
                    let cardStyle = "bg-navy-dark/40 border-white/5 text-gray-400";
                    if (isCorrectOpt) cardStyle = "bg-green-950/10 border-green-500/30 text-green-300 font-semibold";
                    else if (isUserSelected) cardStyle = "bg-red-950/10 border-red-500/30 text-red-300 font-semibold";

                    return (
                      <div key={optKey} className={`p-3 rounded border flex items-center gap-2 ${cardStyle}`}>
                        <span className="font-bold">{optKey}.</span>
                        <span>{optText}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Explanation */}
                {rev.explanation && (
                  <div className="bg-navy-dark/80 p-3.5 rounded border border-white/5 text-xs text-gray-400">
                    <strong className="text-gold block mb-1">Explanation:</strong>
                    {rev.explanation}
                  </div>
                )}

              </div>
            );
          })}
        </div>

      </div>
    );
  }

  return null;
}
