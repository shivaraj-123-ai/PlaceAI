import React, { useEffect, useState } from 'react';
import { Award, Download, Share2, RotateCcw, AlertTriangle, FileText, ChevronRight, HelpCircle, ShieldCheck, Check, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '../utils/api';
import confetti from 'canvas-confetti';
import { jsPDF } from 'jspdf';
import ScoreRing from '../components/ScoreRing';

export default function FeedbackReport({ sessionId, companyMode, candidateName, onReset, onRetry, API_URL }) {
  const [report, setReport] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReport() {
      setLoading(true);
      try {
        const sessionRes = await apiFetch(`${API_URL}/api/sessions/${sessionId}`);
        const sessionData = await sessionRes.json();
        
        setRetryCount(sessionData.retry_count || 0);

        if (sessionData.feedback_report) {
          setReport(sessionData.feedback_report);
          
          // Trigger confetti if score >= 80
          if (sessionData.feedback_report.overall_score >= 80) {
            confetti({
              particleCount: 100,
              spread: 70,
              origin: { y: 0.6 }
            });
          }
        }
      } catch (err) {
        console.error("Error loading feedback report:", err);
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, [sessionId, API_URL]);

  const handleRetryClick = async () => {
    if (retryCount >= 2) return;
    
    setLoading(true);
    try {
      const retryRes = await apiFetch(`${API_URL}/api/sessions/${sessionId}/retry`, {
        method: 'POST'
      });
      const retryData = await retryRes.json();
      
      onRetry(retryData.retry_count);
    } catch (e) {
      console.error("Error setting up interview retry:", e);
      setLoading(false);
    }
  };

  const handleDownloadPdf = () => {
    if (!report) return;

    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(10, 15, 30); // Navy Blue Banner
    doc.rect(0, 0, 210, 45, "F");
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(200, 149, 42); // Gold
    doc.text("PLACEAI EVALUATION REPORT", 15, 20);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(156, 163, 175);
    doc.text(`Candidate: ${candidateName}   |   Recruitment Mode: ${companyMode}`, 15, 28);
    doc.text(`Attempts Count: ${retryCount + 1} / 3`, 15, 34);

    // Score metrics
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(10, 15, 30);
    doc.text("1. Overall Score Card", 15, 60);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(60, 60, 60);
    doc.text(`Overall Score: ${report.overall_score} / 100 (${report.grade})`, 18, 70);

    // Breakdown
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(10, 15, 30);
    doc.text("Breakdown metrics:", 18, 82);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    let y = 92;
    Object.entries(report.breakdown).forEach(([key, value]) => {
      doc.text(`- ${key.toUpperCase().replace('_', ' ')}: ${value}/100`, 22, y);
      y += 8;
    });

    // Best moment & needs improvement
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(10, 15, 30);
    doc.text("2. Answer Analytics", 15, y);
    
    y += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Your Best Moment:", 18, y);
    y += 6;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    const splitBestQ = doc.splitTextToSize(`Question: "${report.best_moment.question_text}"`, 180);
    doc.text(splitBestQ, 18, y);
    y += splitBestQ.length * 5;
    
    doc.setFont("helvetica", "normal");
    const splitBestReason = doc.splitTextToSize(`Reason: ${report.best_moment.reason}`, 180);
    doc.text(splitBestReason, 18, y);
    y += splitBestReason.length * 5 + 4;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(10, 15, 30);
    doc.text("Needs Improvement Area:", 18, y);
    y += 6;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    const splitWeakQ = doc.splitTextToSize(`Question: "${report.needs_improvement.question_text}"`, 180);
    doc.text(splitWeakQ, 18, y);
    y += splitWeakQ.length * 5;
    
    doc.setFont("helvetica", "normal");
    const splitWeakMissing = doc.splitTextToSize(`Missing Details: ${report.needs_improvement.missing}`, 180);
    doc.text(splitWeakMissing, 18, y);
    y += splitWeakMissing.length * 5 + 4;

    // Add new page for plan & speech
    doc.addPage();
    
    doc.setFillColor(10, 15, 30); // Header block
    doc.rect(0, 0, 210, 20, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(200, 149, 42);
    doc.text("PLACEAI PERSONALIZED FEEDBACK & STUDY GUIDE", 15, 13);

    let y2 = 40;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(10, 15, 30);
    doc.text("3. Speech & Pacing Metrics", 15, y2);
    
    y2 += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);
    doc.text(`- Speaking Pace: ${report.speech_analysis.speaking_pace}`, 18, y2);
    y2 += 8;
    doc.text(`- Speech Clarity: ${report.speech_analysis.clarity_score} / 100`, 18, y2);
    y2 += 8;
    doc.text(`- Hesitations / Long Silence Gaps: ${report.speech_analysis.silence_gaps_count} detected`, 18, y2);
    y2 += 8;
    
    const fillersUsed = Object.entries(report.speech_analysis.filler_words)
      .map(([word, count]) => `"${word}": ${count} times`)
      .join(', ');
    doc.text(`- Filler Words Used: ${fillersUsed}`, 18, y2);

    // Action items
    y2 += 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(10, 15, 30);
    doc.text("4. Personalized Actions & Study Schedule", 15, y2);
    
    y2 += 10;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Top 3 Action Items:", 18, y2);
    
    y2 += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    report.top_3_action_items.forEach((item, idx) => {
      doc.text(`${idx + 1}. ${item}`, 22, y2);
      y2 += 8;
    });

    y2 += 4;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Study Plan Recommendations:", 18, y2);
    
    y2 += 6;
    doc.setFont("helvetica", "normal");
    const splitRecs = doc.splitTextToSize(report.study_plan.recommendations, 180);
    doc.text(splitRecs, 18, y2);
    y2 += splitRecs.length * 5 + 4;
    
    doc.text(`Estimated Preparation Duration: ${report.study_plan.estimated_time}`, 18, y2);

    doc.save(`PlaceAI_Placement_Report_${candidateName}.pdf`);
  };

  const handleShareLinkedin = () => {
    if (!report) return;
    const text = `I just completed a simulated placement training on PlaceAI and achieved an overall evaluation score of ${report.overall_score}/100! 🚀\n\nTargeting: ${companyMode}\nCandidate Rating: ${report.grade}\n\nPrepare your interviews with PlaceAI placement coach today.`;
    const shareUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank');
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 flex flex-col items-center justify-center text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold mb-4"></div>
        <p className="text-sm font-semibold text-gold animate-pulse">Loading Placement Report...</p>
      </div>
    );
  }

  if (!report || typeof report !== 'object' || Array.isArray(report) || !report.breakdown) {
    return (
      <div className="max-w-md mx-auto text-center py-20 bg-darkcard rounded-xl border border-white/5 p-6 glass-panel">
        <AlertTriangle className="w-12 h-12 text-gold mx-auto mb-4" />
        <h3 className="text-lg font-bold text-white mb-2">No Report Found</h3>
        <p className="text-xs text-gray-500 mb-6">Complete all rounds to generate analysis sheets or reset the session.</p>
        <button onClick={onReset} className="px-4 py-2 bg-gold text-navy font-bold rounded">Start Over</button>
      </div>
    );
  }

  // Chart data formatting
  const chartData = Object.entries(report.breakdown).map(([key, value]) => ({
    metric: key.toUpperCase().replace('_', ' '),
    Score: value
  }));

  const ringColor = report.overall_score >= 85 ? '#c8952a' : (report.overall_score >= 70 ? '#10b981' : (report.overall_score >= 55 ? '#f59e0b' : '#ef4444'));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-fade-in">
      
      {/* Top Banner section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-6 gap-6">
        <div>
          <span className="text-xs uppercase tracking-widest text-gold font-bold">Round 4 of 4 Completed</span>
          <h2 className="text-3xl font-extrabold text-white mt-1">Placement Feedback Report</h2>
          <p className="text-xs text-gray-400 mt-1">
            Detailed performance review compiled by Gemini 1.5 Flash based on resume skills and answer pacing.
          </p>
        </div>
        
        {/* PDF & LinkedIn Share buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleDownloadPdf}
            className="bg-navy-light hover:bg-navy border border-white/10 hover:border-gold/30 text-white font-bold py-2.5 px-4 rounded-lg text-xs flex items-center gap-2 transition-all"
          >
            <Download className="w-4 h-4 text-gold" />
            <span>Download Report</span>
          </button>
          
          <button
            onClick={handleShareLinkedin}
            className="bg-navy-light hover:bg-navy border border-white/10 hover:border-gold/30 text-white font-bold py-2.5 px-4 rounded-lg text-xs flex items-center gap-2 transition-all"
          >
            <Share2 className="w-4 h-4 text-gold" />
            <span>Share on LinkedIn</span>
          </button>
        </div>
      </div>

      {/* Top score row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        
        {/* Score Ring Display */}
        <div className="lg:col-span-4 bg-darkcard border border-white/5 p-6 rounded-2xl glass-panel flex flex-col items-center justify-center text-center">
          <ScoreRing score={report.overall_score} />
          <p className="text-xs text-gray-400 mt-4 max-w-xs leading-relaxed">
            Weighted Score: 20% Aptitude, 30% HR Communication, 30% Tech accuracy, 10% Confidence, 10% Structure/STAR.
          </p>
        </div>

        {/* Recharts chart */}
        <div className="lg:col-span-8 bg-darkcard border border-white/5 p-6 rounded-2xl glass-panel">
          <h3 className="text-base font-bold text-white mb-4">Competency Breakdown</h3>
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, left: 15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" stroke="#9ca3af" fontSize={10} tickLine={false} domain={[0, 100]} />
                <YAxis dataKey="metric" type="category" stroke="#9ca3af" fontSize={9} tickLine={false} width={110} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }} 
                  labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                />
                <Bar dataKey="Score" fill="#c8952a" radius={[0, 4, 4, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Comparisons Section (if retry count > 0) */}
      {retryCount > 0 && (
        <div className="bg-green-950/15 border border-green-500/20 p-5 rounded-2xl glass-panel text-green-300 text-xs flex gap-3 items-center">
          <Info className="w-5 h-5 shrink-0 text-green-400" />
          <div>
            <strong>Pacing Comparison:</strong> Attempt **{retryCount + 1}** completed. Communication scoring weights adjusted relative to previous attempt. Review your speech analysis below to verify improvements.
          </div>
        </div>
      )}

      {/* 6 Analysis Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        
        {/* Card 1: Where You Got Stuck */}
        <div className="bg-darkcard border border-white/5 p-5 rounded-xl glass-panel flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-gold uppercase tracking-widest font-bold block mb-2">Card 1</span>
            <h4 className="text-base font-bold text-white mb-3">Where You Got Stuck</h4>
            <div className="space-y-3">
              {report.where_you_got_stuck && report.where_you_got_stuck.length > 0 ? (
                report.where_you_got_stuck.map((stuck, idx) => (
                  <div key={idx} className="bg-white/5 border border-white/5 p-2 rounded text-xs space-y-1.5">
                    <p className="text-white italic line-clamp-2">"{stuck.question_text}"</p>
                    <p className="text-red-400 font-semibold">Paused for {stuck.pause_seconds} seconds</p>
                    <p className="text-gray-400 leading-normal">{stuck.suggestion}</p>
                  </div>
                ))
              ) : (
                <div className="flex items-center gap-2 text-green-400 text-xs py-4">
                  <ShieldCheck className="w-5 h-5" />
                  <span>No severe silence gaps detected. Excellent flow!</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Your Best Moment */}
        <div className="bg-darkcard border border-white/5 p-5 rounded-xl glass-panel flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-gold uppercase tracking-widest font-bold block mb-2">Card 2</span>
            <h4 className="text-base font-bold text-white mb-3">Your Best Moment</h4>
            <div className="bg-green-950/10 border border-green-500/10 p-3.5 rounded text-xs space-y-2">
              <span className="bg-green-500/15 text-green-400 border border-green-500/30 px-2 py-0.5 rounded text-[10px] font-bold">
                SCORE: {report.best_moment.score}/100
              </span>
              <p className="text-white italic leading-relaxed">
                "{report.best_moment.question_text}"
              </p>
              <p className="text-gray-400 leading-relaxed">
                <strong>Why it succeeded:</strong> {report.best_moment.reason}
              </p>
            </div>
          </div>
        </div>

        {/* Card 3: Needs Improvement */}
        <div className="bg-darkcard border border-white/5 p-5 rounded-xl glass-panel flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-gold uppercase tracking-widest font-bold block mb-2">Card 3</span>
            <h4 className="text-base font-bold text-white mb-3">Needs Improvement</h4>
            <div className="bg-red-950/10 border border-red-500/10 p-3.5 rounded text-xs space-y-2">
              <p className="text-white italic line-clamp-2">
                "{report.needs_improvement.question_text}"
              </p>
              <p className="text-red-400">
                <strong>Missing component:</strong> {report.needs_improvement.missing}
              </p>
              <p className="text-gray-400 leading-relaxed">
                <strong>Improvement Template:</strong> {report.needs_improvement.how_to_improve}
              </p>
            </div>
          </div>
        </div>

        {/* Card 4: Speech Analysis */}
        <div className="bg-darkcard border border-white/5 p-5 rounded-xl glass-panel flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-gold uppercase tracking-widest font-bold block mb-2">Card 4</span>
            <h4 className="text-base font-bold text-white mb-3">Speech Analysis</h4>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="bg-white/5 border border-white/5 p-2 rounded">
                  <span className="text-[9px] uppercase tracking-wider text-gray-500">Speaking Pace</span>
                  <p className="text-sm font-bold text-white mt-0.5">{report.speech_analysis.speaking_pace}</p>
                </div>
                <div className="bg-white/5 border border-white/5 p-2 rounded">
                  <span className="text-[9px] uppercase tracking-wider text-gray-500">Speech Clarity</span>
                  <p className="text-sm font-bold text-white mt-0.5">{report.speech_analysis.clarity_score}/100</p>
                </div>
              </div>
              
              <div className="bg-white/5 border border-white/5 p-3 rounded space-y-2">
                <span className="text-[10px] uppercase font-bold text-gray-500">Filler Words count:</span>
                <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] font-bold">
                  {Object.entries(report.speech_analysis.filler_words).map(([word, count]) => (
                    <div key={word} className="bg-navy-dark border border-white/5 p-1 rounded">
                      <span className="text-gold block font-mono">"{word}"</span>
                      <span className="text-white block mt-0.5">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-gray-400 leading-normal">
                Silence gaps detected: <strong>{report.speech_analysis.silence_gaps_count}</strong> times. Try pausing silently rather than saying umm.
              </p>
            </div>
          </div>
        </div>

        {/* Card 5: Action Items */}
        <div className="bg-darkcard border border-white/5 p-5 rounded-xl glass-panel flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-gold uppercase tracking-widest font-bold block mb-2">Card 5</span>
            <h4 className="text-base font-bold text-white mb-3">Top 3 Action Items</h4>
            <div className="space-y-3">
              {report.top_3_action_items.map((item, idx) => (
                <div key={idx} className="flex gap-2.5 items-start text-xs leading-relaxed text-gray-300">
                  <span className="w-5 h-5 rounded bg-gold/10 text-gold flex items-center justify-center font-bold shrink-0 text-[10px] mt-0.5">
                    {idx + 1}
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 6: Personalised Study Plan */}
        <div className="bg-darkcard border border-white/5 p-5 rounded-xl glass-panel flex flex-col justify-between">
          <div>
            <span className="text-[10px] text-gold uppercase tracking-widest font-bold block mb-2">Card 6</span>
            <h4 className="text-base font-bold text-white mb-3">Study Plan & Schedule</h4>
            <div className="space-y-3 text-xs leading-relaxed text-gray-300">
              <p className="bg-white/5 border border-white/5 p-3 rounded text-gray-400">
                {report.study_plan.recommendations}
              </p>
              <div className="flex items-center justify-between bg-gold/5 border border-gold/10 p-2.5 rounded text-gold">
                <span className="font-semibold">Recommended Time:</span>
                <span className="font-bold">{report.study_plan.estimated_time}</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Lower Actions & retry panels */}
      <div className="bg-darkcard border border-white/10 p-6 rounded-2xl glass-panel flex flex-col md:flex-row items-center justify-between gap-6">
        <div>
          <h3 className="text-lg font-bold text-white">Ready to iterate?</h3>
          <p className="text-xs text-gray-400 mt-1">
            Re-run rounds 2 & 3 to apply action items and improve your communication pacing metrics.
          </p>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          {retryCount < 2 ? (
            <button
              onClick={handleRetryClick}
              className="bg-gold hover:bg-gold-dark text-navy font-bold py-3 px-6 rounded-lg text-sm transition-all shadow-md hover:shadow-gold/30 flex items-center gap-2 uppercase tracking-wide w-full md:w-auto justify-center"
            >
              <RotateCcw className="w-4.5 h-4.5" />
              <span>Retry Interview ({2 - retryCount} left)</span>
            </button>
          ) : (
            <div className="text-xs border border-white/10 bg-white/5 px-4 py-2.5 rounded-lg text-gray-500 font-semibold text-center w-full md:w-auto">
              Retries Limit Reached (3 attempts used)
            </div>
          )}

          <button
            onClick={onReset}
            className="bg-navy border border-white/10 hover:border-gold/30 text-white font-bold py-3 px-6 rounded-lg text-sm transition-all hover:bg-navy-light w-full md:w-auto justify-center flex items-center"
          >
            Start New Session
          </button>
        </div>
      </div>

    </div>
  );
}
