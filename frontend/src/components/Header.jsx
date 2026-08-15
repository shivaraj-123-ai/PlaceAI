import React from 'react';
import { Award, Briefcase, RefreshCw, LogOut } from 'lucide-react';

export default function Header({ currentRound, companyMode, candidateName, onReset }) {
  // mapping round index to text
  const rounds = [
    { num: 1, name: "Aptitude" },
    { num: 2, name: "HR Intro" },
    { num: 3, name: "Technical" },
    { num: 4, name: "Feedback" }
  ];

  return (
    <header className="w-full bg-navy-dark border-b border-white/5 py-4 px-6 sticky top-0 z-50 glass-panel">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Brand */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={onReset}>
            <div className="w-9 h-9 rounded bg-gradient-to-tr from-gold-dark via-gold to-gold-light flex items-center justify-center font-bold text-navy shadow shadow-gold/20 text-lg">
              P
            </div>
            <div>
              <span className="text-xl font-bold tracking-wider text-white">Place<span className="text-gold">AI</span></span>
              <span className="text-[10px] text-gray-400 block -mt-1 font-medium tracking-tight">Your AI Placement Coach</span>
            </div>
          </div>
          
          {onReset && (
            <button 
              onClick={onReset}
              className="md:hidden flex items-center justify-center text-gray-400 hover:text-white p-2"
              title="Reset Session"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Pipeline Progress bar */}
        {currentRound > 0 && (
          <div className="flex items-center gap-3 bg-navy/80 px-4 py-2 rounded-lg border border-white/5 max-w-md w-full md:w-auto">
            <span className="text-xs font-semibold text-gold whitespace-nowrap min-w-fit">
              Round {currentRound} of 4:
            </span>
            <div className="flex gap-1.5 items-center w-full">
              {rounds.map((r) => {
                const isActive = r.num === currentRound;
                const isPassed = r.num < currentRound;
                return (
                  <div key={r.num} className="flex-1 flex flex-col items-center min-w-[50px]">
                    <div 
                      className={`h-1.5 w-full rounded-full transition-all duration-500 ${
                        isActive 
                          ? 'bg-gold animate-pulse shadow-md shadow-gold/50' 
                          : isPassed 
                            ? 'bg-gold/40' 
                            : 'bg-white/10'
                      }`} 
                    />
                    <span className={`text-[9px] mt-1 font-semibold tracking-wider transition-all duration-300 ${
                      isActive 
                        ? 'text-gold' 
                        : isPassed 
                          ? 'text-gold/60' 
                          : 'text-gray-500'
                    }`}>
                      {r.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Metadata info */}
        {currentRound > 0 && (
          <div className="flex items-center gap-3 self-end md:self-auto text-xs">
            {companyMode && (
              <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-md flex items-center gap-1.5 text-gray-200">
                <Briefcase className="w-3.5 h-3.5 text-gold" />
                <span>Mode: <strong className="text-white">{companyMode}</strong></span>
              </div>
            )}
            {candidateName && (
              <div className="bg-white/5 border border-white/10 px-3 py-1.5 rounded-md flex items-center gap-1.5 text-gray-200">
                <Award className="w-3.5 h-3.5 text-gold" />
                <span>Candidate: <strong className="text-white truncate max-w-[80px] inline-block align-bottom">{candidateName}</strong></span>
              </div>
            )}
            {onReset && (
              <button
                onClick={onReset}
                className="hidden md:flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-950/20 hover:bg-red-900/30 border border-red-500/20 text-red-400 hover:text-red-300 transition-all font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>New Session</span>
              </button>
            )}
          </div>
        )}
        
      </div>
    </header>
  );
}
