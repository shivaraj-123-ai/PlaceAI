import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function ScoreRing({ score }) {
  const [displayScore, setDisplayScore] = useState(0);
  const radius = 60;
  const strokeWidth = 10;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  useEffect(() => {
    let start = 0;
    const end = parseInt(score);
    if (start === end) {
      setDisplayScore(end);
      return;
    }
    const totalDuration = 1500; // ms
    const incrementTime = Math.abs(Math.floor(totalDuration / end));
    
    const timer = setInterval(() => {
      start += 1;
      setDisplayScore(start);
      if (start >= end) {
        clearInterval(timer);
      }
    }, incrementTime);

    return () => clearInterval(timer);
  }, [score]);

  // Color matching
  const getColor = (s) => {
    if (s >= 85) return '#c8952a'; // Gold
    if (s >= 70) return '#10b981'; // Green
    if (s >= 55) return '#f59e0b'; // Amber
    return '#ef4444'; // Red
  };

  const getGradeLabel = (s) => {
    if (s >= 85) return 'Excellent';
    if (s >= 70) return 'Good';
    if (s >= 55) return 'Average';
    return 'Needs Work';
  };

  const ringColor = getColor(score);

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative w-40 h-40 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90">
          {/* Base track circle */}
          <circle
            cx="80"
            cy="80"
            r={radius}
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth={strokeWidth}
            fill="transparent"
          />
          {/* Animated score circle */}
          <motion.circle
            cx="80"
            cy="80"
            r={radius}
            stroke={ringColor}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute text-center">
          <motion.span 
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-4xl font-extrabold text-white block"
          >
            {displayScore}
          </motion.span>
          <span className="text-[10px] uppercase tracking-widest text-gray-400">Overall Score</span>
        </div>
      </div>
      <div 
        className="mt-3 px-4 py-1 rounded-full text-xs font-semibold uppercase tracking-wider"
        style={{ backgroundColor: `${ringColor}20`, color: ringColor, border: `1px solid ${ringColor}40` }}
      >
        {getGradeLabel(score)}
      </div>
    </div>
  );
}
