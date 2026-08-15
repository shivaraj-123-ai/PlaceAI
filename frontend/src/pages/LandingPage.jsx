import React, { useState } from 'react';
import { Upload, Briefcase, ChevronRight, Award, ShieldAlert, Cpu, Mic, FileText, CheckCircle2 } from 'lucide-react';
import pdfjsLib from '../pdfWorker';
import { apiFetch } from '../utils/api';

export default function LandingPage({ onSessionCreated, API_URL }) {
  const [companyMode, setCompanyMode] = useState('General');
  const [candidateName, setCandidateName] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  
  // Resume summary card state
  const [parsedResume, setParsedResume] = useState(null);
  const [sessionId, setSessionId] = useState(null);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile && selectedFile.type === 'application/pdf') {
      setFile(selectedFile);
      setError('');
    } else {
      setError('Please upload a valid PDF resume file.');
      setFile(null);
    }
  };

  const extractTextFromPdf = async (fileToParse) => {
    const fileReader = new FileReader();
    return new Promise((resolve, reject) => {
      fileReader.onload = async (e) => {
        try {
          const typedarray = new Uint8Array(e.target.result);
          const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
          let text = "";
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map((item) => item.str);
            text += strings.join(" ") + "\n";
          }
          resolve(text);
        } catch (err) {
          reject(err);
        }
      };
      fileReader.onerror = (err) => reject(err);
      fileReader.readAsArrayBuffer(fileToParse);
    });
  };

  const handleStart = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('A PDF resume is required to parse skills and projects.');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      // 1. Create Session
      setStatusText('Initializing session...');
      const sessionResponse = await apiFetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_mode: companyMode,
          candidate_name: candidateName.trim() || 'Guest'
        })
      });
      
      if (!sessionResponse.ok) {
        throw new Error('Failed to create placement session.');
      }
      
      const sessionData = await sessionResponse.json();
      const newSessionId = sessionData.session_id;
      setSessionId(newSessionId);

      // 2. Extract PDF Text Client-side
      setStatusText('Reading PDF text client-side...');
      const extractedText = await extractTextFromPdf(file);
      
      if (!extractedText.trim()) {
        throw new Error('Extracted text is empty. Please verify your PDF file is not a scanned image.');
      }

      // 3. Post to backend resume endpoint
      setStatusText('Analyzing resume and mapping skills with Gemini AI...');
      const resumeResponse = await apiFetch(`${API_URL}/api/sessions/${newSessionId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_text: extractedText })
      });

      if (!resumeResponse.ok) {
        throw new Error('Failed to analyze resume details.');
      }

      const resumeData = await resumeResponse.json();
      setParsedResume(resumeData.resume_data);
      
      // Update candidate name if Gemini guessed it
      if (resumeData.candidate_name && resumeData.candidate_name !== 'Guest') {
        setCandidateName(resumeData.candidate_name);
      }

    } catch (err) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred. Please try again.');
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const handleBeginInterview = () => {
    if (onSessionCreated && sessionId && parsedResume) {
      onSessionCreated(sessionId, companyMode, candidateName || 'Guest', parsedResume);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center">
      {/* Hero section */}
      <div className="text-center max-w-3xl mb-12 animate-fade-in">
        <h1 className="text-[44px] font-extrabold tracking-tight mb-4 text-white">
          Prepare Smarter. Perform Confidently. <span className="gold-gradient-text">Get Placed.</span>
        </h1>
        <p className="text-lg md:text-xl text-gray-400 font-medium">
          Simulate real-world hiring rounds tailored to top companies. Upload your resume and experience a complete 4-round placement training.
        </p>
      </div>

      {error && (
        <div className="w-full max-w-xl mb-6 bg-red-950/20 border border-red-500/30 rounded-lg p-4 flex gap-3 text-red-200 text-sm glass-panel">
          <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
          <div>{error}</div>
        </div>
      )}

      {/* Main Flow: Upload form vs Resume preview card */}
      {!parsedResume ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 w-full items-start">
          
          {/* Features Column (Left) */}
          <div className="lg:col-span-7 space-y-6">
            <h2 className="text-2xl font-bold text-white mb-4">A Complete 4-Round Recruitment Walkthrough</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-darkcard border border-white/5 p-5 rounded-xl glass-panel hover:border-gold/30 transition-all duration-300">
                <div className="w-10 h-10 rounded bg-gold/10 flex items-center justify-center mb-3">
                  <FileText className="w-5 h-5 text-gold" />
                </div>
                <h3 className="font-semibold text-white text-base mb-1">Round 1: Aptitude Filter</h3>
                <p className="text-xs text-gray-400">15 tailored MCQs covering logical reasoning, quant, verbal, and technical skills based on your resume.</p>
              </div>

              <div className="bg-darkcard border border-white/5 p-5 rounded-xl glass-panel hover:border-gold/30 transition-all duration-300">
                <div className="w-10 h-10 rounded bg-gold/10 flex items-center justify-center mb-3">
                  <Mic className="w-5 h-5 text-gold" />
                </div>
                <h3 className="font-semibold text-white text-base mb-1">Round 2: HR Live Intro</h3>
                <p className="text-xs text-gray-400">WebRTC camera simulation. Web Speech API detects voice to answer 5 interactive behavioral HR questions from recruiter ARIA.</p>
              </div>

              <div className="bg-darkcard border border-white/5 p-5 rounded-xl glass-panel hover:border-gold/30 transition-all duration-300">
                <div className="w-10 h-10 rounded bg-gold/10 flex items-center justify-center mb-3">
                  <Cpu className="w-5 h-5 text-gold" />
                </div>
                <h3 className="font-semibold text-white text-base mb-1">Round 3: Tech Deep-Dive</h3>
                <p className="text-xs text-gray-400">9 customized questions targeting your specific resume projects, tech stack, and selected company methodologies.</p>
              </div>

              <div className="bg-darkcard border border-white/5 p-5 rounded-xl glass-panel hover:border-gold/30 transition-all duration-300">
                <div className="w-10 h-10 rounded bg-gold/10 flex items-center justify-center mb-3">
                  <Award className="w-5 h-5 text-gold" />
                </div>
                <h3 className="font-semibold text-white text-base mb-1">Round 4: Performance Analytics</h3>
                <p className="text-xs text-gray-400">Comprehensive scorecards, visual graphs, speech pacing metrics, custom study paths, and PDF reports.</p>
              </div>
            </div>
          </div>

          {/* Form & Upload Column (Right) */}
          <div className="lg:col-span-5 bg-darkcard border border-white/5 p-6 rounded-2xl glass-panel gold-border-glow w-full">
            <h3 className="text-xl font-bold text-white mb-4">Start Your Placement Coaching</h3>
            
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gold mb-4"></div>
                <p className="text-sm font-semibold text-gold animate-pulse">{statusText}</p>
                <p className="text-xs text-gray-500 mt-1 max-w-[250px]">Gemini is analyzing resume parameters. This takes about 10 seconds.</p>
              </div>
            ) : (
              <form onSubmit={handleStart} className="space-y-4">
                
                {/* Candidate Name */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    Candidate Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your name"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    className="w-full bg-navy-dark border border-white/10 rounded-lg py-2 px-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-gold transition-colors"
                  />
                </div>

                {/* Company Select */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                    Target Company Mode
                  </label>
                  <div className="relative">
                    <select
                      value={companyMode}
                      onChange={(e) => setCompanyMode(e.target.value)}
                      className="w-full bg-navy-dark border border-white/10 rounded-lg py-2 px-3 text-sm text-white appearance-none focus:outline-none focus:border-gold transition-colors"
                    >
                      <option value="TCS">TCS (Agile & Scrum focus)</option>
                      <option value="Infosys">Infosys (Client Communication)</option>
                      <option value="Wipro">Wipro (Adaptability & Learning)</option>
                      <option value="Accenture">Accenture (Deadlines & Quality)</option>
                      <option value="Google">Google (Scalability & Design)</option>
                      <option value="Amazon">Amazon (Ownership Principle)</option>
                      <option value="General">General (Standard Technical/HR)</option>
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-400">
                      <Briefcase className="w-4 h-4 text-gold" />
                    </div>
                  </div>
                </div>

                {/* File Upload Box */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                    Upload Resume (PDF Only)
                  </label>
                  <div className="border-2 border-dashed border-white/10 rounded-xl p-6 text-center hover:border-gold/40 cursor-pointer transition-colors relative bg-navy-dark/40 group">
                    <input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2 group-hover:text-gold transition-colors" />
                    {file ? (
                      <span className="text-xs text-gold font-semibold truncate block max-w-xs mx-auto">
                        {file.name}
                      </span>
                    ) : (
                      <>
                        <span className="text-xs font-medium text-gray-300 block mb-1">
                          Click to upload or drag-and-drop
                        </span>
                        <span className="text-[10px] text-gray-500">
                          PDF files up to 5MB
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={!file}
                  className={`w-full py-3 rounded-lg text-sm font-bold uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 ${
                    file
                      ? 'bg-gradient-to-r from-gold-dark via-gold to-gold-light text-navy shadow-lg shadow-gold/15 hover:shadow-gold/30 hover:scale-[1.02]'
                      : 'bg-white/5 border border-white/10 text-gray-600 cursor-not-allowed'
                  }`}
                >
                  Analyze Resume
                  <ChevronRight className="w-4 h-4" />
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        /* Resume parsed preview summary card */
        <div className="w-full max-w-3xl bg-darkcard border border-gold/20 p-8 rounded-2xl glass-panel shadow-2xl animate-scale-up space-y-6">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <div>
              <span className="text-xs text-gold uppercase tracking-widest font-semibold">Ready to Begin</span>
              <h2 className="text-2xl font-bold text-white mt-1">Resume Analysis Summary</h2>
            </div>
            <div className="flex items-center gap-1.5 bg-gold/15 text-gold border border-gold/30 px-3 py-1 rounded-full text-xs font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Resume Parsed</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">Candidate Profile</h4>
              <p className="text-lg font-bold text-white mb-4">{candidateName || 'Guest'}</p>

              <h4 className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-2">Identified Skills</h4>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-2">
                {parsedResume.skills && parsedResume.skills.length > 0 ? (
                  parsedResume.skills.map((skill, index) => (
                    <span key={index} className="text-xs bg-white/5 border border-white/10 text-gray-300 px-2 py-1 rounded">
                      {skill}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-500">No skills identified.</span>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {/* Projects */}
              <div>
                <h4 className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1.5">Key Projects</h4>
                <div className="space-y-2">
                  {parsedResume.projects && parsedResume.projects.length > 0 ? (
                    parsedResume.projects.slice(0, 2).map((proj, idx) => (
                      <div key={idx} className="bg-white/5 border border-white/5 rounded p-2 text-xs">
                        <strong className="text-white block font-bold">{proj.title}</strong>
                        <span className="text-gray-400 line-clamp-1">{proj.description}</span>
                      </div>
                    ))
                  ) : (
                    <span className="text-xs text-gray-500">No projects listed.</span>
                  )}
                </div>
              </div>

              {/* Education */}
              <div>
                <h4 className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Education</h4>
                {parsedResume.education && parsedResume.education.length > 0 ? (
                  <p className="text-xs text-gray-300">
                    {parsedResume.education[0].degree} — {parsedResume.education[0].institution} ({parsedResume.education[0].year})
                  </p>
                ) : (
                  <p className="text-xs text-gray-500">No education parsed.</p>
                )}
              </div>
              
              {/* Gaps */}
              {parsedResume.gaps && parsedResume.gaps.length > 0 && parsedResume.gaps[0].period !== 'None' && (
                <div>
                  <h4 className="text-xs text-red-400 uppercase tracking-wider font-semibold mb-1">Noted Career Gaps</h4>
                  <p className="text-xs text-gray-400 bg-red-950/10 border border-red-500/10 p-2 rounded">
                    <strong>{parsedResume.gaps[0].period}</strong>: {parsedResume.gaps[0].explanation}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="bg-navy-dark/60 p-4 rounded-xl border border-white/5 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-left">
              <span className="text-xs text-gray-400 font-medium">Selected Interview Mode:</span>
              <p className="text-sm text-white font-bold">{companyMode} Recruitment pipeline</p>
            </div>
            <button
              onClick={handleBeginInterview}
              className="bg-gradient-to-r from-gold-dark via-gold to-gold-light text-navy font-bold py-3 px-6 rounded-lg text-sm shadow-md hover:shadow-gold/30 hover:scale-102 transition-all flex items-center gap-1.5 uppercase tracking-wide w-full md:w-auto justify-center"
            >
              Start Round 1: Aptitude Test
              <ChevronRight className="w-4.5 h-4.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
