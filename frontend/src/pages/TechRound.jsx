import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronRight, Video, AlertCircle, Sparkles, MessageSquare, CornerDownRight, Volume2, Mic } from 'lucide-react';
import CameraPreview from '../components/CameraPreview';
import Waveform from '../components/Waveform';
import { apiFetch } from '../utils/api';

export default function TechRound({ sessionId, onNextRound, API_URL, candidateName, cameraStreamRef }) {
  const [stage, setStage] = useState('setup'); // 'setup' | 'interview' | 'generating'
  const [stream, setStream] = useState(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [micTested, setMicTested] = useState(false);
  
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Interview runtime states
  const [transcription, setTranscription] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceTimer, setSilenceTimer] = useState(0);
  const [nudgeMessage, setNudgeMessage] = useState('');
  // Type-in fallback
  const [typedAnswer, setTypedAnswer] = useState('');

  // Metrics trackers
  const [hesitationCount, setHesitationCount] = useState(0);
  const [silenceGaps, setSilenceGaps] = useState(0);
  const [lastSpeechTime, setLastSpeechTime] = useState(Date.now());
  const [speakingStartTime, setSpeakingStartTime] = useState(null);
  const [fillerCounts, setFillerCounts] = useState({
    umm: 0,
    like: 0,
    basically: 0,
    you_know: 0,
    so: 0
  });

  const recognitionRef = useRef(null);
  const silenceNudgeInterval = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const handleStreamReady = useCallback((s) => {
    setStream(s);
    if (cameraStreamRef) {
      cameraStreamRef.current = s;
    }
  }, [cameraStreamRef]);

  // Camera start logic for TechRound
  const startCamera = async () => {
    try {
      let localStream = null;
      if (cameraStreamRef && cameraStreamRef.current) {
        localStream = cameraStreamRef.current;
      } else {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        if (cameraStreamRef) {
          cameraStreamRef.current = localStream;
        }
      }
      if (videoRef.current) {
        videoRef.current.srcObject = localStream;
        await videoRef.current.play();
      }
      streamRef.current = localStream;
      setStream(localStream);
    } catch (err) {
      console.error("Error starting camera in TechRound:", err);
    }
  };

  useEffect(() => {
    if (stage === 'interview' && !cameraDenied) {
      startCamera();
    }
    return () => {
      // Do NOT stop tracks of the shared stream here to let it continue
    };
  }, [stage, cameraDenied]);

  // Load questions
  const startInterview = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/api/sessions/${sessionId}/interview/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round: 3 })
      });
      const data = await res.json();
      setQuestions(data.questions);
      setStage('interview');
      setCurrentIdx(0);
    } catch (err) {
      console.error("Error loading Technical questions:", err);
    } finally {
      setLoading(false);
    }
  };

  // Text to Speech
  const speakQuestion = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(v => v.lang.includes('en-US') || v.lang.includes('en-GB'));
      if (preferred) {
        utterance.voice = preferred;
      }
      
      utterance.onend = () => {
        startRecognition();
      };
      
      window.speechSynthesis.speak(utterance);
    } else {
      startRecognition();
    }
  };

  // Web Speech STT
  const startRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || cameraDenied) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }

    const rec = new SpeechRecognition();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onstart = () => {
      setIsSpeaking(false);
      setLastSpeechTime(Date.now());
      setSpeakingStartTime(Date.now());
    };

    rec.onresult = (event) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (final) {
        setTranscription(prev => prev + final);
        analyzeFillerWords(final);
      }
      setInterimText(interim);
      
      setLastSpeechTime(Date.now());
      setIsSpeaking(true);
      setSilenceTimer(0);
      setNudgeMessage('');
    };

    rec.onend = () => {
      setIsSpeaking(false);
      // Restart speech recognition automatically if it stopped unexpectedly due to silence timeout
      if (recognitionRef.current === rec) {
        try {
          rec.start();
        } catch (e) {
          console.warn("Failed to auto-restart speech recognition:", e);
        }
      }
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (e) {
      console.error("Failed to start SpeechRecognition:", e);
    }
  };

  const analyzeFillerWords = (text) => {
    const words = text.toLowerCase().split(/\s+/);
    const fillers = { umm: 0, like: 0, basically: 0, you_know: 0, so: 0 };
    
    words.forEach(w => {
      if (w === 'um' || w === 'umm' || w === 'uh') fillers.umm++;
      else if (w === 'like') fillers.like++;
      else if (w === 'basically') fillers.basically++;
      else if (w === 'you know') fillers.you_know++;
      else if (w === 'so') fillers.so++;
    });

    setFillerCounts(prev => ({
      umm: prev.umm + fillers.umm,
      like: prev.like + fillers.like,
      basically: prev.basically + fillers.basically,
      you_know: prev.you_know + fillers.you_know,
      so: prev.so + fillers.so
    }));
  };

  // Watch for question changes
  useEffect(() => {
    if (stage !== 'interview' || questions.length === 0) return;
    
    const q = questions[currentIdx];
    if (!q) return;
    setTranscription('');
    setInterimText('');
    setTypedAnswer('');
    setSilenceTimer(0);
    setNudgeMessage('');
    setHesitationCount(0);
    setSilenceGaps(0);
    setFillerCounts({ umm: 0, like: 0, basically: 0, you_know: 0, so: 0 });

    speakQuestion(q.question_text || q.question);
  }, [currentIdx, questions, stage]);

  // Silence checker loop
  useEffect(() => {
    if (stage !== 'interview' || cameraDenied) return;

    if (silenceNudgeInterval.current) clearInterval(silenceNudgeInterval.current);
    silenceNudgeInterval.current = setInterval(() => {
      const msSinceLastSpeech = Date.now() - lastSpeechTime;

      if (msSinceLastSpeech >= 4000) {
        setSilenceGaps(prev => prev + 1);
        setHesitationCount(prev => prev + 1);
        setNudgeMessage("ARIA: Take your time... or say 'next question' to skip.");
        setIsSpeaking(false);
      }

      if (msSinceLastSpeech >= 7000 && transcription.trim().split(/\s+/).length > 8) {
        handleNextQuestion();
      }
    }, 1000);

    return () => {
      if (silenceNudgeInterval.current) clearInterval(silenceNudgeInterval.current);
    };
  }, [lastSpeechTime, transcription, stage, cameraDenied]);

  // Check voice commands
  useEffect(() => {
    const fullText = (transcription + interimText).toLowerCase();
    if (fullText.includes("next question") || fullText.includes("submit answer")) {
      setTranscription(prev => prev.replace(/next question/gi, "").replace(/submit answer/gi, ""));
      handleNextQuestion();
    }
  }, [transcription, interimText]);

  const handleNextQuestion = async () => {
    if (recognitionRef.current) {
      try {
        const tempRec = recognitionRef.current;
        recognitionRef.current = null; // Prevent onend callback from restarting it
        tempRec.stop();
      } catch (e) {}
    }

    const finalAnswer = cameraDenied ? typedAnswer : (transcription + interimText).trim();
    
    const q = questions[currentIdx];
    if (q) {
      const duration = speakingStartTime ? Math.round((Date.now() - speakingStartTime) / 1000) : 10;
      const submitBody = {
        round: 3,
        question_index: q.question_index,
        question_text: q.question_text || q.question,
        answer_text: finalAnswer || "No verbal response recorded.",
        duration_sec: duration,
        hesitation_count: hesitationCount,
        silence_gaps: silenceGaps,
        filler_words_detected: fillerCounts
      };

      if (currentIdx < questions.length - 1) {
        apiFetch(`${API_URL}/api/sessions/${sessionId}/interview/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submitBody)
        }).catch(err => console.error("Error submitting answer:", err));
        
        setCurrentIdx(prev => prev + 1);
      } else {
        setStage('generating');
        try {
          await apiFetch(`${API_URL}/api/sessions/${sessionId}/interview/answer`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(submitBody)
          });
        } catch (e) {
          console.error("Error submitting final answer:", e);
        }

        if (silenceNudgeInterval.current) clearInterval(silenceNudgeInterval.current);
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        
        generateReport();
      }
    }
  };

  const generateReport = async () => {
    setStage('generating');
    
    try {
      // Call backend to compile overall feedback
      const reportRes = await apiFetch(`${API_URL}/api/sessions/${sessionId}/feedback`, {
        method: 'POST'
      });
      
      if (!reportRes.ok) {
        throw new Error("Failed to generate placement report.");
      }
      
      // Delay feedback page navigation by 10 seconds to make it a premium feeling transition
      setTimeout(() => {
        onNextRound();
      }, 10000);
      
    } catch (err) {
      console.error("Error generating report:", err);
      // fallback recovery proceed anyway
      onNextRound();
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      
      {/* 1. Pre-interview Setup Screen */}
      {stage === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-scale-up">
          <div className="lg:col-span-7 space-y-6">
            <div>
              <span className="text-xs uppercase tracking-widest text-gold font-bold">Round 3 of 4</span>
              <h2 className="text-3xl font-extrabold text-white mt-1">Resume + Technical Interview</h2>
            </div>
            
            <div className="bg-darkcard border border-white/5 p-6 rounded-xl glass-panel space-y-4">
              <h3 className="font-bold text-white text-base font-semibold">Technical Round Overview:</h3>
              <ul className="space-y-2.5 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-gold/10 text-gold flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">A</span>
                  <span><strong>Resume Deep Dive (3 questions):</strong> Walkthroughs on projects, tech stack choices, and resolving complex technical issues.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-gold/10 text-gold flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">B</span>
                  <span><strong>Technical Skills (4 questions):</strong> Fundamental concept questions targeting React, Python, SQL, ML, or Java based on your resume.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-gold/10 text-gold flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">C</span>
                  <span><strong>Company-Specific (2 questions):</strong> Questions tailored to client interactions, Agile scrum methods, design scalability, or Amazon ownership principles depending on mode.</span>
                </li>
              </ul>
            </div>

            <div className="bg-gold/5 border border-gold/20 p-4 rounded-lg flex gap-3 text-xs text-gold/95">
              <Sparkles className="w-5 h-5 shrink-0" />
              <p>
                <strong>STAR Method Suggestion:</strong> Structure your answers! Describe the **Situation**, **Task**, **Action**, and **Result** for maximum alignment scoring.
              </p>
            </div>
          </div>

          <div className="lg:col-span-5 bg-darkcard border border-white/5 p-6 rounded-2xl glass-panel space-y-5">
            <h3 className="text-lg font-bold text-white">Camera Check</h3>
            
            <CameraPreview 
              onStreamReady={handleStreamReady}
              existingStream={cameraStreamRef?.current}
              dontStopOnUnmount={true}
              permissionDenied={cameraDenied}
              setPermissionDenied={setCameraDenied}
            />

            {!cameraDenied && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-gray-400">Mic Waveform (Say hello)</span>
                  {micTested ? <span className="text-green-400">Active</span> : <span className="text-gold animate-pulse">Waiting...</span>}
                </div>
                <Waveform stream={stream} />
              </div>
            )}

            <button
              onClick={startInterview}
              disabled={loading || (!cameraDenied && !stream)}
              className="w-full bg-gradient-to-r from-gold-dark to-gold text-navy font-bold py-3.5 rounded-lg text-sm uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 shadow-lg shadow-gold/20 hover:scale-[1.01]"
            >
              Start Technical Rounds
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Live Interview Interface */}
      {stage === 'interview' && questions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch animate-fade-in">
          
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            
            <div className="relative rounded-xl overflow-hidden bg-navy-dark border border-white/10 shadow-lg aspect-video w-full flex items-center justify-center">
              {!cameraDenied ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-gray-500">
                  <AlertCircle className="w-12 h-12 mb-2" />
                  <span className="text-sm font-semibold">Typing Mode Enabled</span>
                </div>
              )}

              {!cameraDenied && (
                <div className="absolute top-4 left-4 bg-red-600 text-white px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                  ARIA Tech Review
                </div>
              )}
            </div>

            <div className="bg-darkcard border border-white/5 p-4 rounded-xl glass-panel min-h-[140px] flex flex-col justify-between">
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-gray-500 block mb-1">
                  {cameraDenied ? 'Type Your Response' : 'Live Transcription'}
                </span>
                
                {cameraDenied ? (
                  <textarea
                    rows={4}
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    placeholder="Type your detailed tech response here..."
                    className="w-full bg-navy-dark border border-white/10 rounded-lg p-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold resize-none"
                  />
                ) : (
                  <p className="text-sm text-white font-medium italic leading-relaxed">
                    {transcription || interimText ? (
                      <>
                        {transcription}
                        <span className="text-gold">{interimText}</span>
                      </>
                    ) : (
                      <span className="text-gray-600">Start answering technical questions...</span>
                    )}
                  </p>
                )}
              </div>

              {!cameraDenied && (
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5 text-xs">
                  <div className="flex items-center gap-2">
                    {isSpeaking ? (
                      <div className="flex items-center gap-1.5 text-gold font-bold">
                        <span className="w-2.5 h-2.5 rounded-full bg-gold animate-mic-pulse" />
                        Speaking...
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <span className="w-2 h-2 rounded-full bg-yellow-500" />
                        Listening
                      </div>
                    )}
                  </div>
                  {nudgeMessage && (
                    <span className="text-gold animate-pulse text-[11px] font-medium">
                      {nudgeMessage}
                    </span>
                  )}
                </div>
              )}
            </div>

          </div>

          <div className="lg:col-span-5 bg-darkcard border border-white/5 p-6 rounded-2xl glass-panel flex flex-col justify-between items-center text-center space-y-6">
            
            <div className="w-full flex flex-col items-center">
              <span className="text-xs uppercase tracking-widest text-gold font-bold">
                Question {currentIdx + 1} of {questions.length}
              </span>
              
              <div className="w-32 h-32 rounded-full border-2 border-gold/40 flex items-center justify-center bg-navy-dark my-4 overflow-hidden relative shadow-lg shadow-gold/5 group">
                <div className="absolute inset-0 bg-gradient-to-tr from-gold/10 to-transparent" />
                <img 
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=256&auto=format&fit=crop" 
                  alt="ARIARecruiter"
                  className="w-full h-full object-cover grayscale opacity-90 group-hover:scale-105 transition-transform"
                />
                
                {window.speechSynthesis && window.speechSynthesis.speaking && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-xs gap-1.5">
                    <span className="w-1.5 h-6 bg-gold rounded animate-bounce [animation-delay:-0.2s]" />
                    <span className="w-1.5 h-10 bg-gold rounded animate-bounce" />
                    <span className="w-1.5 h-6 bg-gold rounded animate-bounce [animation-delay:-0.4s]" />
                  </div>
                )}
              </div>

              <h4 className="font-extrabold text-white text-lg">ARIA</h4>
              <span className="text-[10px] text-gray-500 uppercase tracking-widest">AI Recruiter</span>
            </div>

            <div className="bg-navy-dark/60 p-4 rounded-xl border border-white/5 w-full text-left relative">
              <CornerDownRight className="w-4 h-4 text-gold absolute top-4 left-4" />
              <p className="text-white text-sm font-semibold pl-6 leading-relaxed">
                {questions[currentIdx]?.question_text || questions[currentIdx]?.question}
              </p>
            </div>

            <button
              onClick={handleNextQuestion}
              disabled={loading}
              className="w-full bg-gradient-to-r from-gold-dark via-gold to-gold-light text-navy font-bold py-3 px-6 rounded-lg text-sm transition-all shadow-md hover:shadow-gold/30 flex items-center justify-center gap-2 uppercase tracking-wide"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-navy"></div>
              ) : (
                <>
                  {currentIdx === questions.length - 1 ? 'Finish Tech Interview' : 'Next Question'}
                  <ChevronRight className="w-4.5 h-4.5" />
                </>
              )}
            </button>

          </div>

        </div>
      )}

      {/* 3. Generating Report Loader Screen */}
      {stage === 'generating' && (
        <div className="max-w-xl mx-auto text-center py-20 space-y-6 animate-scale-up">
          <div className="relative w-24 h-24 mx-auto flex items-center justify-center">
            {/* Spinning ring outer */}
            <div className="absolute inset-0 rounded-full border-4 border-gold/10 border-t-gold animate-spin" />
            {/* Pulsing core inner */}
            <div className="w-12 h-12 bg-gold/10 rounded-full flex items-center justify-center border border-gold/30 animate-pulse">
              <Sparkles className="w-6 h-6 text-gold" />
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-white">Excellent effort, {candidateName}!</h3>
            <p className="text-sm text-gold animate-pulse">ARIA is compiling your personalized placement report...</p>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              Our Gemini model is analyzing your communication scores, tech answers, confidence values, and pacing. This process takes 10 seconds.
            </p>
          </div>

          <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden max-w-xs mx-auto">
            <div className="bg-gradient-to-r from-gold-dark to-gold h-full rounded-full animate-[loading_10s_ease-out_forwards]" style={{ width: '100%' }} />
          </div>
        </div>
      )}

    </div>
  );
}
