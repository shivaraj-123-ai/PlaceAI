import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Header from './components/Header';
import LandingPage from './pages/LandingPage';
import AptitudeRound from './pages/AptitudeRound';
import IntroRound from './pages/IntroRound';
import TechRound from './pages/TechRound';
import FeedbackReport from './pages/FeedbackReport';
import { apiFetch } from './utils/api';

// Define Backend API Base URL
const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:8080').trim();

export default function App() {
  const [sessionId, setSessionId] = useState(null);
  const [currentRound, setCurrentRound] = useState(0); // 0: Landing, 1: Aptitude, 2: Intro, 3: Tech, 4: Feedback
  const [companyMode, setCompanyMode] = useState('General');
  const [candidateName, setCandidateName] = useState('Guest');
  const [resumeData, setResumeData] = useState(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [apiLoading, setApiLoading] = useState(false);
  const [apiStatusMessage, setApiStatusMessage] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const streamRef = useRef(null);

  useEffect(() => {
    const handleApiStart = (e) => {
      setApiLoading(true);
      setApiStatusMessage(e.detail?.message || 'Loading...');
    };
    const handleApiProgress = (e) => {
      setApiStatusMessage(e.detail?.message || 'Loading...');
    };
    const handleApiEnd = () => {
      setApiLoading(false);
      setApiStatusMessage('');
    };

    window.addEventListener('api-start', handleApiStart);
    window.addEventListener('api-progress', handleApiProgress);
    window.addEventListener('api-end', handleApiEnd);

    return () => {
      window.removeEventListener('api-start', handleApiStart);
      window.removeEventListener('api-progress', handleApiProgress);
      window.removeEventListener('api-end', handleApiEnd);
    };
  }, []);

  // 1. Session Persistence Recovery
  useEffect(() => {
    async function restoreSession() {
      const storedSessionId = localStorage.getItem('placeai_session_id');
      const storedRound = localStorage.getItem('placeai_current_round');

      if (!storedSessionId) {
        setLoading(false);
        return;
      }

      try {
        const response = await apiFetch(`${API_URL}/api/sessions/${storedSessionId}`);
        if (!response.ok) {
          throw new Error("Persisted session not found in database.");
        }
        
        const session = await response.json();
        
        setSessionId(session.id);
        setCompanyMode(session.company_mode);
        setCandidateName(session.candidate_name || 'Guest');
        setResumeData(session.resume_data);
        
        // Smart recovery fallback based on DB status
        if (session.feedback_report && typeof session.feedback_report === 'object' && !Array.isArray(session.feedback_report) && session.feedback_report.overall_score !== undefined) {
          setCurrentRound(4);
        } else if (storedRound) {
          setCurrentRound(parseInt(storedRound));
        } else if (session.interview_questions_round3) {
          setCurrentRound(3);
        } else if (session.interview_questions_round2) {
          setCurrentRound(2);
        } else if (session.resume_data) {
          setCurrentRound(1);
        } else {
          setCurrentRound(0);
        }
      } catch (err) {
        console.warn("Session restore failed, starting fresh:", err);
        localStorage.removeItem('placeai_session_id');
        localStorage.removeItem('placeai_current_round');
      } finally {
        setLoading(false);
      }
    }
    restoreSession();
  }, []);

  // Cleanup stream when session ends or goes back to landing
  useEffect(() => {
    if ((currentRound === 0 || currentRound === 4) && streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.warn("Error stopping stream tracks:", e);
      }
      streamRef.current = null;
    }
  }, [currentRound]);

  const handleSessionCreated = (id, company, name, parsedResume) => {
    setSessionId(id);
    setCompanyMode(company);
    setCandidateName(name || 'Guest');
    setResumeData(parsedResume);
    setCurrentRound(1);
    
    localStorage.setItem('placeai_session_id', id);
    localStorage.setItem('placeai_current_round', '1');
  };

  const advanceRound = (nextRound) => {
    setCurrentRound(nextRound);
    localStorage.setItem('placeai_current_round', nextRound.toString());
  };

  const handleReset = () => {
    setShowResetConfirm(true);
  };

  const confirmReset = async () => {
    setShowResetConfirm(false);
    if (sessionId) {
      try {
        await apiFetch(`${API_URL}/api/sessions/${sessionId}`, {
          method: 'DELETE'
        });
      } catch (err) {
        console.error("Failed to delete session on server:", err);
      }
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(track => track.stop());
      } catch (e) {
        console.error("Failed to stop stream tracks on reset:", e);
      }
      streamRef.current = null;
    }
    setSessionId(null);
    setCurrentRound(0);
    setCompanyMode('General');
    setCandidateName('Guest');
    setResumeData(null);
    localStorage.removeItem('placeai_session_id');
    localStorage.removeItem('placeai_current_round');
  };

  const handleRetry = (newRetryCount) => {
    // Navigate back to Round 2 (Intro Interview)
    setCurrentRound(2);
    localStorage.setItem('placeai_current_round', '2');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-navy text-white flex flex-col items-center justify-center p-6">
        <div className="relative w-16 h-16 mb-4 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-4 border-gold/10 border-t-gold animate-spin" />
          <Sparkles className="w-6 h-6 text-gold" />
        </div>
        <p className="text-sm font-semibold text-gold animate-pulse">Restoring PlaceAI Placement Session...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy text-white flex flex-col justify-between">
      <div>
        <Header 
          currentRound={currentRound} 
          companyMode={companyMode} 
          candidateName={candidateName}
          onReset={currentRound > 0 ? handleReset : null}
        />
        
        <main className="w-full">
          {currentRound === 0 && (
            <LandingPage 
              onSessionCreated={handleSessionCreated} 
              API_URL={API_URL} 
            />
          )}

          {currentRound === 1 && sessionId && (
            <AptitudeRound 
              sessionId={sessionId} 
              API_URL={API_URL} 
              onNextRound={() => advanceRound(2)}
            />
          )}

          {currentRound === 2 && sessionId && (
            <IntroRound 
              sessionId={sessionId} 
              candidateName={candidateName}
              API_URL={API_URL} 
              cameraStreamRef={streamRef}
              onNextRound={() => advanceRound(3)}
            />
          )}

          {currentRound === 3 && sessionId && (
            <TechRound 
              sessionId={sessionId} 
              candidateName={candidateName}
              API_URL={API_URL} 
              cameraStreamRef={streamRef}
              onNextRound={() => advanceRound(4)}
            />
          )}

          {currentRound === 4 && sessionId && (
            <FeedbackReport 
              sessionId={sessionId} 
              companyMode={companyMode}
              candidateName={candidateName}
              API_URL={API_URL} 
              onReset={handleReset}
              onRetry={handleRetry}
            />
          )}
        </main>
      </div>

      {/* Premium Footer */}
      <footer className="w-full border-t border-white/5 py-4 text-center text-xs text-gray-500 bg-navy-dark/40 mt-12">
        <p>© 2026 PlaceAI. Powered by Google Gemini 1.5 Flash. All feedback is generated locally client-side and server-side.</p>
      </footer>

      {/* Global API Loading / Retry Overlay */}
      {apiLoading && (
        <div className="fixed inset-0 bg-navy/80 backdrop-blur-md z-[9999] flex flex-col items-center justify-center p-6 text-center animate-fade-in">
          <div className="relative w-20 h-20 mb-6 flex items-center justify-center">
            {/* Spinning gold ring */}
            <div className="absolute inset-0 rounded-full border-4 border-gold/10 border-t-gold animate-spin" />
            {/* Pulsing inner sparkles */}
            <div className="w-12 h-12 bg-gold/10 rounded-full flex items-center justify-center border border-gold/30 animate-pulse">
              <Sparkles className="w-6 h-6 text-gold" />
            </div>
          </div>
          <div className="space-y-3 max-w-md">
            <h3 className="text-xl font-bold text-white tracking-wide">Processing Request</h3>
            <p className="text-sm text-gold font-medium animate-pulse whitespace-pre-line">
              {apiStatusMessage}
            </p>
            <p className="text-xs text-gray-400">
              Please do not refresh the page or click away.
            </p>
          </div>
        </div>
      )}

      {/* Warning confirmation popup */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
            {/* Dark Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 bg-black/75 backdrop-blur-sm"
              onClick={() => setShowResetConfirm(false)}
            />

            {/* Popup Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white text-gray-900 rounded-xl shadow-2xl p-6 max-w-md w-full relative z-10 mx-auto"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-50 rounded-full text-red-600 shrink-0">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                    Start a New Session?
                  </h3>
                  <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                    All your current progress will be permanently lost. This cannot be undone.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-300 hover:border-gray-400 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmReset}
                  className="w-full sm:w-auto px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 rounded-lg transition-colors cursor-pointer text-center shadow-md hover:shadow-red-500/20"
                >
                  Yes, Start Over
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
