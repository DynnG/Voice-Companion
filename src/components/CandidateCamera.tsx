import React, { useState, useRef, useEffect, useCallback } from 'react';
import { User } from 'lucide-react';

interface CandidateCameraProps {
  candidateName?: string;
  candidateRole?: string;
  compact?: boolean;
  onCameraActiveChange?: (active: boolean) => void;
  registerToggle?: (fn: () => void) => void;
}

export const CandidateCamera: React.FC<CandidateCameraProps> = ({
  candidateName = 'Candidate',
  candidateRole = 'Candidate',
  compact = false,
  onCameraActiveChange,
  registerToggle,
}) => {
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isCameraLoading, setIsCameraLoading] = useState<boolean>(false);
  void isCameraLoading;
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Toggle Camera stream on/off
  const toggleCamera = useCallback(async () => {
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
        let stream: MediaStream | null = null;
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user',
              },
            });
          } catch (deviceErr) {
            console.warn('[CandidateCamera] Physical camera access failed:', deviceErr);
            throw new Error('Camera access unavailable');
          }
        }
        if (!stream) {
          throw new Error('Camera unavailable');
        }
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
  }, [isCameraActive, onCameraActiveChange]);

  useEffect(() => {
    registerToggle?.(toggleCamera);
  }, [toggleCamera, registerToggle]);

  useEffect(() => {
    if (isCameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [isCameraActive]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // When camera is OFF: REMOVE camera frame and image completely. Only keep hidden video element for stream hooks.
  if (!isCameraActive) {
    return (
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="hidden pointer-events-none"
        aria-hidden="true"
      />
    );
  }

  // When camera is ON: Prominent Camera Card with Camera Analysis Active and candidate info at bottom
  return (
    <div
      ref={containerRef}
      className={`interview-camera-card flex flex-col w-full transition-all duration-300 ease-out shrink-0 rounded-3xl bg-[rgba(10,32,24,0.52)] border border-[rgba(218,241,222,0.16)] border-t-[rgba(245,238,219,0.25)] backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(245,238,219,0.18),0_16px_40px_rgba(0,0,0,0.36)] ${
        compact
          ? 'max-w-[340px] sm:max-w-[360px] p-2 gap-1.5'
          : 'max-w-[440px] lg:max-w-[480px] p-2.5 sm:p-3 gap-2.5'
      }`}
    >
      {/* Video Container with Overlays */}
      <div
        className={`interview-camera-video relative w-full aspect-[16/10] rounded-2xl overflow-hidden bg-gradient-to-b from-[#1d4a38] to-[#081c14] border border-[rgba(218,241,222,0.12)] transition-all duration-300 ease-out ${
          compact
            ? 'max-h-[min(18vh,135px)] sm:max-h-[min(20vh,155px)]'
            : 'max-h-[min(28vh,210px)] sm:max-h-[min(32vh,250px)] lg:max-h-[min(34vh,270px)]'
        }`}
      >
        {/* Video feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover -scale-x-100"
        />

        {/* Top-Left Badge: Camera Analysis Active */}
        <div className="absolute top-2.5 left-2.5 z-10 flex items-center gap-2 px-3 py-1 rounded-full bg-[rgba(6,24,18,0.76)] backdrop-blur-md border border-[rgba(218,241,222,0.14)] text-xs font-manrope font-medium text-[#F5EEDB] shadow-sm">
          <span className="w-2 h-2 rounded-full bg-[#2FE0A8] shadow-[0_0_8px_#2fe0a8] animate-pulse" />
          <span>Camera Analysis Active</span>
        </div>

        {cameraError && (
          <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 text-center py-1 px-2 rounded bg-black/60 text-[#FFC370] text-[10px]">
            {cameraError}
          </div>
        )}
      </div>

      {/* Candidate Info Bar at Bottom of Card matching Image 1 */}
      <div className={`flex items-center rounded-2xl bg-[rgba(6,24,18,0.60)] border border-[rgba(218,241,222,0.12)] shrink-0 transition-all duration-300 ease-out ${
        compact ? 'gap-2 p-1.5 sm:p-2' : 'gap-2.5 p-2 sm:p-2.5'
      }`}>
        <div className={`rounded-full border border-[rgba(218,241,222,0.16)] flex items-center justify-center text-[#F5EEDB] bg-[rgba(218,241,222,0.08)] shrink-0 transition-all duration-300 ${
          compact ? 'w-6 h-6 sm:w-7 sm:h-7' : 'w-7 h-7 sm:w-8 sm:h-8'
        }`}>
          <User className={`${compact ? 'w-3 h-3 sm:w-3.5 sm:h-3.5' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'} transition-all duration-300`} />
        </div>
        <div className="flex flex-col text-left min-w-0">
          <span className={`font-manrope font-semibold text-[#F5EEDB] truncate leading-tight transition-all duration-300 ${
            compact ? 'text-xs' : 'text-xs sm:text-sm'
          }`}>
            {candidateName}
          </span>
          <span className={`font-manrope text-[#8EB69B] truncate leading-tight transition-all duration-300 ${
            compact ? 'text-[10px] mt-0.5' : 'text-[11px] mt-0.5'
          }`}>
            {candidateRole}
          </span>
        </div>
      </div>
    </div>
  );
};
