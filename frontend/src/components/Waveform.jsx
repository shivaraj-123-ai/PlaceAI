import React, { useEffect, useRef } from 'react';

export default function Waveform({ stream }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!stream) return;
    let audioCtx;
    let analyser;
    let source;
    let animationId;

    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 128;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');

      const draw = () => {
        animationId = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        // Clear canvas
        ctx.fillStyle = '#0a0f1e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Center line
        ctx.strokeStyle = 'rgba(200, 149, 42, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();

        const barWidth = (canvas.width / bufferLength);
        
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#c8952a';
        ctx.beginPath();

        for (let i = 0; i < bufferLength; i++) {
          const val = dataArray[i];
          const percent = val / 255;
          const height = percent * canvas.height * 0.8;
          
          const x = i * barWidth + barWidth / 2;
          const y1 = (canvas.height - height) / 2;
          const y2 = (canvas.height + height) / 2;

          ctx.moveTo(x, y1);
          ctx.lineTo(x, y2);
        }
        ctx.stroke();
      };
      
      draw();
    } catch (e) {
      console.warn("AudioContext failed to start: ", e);
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [stream]);

  return (
    <div className="flex flex-col items-center justify-center p-2 rounded bg-navy-dark border border-white/5 shadow-inner">
      <canvas 
        ref={canvasRef} 
        className="w-full h-12 rounded" 
        width={300} 
        height={48} 
      />
    </div>
  );
}
