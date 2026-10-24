import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Sun, Moon } from 'lucide-react';

export default function Background() {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [dimMode, setDimMode] = useState('normal'); // 'normal' | 'cinematic' | 'focus'

  useEffect(() => {
    // Check for prefers-reduced-motion
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mediaQuery.matches) {
      setIsPlaying(false);
      if (videoRef.current) {
        videoRef.current.pause();
      }
    }

    // Ensure video plays smoothly
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().catch((err) => {
        console.warn('Autoplay prevented or video not yet ready:', err);
      });
    }
  }, []);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const cycleDimMode = () => {
    if (dimMode === 'normal') setDimMode('focus');
    else if (dimMode === 'focus') setDimMode('cinematic');
    else setDimMode('normal');
  };

  return (
    <>
      {/* Noise Grain Overlay from index 1.html */}
      <div className="grain" aria-hidden="true" />

      {/* Atmospheric Video Background from index 1.html */}
      <div className={`hero-photo dim-${dimMode}`} aria-hidden="true">
        <video 
          ref={videoRef}
          autoPlay 
          muted 
          loop 
          playsInline 
          preload="auto"
        >
          <source 
            src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260818_072341_50851634-bbc3-4c33-9acc-7647d4db44aa.mp4" 
            type="video/mp4" 
          />
        </video>
      </div>

      {/* Dynamic Ambient Scrim / Vignette for optimal legibility */}
      <div className={`hero-overlay overlay-${dimMode}`} aria-hidden="true" />

      {/* Discreet Ambient Motion Controls */}
      <div className="ambient-controls-bar" title="Background settings">
        <button 
          type="button" 
          onClick={togglePlay} 
          className="ambient-control-btn"
          aria-label={isPlaying ? 'Pause ambient motion' : 'Play ambient motion'}
          title={isPlaying ? 'Pause background animation' : 'Resume background animation'}
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          <span>{isPlaying ? 'Live' : 'Paused'}</span>
        </button>
        <button 
          type="button" 
          onClick={cycleDimMode} 
          className="ambient-control-btn"
          aria-label="Toggle background brightness mode"
          title={`Mode: ${dimMode.toUpperCase()} (Click to change)`}
        >
          {dimMode === 'cinematic' ? <Sun size={13} /> : <Moon size={13} />}
          <span style={{ textTransform: 'capitalize' }}>{dimMode}</span>
        </button>
      </div>
    </>
  );
}
