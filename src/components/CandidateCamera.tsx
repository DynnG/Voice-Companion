import React, { useState, useRef, useEffect } from 'react';
import { Video, Maximize2, Minimize2, User } from 'lucide-react';

interface CandidateCameraProps {
  candidateName?: string;
  candidateRole?: string;
  compact?: boolean;
  onCameraActiveChange?: (active: boolean) => void;
  registerToggle?: (fn: () => void) => void;
}

export const CandidateCamera: React.FC<CandidateCameraProps> = ({
  candidateName = 'Alex Chen',
  candidateRole = 'Job Candidate',
  compact = false,
  onCameraActiveChange,
  registerToggle,
}) => {
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Toggle Camera stream on/off
  const toggleCamera = async () => {
    if (isCameraActive) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsCameraActive(false);
      onCameraActiveChange?.(false);
      setCameraError(null);
    } else {
      setIsCameraLoading(true);
      setCameraError(null);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsCameraActive(true);
        onCameraActiveChange?.(true);
      } catch (err: any) {
        console.warn('[CandidateCamera] Camera access error:', err);
        setCameraError('Camera unavailable');
        setIsCameraActive(false);
        onCameraActiveChange?.(false);
      } finally {
        setIsCameraLoading(false);
      }
    }
  };

  useEffect(() => {
    registerToggle?.(toggleCamera);
  }, [toggleCamera, registerToggle]);

  // Fullscreen support
  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.().catch((err) => console.warn(err));
    } else {
      document.exitFullscreen?.().catch((err) => console.warn(err));
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center w-full max-w-[420px] transition-all duration-300">
      {/* Rounded Rectangular Camera Frame */}
      <div
        ref={containerRef}
        className={`
          relative w-full aspect-[4/3] rounded-2xl sm:rounded-3xl overflow-hidden
          bg-gradient-to-b from-[rgba(218,241,222,0.05)] via-[rgba(9,32,23,0.58)] to-[rgba(7,24,17,0.65)]
          backdrop-blur-xl border transition-all duration-300
          shadow-[inset_0_1px_1px_rgba(245,238,219,0.18),inset_0_0_16px_rgba(218,241,222,0.03),0_16px_40px_rgba(0,0,0,0.4)]
          ${
            isCameraActive
              ? 'border-[rgba(255,179,71,0.28)] border-t-[rgba(255,195,112,0.40)] shadow-[inset_0_1px_1px_rgba(255,195,112,0.22),0_16px_40px_rgba(0,0,0,0.45)]'
              : 'border-[rgba(218,241,222,0.12)] border-t-[rgba(245,238,219,0.24)] hover:border-[rgba(218,241,222,0.24)] hover:border-t-[rgba(245,238,219,0.35)]'
          }
          ${compact ? 'max-h-[160px]' : 'max-h-[280px] sm:max-h-[320px]'}
          flex items-center justify-center
        `}
      >
        {/* Video feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover -scale-x-100 transition-opacity duration-300 ${
            isCameraActive ? 'opacity-100' : 'opacity-0 absolute pointer-events-none'
          }`}
        />

        {/* Small LIVE indicator */}
        {isCameraActive && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[rgba(9,32,23,0.70)] backdrop-blur-md border border-[rgba(255,179,71,0.30)] border-t-[rgba(255,195,112,0.45)] text-[#FFC370] text-[11px] font-manrope font-bold shadow-[inset_0_1px_1px_rgba(255,195,112,0.20)]">
            <span className="w-2 h-2 rounded-full bg-[#FFB347] animate-pulse" />
            <span>LIVE</span>
          </div>
        )}

        {/* Fullscreen Button */}
        {isCameraActive && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-[rgba(9,32,23,0.65)] hover:bg-[rgba(9,32,23,0.85)] text-[#DAF1DE] hover:text-[#FFB347] border border-[rgba(218,241,222,0.14)] border-t-[rgba(245,238,219,0.25)] backdrop-blur-md shadow-[inset_0_1px_1px_rgba(245,238,219,0.16)] transition-all"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Subtle Analysis Overlay */}
        {isCameraActive && !compact && (
          <div className="absolute bottom-3 right-3 z-10 hidden sm:flex flex-col text-left px-2.5 py-1.5 rounded-xl bg-[rgba(9,32,23,0.70)] backdrop-blur-md border border-[rgba(218,241,222,0.12)] border-t-[rgba(245,238,219,0.22)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.14)] pointer-events-none">
            <span className="text-[11px] font-semibold text-[#F5EEDB]">Camera Analysis</span>
            <span className="text-[10px] text-[#8EB69B]">Framing & Posture Active</span>
          </div>
        )}

        {/* Off State / Placeholder */}
        {!isCameraActive && (
          <button
            onClick={toggleCamera}
            disabled={isCameraLoading}
            className="w-full h-full flex flex-col items-center justify-center p-4 text-center group cursor-pointer hover:bg-[rgba(218,241,222,0.03)] transition-colors"
            title="Click to turn camera on"
          >
            <div className="w-12 h-12 rounded-2xl bg-[rgba(218,241,222,0.06)] border border-[rgba(218,241,222,0.12)] group-hover:border-[rgba(255,179,71,0.4)] group-hover:bg-[rgba(255,179,71,0.08)] flex items-center justify-center mb-2.5 transition-all text-[#8EB69B] group-hover:text-[#FFB347]">
              {isCameraLoading ? (
                <div className="w-5 h-5 border-2 border-[#FFB347] border-t-transparent rounded-full animate-spin" />
              ) : (
                <Video className="w-6 h-6 transition-transform group-hover:scale-105" />
              )}
            </div>
            <span className="font-manrope font-semibold text-xs sm:text-sm text-[#F5EEDB]">
              {isCameraLoading ? 'Starting camera…' : 'Camera is optional'}
            </span>
            <span className="font-manrope text-[11px] text-[#8EB69B] group-hover:text-[#FFC370] mt-0.5 transition-colors">
              {cameraError || 'Tap to turn on'}
            </span>
          </button>
        )}
      </div>

      {/* Candidate info under camera */}
      <div className="flex items-center gap-2.5 w-full px-2 py-1 mt-2">
        <div className="w-8 h-8 rounded-full bg-[rgba(9,32,23,0.55)] border border-[rgba(218,241,222,0.14)] border-t-[rgba(245,238,219,0.22)] backdrop-blur-md flex items-center justify-center text-[#8EB69B] shadow-[inset_0_1px_1px_rgba(245,238,219,0.15)] shrink-0">
          <User className="w-4 h-4" />
        </div>
        <div className="flex flex-col min-w-0 text-left">
          <span className="font-manrope font-semibold text-xs sm:text-sm text-[#F5EEDB] truncate leading-tight">
            {candidateName}
          </span>
          <span className="font-manrope text-[11px] text-[#8EB69B] truncate leading-tight">
            {candidateRole}
          </span>
        </div>
      </div>
    </div>
  );
};
