import React, { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, AlertTriangle } from 'lucide-react';

export default function CameraPreview({ onStreamReady, permissionDenied, setPermissionDenied, existingStream, dontStopOnUnmount }) {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(existingStream || null);
  const [loading, setLoading] = useState(!existingStream);

  // Keep track of latest onStreamReady callback without triggering effect restarts
  const onStreamReadyRef = useRef(onStreamReady);
  useEffect(() => {
    onStreamReadyRef.current = onStreamReady;
  }, [onStreamReady]);

  // Bind the active stream to the video element whenever it changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(e => console.warn("Video play failed:", e));
    }
  }, [stream]);

  // Handle camera initialization/setup
  useEffect(() => {
    if (existingStream) {
      setStream(existingStream);
      setLoading(false);
      setPermissionDenied(false);
      if (onStreamReadyRef.current) {
        onStreamReadyRef.current(existingStream);
      }
      return;
    }

    let localStream = null;
    async function startCamera() {
      setLoading(true);
      try {
        localStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: true // Request mic too so we have both
        });
        
        setStream(localStream);
        setPermissionDenied(false);
        if (onStreamReadyRef.current) {
          onStreamReadyRef.current(localStream);
        }
      } catch (err) {
        console.error("Camera and mic access denied:", err);
        setPermissionDenied(true);
      } finally {
        setLoading(false);
      }
    }

    startCamera();

    return () => {
      if (localStream && !dontStopOnUnmount) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [setPermissionDenied, existingStream, dontStopOnUnmount]);

  if (permissionDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-64 md:h-80 rounded-xl bg-red-950/20 border border-red-500/20 text-center p-6 glass-panel">
        <CameraOff className="w-12 h-12 text-red-400 mb-4" />
        <h3 className="text-lg font-semibold text-red-200 mb-2">Camera & Mic Access Denied</h3>
        <p className="text-sm text-gray-400 max-w-sm mb-4">
          PlaceAI requires camera and microphone permissions to capture your answers and simulate a live interview.
        </p>
        <div className="text-left text-xs bg-navy-dark p-3 rounded border border-white/5 text-gray-300">
          <p className="font-bold mb-1 text-gold">How to enable:</p>
          <ol className="list-decimal pl-4 space-y-1">
            <li>Click the camera/lock icon in your browser address bar.</li>
            <li>Allow **Camera** and **Microphone** access.</li>
            <li>Reload this page.</li>
          </ol>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-64 md:h-80 rounded-xl overflow-hidden bg-navy-dark border border-white/10 glass-panel shadow-lg">
      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-navy-dark/95 z-10">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-gold mb-2"></div>
          <p className="text-xs text-gray-400">Accessing Camera & Mic...</p>
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover scale-x-[-1]" // mirror for user comfort
      />
      <div className="absolute bottom-3 left-3 bg-black/60 px-3 py-1 rounded-full text-xs text-white flex items-center gap-1.5 border border-white/10">
        <div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
        Live Feed
      </div>
    </div>
  );
}
