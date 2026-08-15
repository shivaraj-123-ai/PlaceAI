import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Mic, Volume2, Play, ChevronRight, Video, AlertCircle, Sparkles, MessageSquare, CornerDownRight } from 'lucide-react';
import CameraPreview from '../components/CameraPreview';
import Waveform from '../components/Waveform';
import { apiFetch } from '../utils/api';

export default function IntroRound({ sessionId, onNextRound, API_URL, cameraStreamRef, candidateName }) {
  const [stage, setStage] = useState('setup'); // 'setup' | 'interview'
  const [stream, setStream] = useState(null);
  const [cameraDenied, setCameraDenied] = useState(false);
  const [micTested, setMicTested] = useState(false);
  const [micTestVolume, setMicTestVolume] = useState(0);

  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  
  // Interview runtime states
  const [transcription, setTranscription] = useState('');
  const [interimText, setInterimText] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [silenceTimer, setSilenceTimer] = useState(0); // counts seconds of silence
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
  const speechIntervalRef = useRef(null);
  const silenceNudgeInterval = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const handleStreamReady = useCallback((s) => {
    setStream(s);
    if (cameraStreamRef) {
      cameraStreamRef.current = s;
    }
  }, [cameraStreamRef]);

  // Setup mic test volume simulation/listener
  useEffect(() => {
    if (!stream || stage !== 'setup') return;
    let audioCtx;
    let analyser;
    let source;
    let animId;

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 64;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const average = sum / bufferLength;
        setMicTestVolume(average);
        if (average > 15) {
          setMicTested(true);
        }
        animId = requestAnimationFrame(checkVolume);
      };
      checkVolume();
    } catch (e) {
      console.warn("AudioContext test failed:", e);
    }

    return () => {
      if (animId) cancelAnimationFrame(animId);
      if (audioCtx) audioCtx.close().catch(() => {});
    };
  }, [stream, stage]);

  // Camera start logic for live interview
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
      console.error("Error starting camera in interview:", err);
    }
  };

  useEffect(() => {
    if (stage === 'interview' && !cameraDenied) {
      startCamera();
    }
    return () => {
      // Do NOT stop tracks of the shared stream here to let it continue to Round 3!
    };
  }, [stage, cameraDenied]);

  // Load questions
  const startInterview = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`${API_URL}/api/sessions/${sessionId}/interview/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ round: 2 })
      });
      const data = await res.json();
      setQuestions(data.questions);
      setStage('interview');
      setCurrentIdx(0);
    } catch (err) {
      console.error("Error loading HR questions:", err);
    } finally {
      setLoading(false);
    }
  };

  // Text to Speech
  const speakQuestion = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => 
        v.name.includes('Google UK English Female') ||
        v.name.includes('Google US English') ||
        v.name.includes('Microsoft Zira') ||
        v.name.includes('Samantha')
      );
      
      // Fix voice cracking on long text:
      // Split into sentences and speak one by one
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      let index = 0;
      
      const speakNext = () => {
        if (index < sentences.length) {
          const utt = new SpeechSynthesisUtterance(sentences[index].trim());
          if (preferredVoice) utt.voice = preferredVoice;
          utt.rate = 0.85;   // slightly slower
          utt.pitch = 1.0;   // natural pitch
          utt.volume = 1.0;  // full volume
          
          utt.onend = () => {
            index++;
            if (index < sentences.length) {
              speakNext();
            } else {
              startRecognition();
            }
          };
          
          window.speechSynthesis.speak(utt);
        } else {
          startRecognition();
        }
      };
      speakNext();
    } else {
      // Fallback if no TTS
      startRecognition();
    }
  };

  // Web Speech STT
  const startRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition || cameraDenied) {
      // No Speech Recognition or camera blocked (which implies typing)
      return;
    }

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
      
      // Update silence trackers
      setLastSpeechTime(Date.now());
      setIsSpeaking(true);
      setSilenceTimer(0);
      setNudgeMessage('');
    };

    rec.onerror = (err) => {
      console.warn("Speech recognition error:", err);
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
    // Reset trackers
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
        // Nudge user
        setSilenceGaps(prev => prev + 1);
        setHesitationCount(prev => prev + 1);
        setNudgeMessage("ARIA: Take your time... or say 'next question' to skip.");
        setIsSpeaking(false);
      }

      // Auto-submit: if user has spoken at least some words, and stops for 7 seconds
      if (msSinceLastSpeech >= 7000 && transcription.trim().split(/\s+/).length > 6) {
        // Auto trigger next
        console.log("Auto-submitting answer due to speech completion pause.");
        handleNextQuestion();
      }
    }, 1000);

    return () => {
      if (silenceNudgeInterval.current) clearInterval(silenceNudgeInterval.current);
    };
  }, [lastSpeechTime, transcription, stage, cameraDenied]);

  // Check voice command in transcription (e.g. saying "next question" triggers skip)
  useEffect(() => {
    const fullText = (transcription + interimText).toLowerCase();
    if (fullText.includes("next question") || fullText.includes("submit answer")) {
      // Clear word from transcription so it doesn't pollute the AI submission
      setTranscription(prev => prev.replace(/next question/gi, "").replace(/submit answer/gi, ""));
      handleNextQuestion();
    }
  }, [transcription, interimText]);

  const handleNextQuestion = async () => {
    // Cancel any ongoing speech immediately
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    
    // Stop recording
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
      
      apiFetch(`${API_URL}/api/sessions/${sessionId}/interview/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round: 2,
          question_index: q.question_index,
          question_text: q.question_text || q.question,
          answer_text: finalAnswer || "No verbal response recorded.",
          duration_sec: duration,
          hesitation_count: hesitationCount,
          silence_gaps: silenceGaps,
          filler_words_detected: fillerCounts
        })
      }).catch(err => console.error("Error submitting answer:", err));
    }

    if (currentIdx < questions.length - 1) {
      setCurrentIdx(prev => prev + 1);
    } else {
      // Completed HR Round. Auto-proceed to Tech Round 3
      if (speechIntervalRef.current) clearInterval(speechIntervalRef.current);
      if (silenceNudgeInterval.current) clearInterval(silenceNudgeInterval.current);
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      
      onNextRound();
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      
      {/* 1. Pre-interview Setup Screen */}
      {stage === 'setup' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-scale-up">
          {/* Instructions Left */}
          <div className="lg:col-span-7 space-y-6">
            <div>
              <span className="text-xs uppercase tracking-widest text-gold font-bold">Round 2 of 4</span>
              <h2 className="text-3xl font-extrabold text-white mt-1">HR Introduction Interview</h2>
            </div>
            
            <div className="bg-darkcard border border-white/5 p-6 rounded-xl glass-panel space-y-4">
              <h3 className="font-bold text-white text-base">Interview Specifications:</h3>
              <ul className="space-y-2.5 text-sm text-gray-400">
                <li className="flex items-start gap-2">
                  <Play className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                  <span><strong>Questions:</strong> ARIA will ask exactly 5 personal HR and introductory questions.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Volume2 className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                  <span><strong>AI Recruiter Voice:</strong> Keep your sound on. ARIA will speak each question out loud.</span>
                </li>
                <li className="flex items-start gap-2">
                  <Mic className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                  <span><strong>Speech-to-Text:</strong> Respond speaking clearly. The system transcribes your words in real-time.</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-gold shrink-0 mt-0.5" />
                  <span><strong>Pacing & Nudges:</strong> Take as much time as you need. Gaps in speech & filler words are counted.</span>
                </li>
              </ul>
            </div>

            <div className="bg-gold/5 border border-gold/20 p-4 rounded-lg flex gap-3 text-xs text-gold/95">
              <Sparkles className="w-5 h-5 shrink-0" />
              <p>
                <strong>Tip:</strong> Introduce yourself confidently using your name. Emphasize your key strengths and projects parsed from your resume!
              </p>
            </div>
          </div>

          {/* Device Setup Right */}
          <div className="lg:col-span-5 bg-darkcard border border-white/5 p-6 rounded-2xl glass-panel space-y-5">
            <h3 className="text-lg font-bold text-white">Device Check</h3>
            
            {/* Live Camera Box */}
            <CameraPreview 
              onStreamReady={handleStreamReady}
              existingStream={cameraStreamRef?.current}
              dontStopOnUnmount={true}
              permissionDenied={cameraDenied}
              setPermissionDenied={setCameraDenied}
            />

            {/* Microphone test visualizer */}
            {!cameraDenied && (
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-gray-400">Microphone Input Waveform</span>
                  {micTested ? (
                    <span className="text-green-400">Mic Active</span>
                  ) : (
                    <span className="text-gold animate-pulse">Say something to test...</span>
                  )}
                </div>
                <Waveform stream={stream} />
              </div>
            )}

            {/* Action button */}
            <button
              onClick={startInterview}
              disabled={loading || (!cameraDenied && !micTested)}
              className={`w-full py-3.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 ${
                cameraDenied 
                  ? 'bg-gradient-to-r from-gold-dark to-gold text-navy shadow-lg shadow-gold/20 hover:scale-[1.01]' 
                  : (micTested 
                    ? 'bg-gradient-to-r from-gold-dark to-gold text-navy shadow-lg shadow-gold/20 hover:scale-[1.01]' 
                    : 'bg-white/5 border border-white/10 text-gray-500 cursor-not-allowed')
              }`}
            >
              {cameraDenied ? 'Start Interview (Text Fallback)' : 'I\'m Ready — Begin Interview'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 2. Live Interview Interface */}
      {stage === 'interview' && questions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch animate-fade-in">
          
          {/* Left: Candidate View (60%) */}
          <div className="lg:col-span-7 flex flex-col justify-between space-y-4">
            
            {/* Live webcam */}
            <div className="relative rounded-xl overflow-hidden bg-navy-dark border border-white/10 shadow-lg aspect-video w-full flex items-center justify-center">
              {!cameraDenied ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
                />
              ) : (
                <div className="flex flex-col items-center justify-center p-6 text-center text-gray-500">
                  <Video className="w-12 h-12 mb-2" />
                  <span className="text-sm font-semibold">Camera/Mic Denied</span>
                  <span className="text-xs text-gray-600 mt-1">Typing Mode Activated</span>
                </div>
              )}

              {/* Pulse recording badge */}
              {!cameraDenied && (
                <div className="absolute top-4 left-4 bg-red-600 text-white px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-ping" />
                  ARIA Recording
                </div>
              )}
            </div>

            {/* Real-time transcription box */}
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
                    placeholder="Type your response here..."
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
                      <span className="text-gray-600">Start speaking to transcribe...</span>
                    )}
                  </p>
                )}
              </div>

              {/* Speaking and silence indicators */}
              {!cameraDenied && (
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-white/5 text-xs">
                  <div className="flex items-center gap-2">
                    {isSpeaking ? (
                      <div className="flex items-center gap-1.5 text-gold font-bold">
                        <span className="w-2.5 h-2.5 rounded-full bg-gold animate-mic-pulse" />
                        Speaking detected...
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-gray-500">
                        <span className="w-2 h-2 rounded-full bg-yellow-500" />
                        Listening / Silence
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

          {/* Right: ARIA AI Recruiter (40%) */}
          <div className="lg:col-span-5 bg-darkcard border border-white/5 p-6 rounded-2xl glass-panel flex flex-col justify-between items-center text-center space-y-6">
            
            <div className="w-full flex flex-col items-center">
              {/* Question Index */}
              <span className="text-xs uppercase tracking-widest text-gold font-bold">
                Question {currentIdx + 1} of {questions.length}
              </span>
              
              {/* Avatar Animation container */}
              <div className="w-32 h-32 rounded-full border-2 border-gold/40 flex items-center justify-center bg-navy-dark my-4 overflow-hidden relative shadow-lg shadow-gold/5 group">
                <div className="absolute inset-0 bg-gradient-to-tr from-gold/10 to-transparent" />
                <img 
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=256&auto=format&fit=crop" 
                  alt="ARIARecruiter"
                  className="w-full h-full object-cover grayscale opacity-90 group-hover:scale-105 transition-transform"
                />
                
                {/* Voice sound waves overlay */}
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

            {/* Current Question display */}
            <div className="bg-navy-dark/60 p-4 rounded-xl border border-white/5 w-full text-left relative">
              <CornerDownRight className="w-4 h-4 text-gold absolute top-4 left-4" />
              <p className="text-white text-sm font-semibold pl-6 leading-relaxed">
                {questions[currentIdx]?.question_text || questions[currentIdx]?.question}
              </p>
            </div>

            {/* Next question manual action */}
            <button
              onClick={handleNextQuestion}
              disabled={loading}
              className="w-full bg-gradient-to-r from-gold-dark via-gold to-gold-light text-navy font-bold py-3 px-6 rounded-lg text-sm transition-all shadow-md hover:shadow-gold/30 flex items-center justify-center gap-2 uppercase tracking-wide"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-navy"></div>
              ) : (
                <>
                  {currentIdx === questions.length - 1 ? 'Finish Intro Round' : 'Next Question'}
                  <ChevronRight className="w-4.5 h-4.5" />
                </>
              )}
            </button>

          </div>

        </div>
      )}

    </div>
  );
}
