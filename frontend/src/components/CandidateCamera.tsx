import React, { useState, useRef, useEffect, useCallback, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { cameraGuidance, cameraWarningIssue, CameraIssue, evaluateVisualAnswer, visualDimensions, VisualSample } from '../services/visualAnalysis';

interface CandidateCameraProps {
  candidateName?: string;
  candidateRole?: string;
  compact?: boolean;
  recordingActive?: boolean;
  onCameraActiveChange?: (active: boolean) => void;
  registerToggle?: (fn: () => void) => void;
}

export const CandidateCamera: React.FC<CandidateCameraProps> = ({
  candidateRole = 'Interview', compact = false, recordingActive = false,
  onCameraActiveChange, registerToggle,
}) => {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [tracking, setTracking] = useState<'loading' | 'active' | 'unavailable'>('loading');
  const [badgeCompact, setBadgeCompact] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [issue, setIssue] = useState<CameraIssue | null>(null);
  const [evaluationUnavailable, setEvaluationUnavailable] = useState(false);
  const [feedback, setFeedback] = useState<string[] | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const openingRef = useRef(false);
  const mountedRef = useRef(true);
  const recordingRef = useRef(recordingActive);
  const samplesRef = useRef<VisualSample[]>([]);
  const wasRecordingRef = useRef(false);
  const panelId = useId();

  useEffect(() => {
    recordingRef.current = recordingActive;
    if (recordingActive && !wasRecordingRef.current) {
      samplesRef.current = [];
      setFeedback(null);
      setEvaluationUnavailable(false);
    }
    if (!recordingActive && wasRecordingRef.current && isCameraActive) {
      const result = evaluateVisualAnswer(samplesRef.current);
      setFeedback(result);
      setEvaluationUnavailable(!result);
    }
    wasRecordingRef.current = recordingActive;
  }, [recordingActive, isCameraActive]);

  const toggleCamera = useCallback(async () => {
    if (openingRef.current) return;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsCameraActive(false);
      onCameraActiveChange?.(false);
      return;
    }
    openingRef.current = true;
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: {
        width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user',
      } });
      if (!mountedRef.current) { stream.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = stream;
      setFeedback(null); setEvaluationUnavailable(false);
      samplesRef.current = [];
      setIsCameraActive(true);
      onCameraActiveChange?.(true);
      stream.getVideoTracks()[0].onended = () => {
        streamRef.current = null;
        if (mountedRef.current) { setIsCameraActive(false); onCameraActiveChange?.(false); }
      };
    } catch {
      if (mountedRef.current) { setCameraError('Camera unavailable. Check your browser camera permission.'); onCameraActiveChange?.(false); }
    } finally { openingRef.current = false; }
  }, [onCameraActiveChange]);

  useEffect(() => { registerToggle?.(toggleCamera); }, [toggleCamera, registerToggle]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isCameraActive) return;
    const video = videoRef.current;
    if (video) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => {});
    }
    setTracking('loading'); setBadgeCompact(false); setIssue(null);

    let cancelled = false, busy = false, ready = false;
    let issueCandidate: CameraIssue | null = null;
    let issueSince = 0;
    const worker = new Worker(new URL('../services/visualAnalysis.worker.ts', import.meta.url), { type: 'module' });
    const fail = () => {
      if (cancelled) return;
      ready = false; busy = false;
      setTracking('unavailable'); setIssue(null);
      worker.terminate();
    };
    const startupTimeout = window.setTimeout(fail, 45000);
    worker.onerror = fail;
    worker.onmessage = (event: MessageEvent<{ type: string; sample?: VisualSample }>) => {
      if (cancelled) return;
      busy = false;
      if (event.data.type === 'ready') {
        clearTimeout(startupTimeout); ready = true; setTracking('active'); return;
      }
      if (event.data.type === 'error') { fail(); return; }
      const sample = event.data.sample;
      if (!sample) return;
      if (recordingRef.current) {
        samplesRef.current.push(sample);
        if (samplesRef.current.length > 600) samplesRef.current.shift();
      }
      // Require a sustained framing issue to avoid flashing prompts on small movements.
      const detectedIssue = cameraWarningIssue(sample);
      if (detectedIssue !== issueCandidate) {
        issueCandidate = detectedIssue; issueSince = sample.timestamp;
      }
      if (sample.timestamp - issueSince >= (issueCandidate === 'expression' || issueCandidate === 'hand-pose' ? 2400 : 1600)) setIssue(issueCandidate);
    };
    const timer = window.setInterval(async () => {
      if (cancelled || !ready || busy || !video || video.readyState < 2 || document.hidden) return;
      busy = true;
      try {
        const frame = await createImageBitmap(video, { resizeWidth: 640, resizeHeight: Math.round(640 * video.videoHeight / video.videoWidth) });
        if (cancelled || !ready) { frame.close(); busy = false; return; }
        worker.postMessage({ frame, timestamp: performance.now() }, [frame]);
      } catch { fail(); }
    }, 400);
    return () => {
      cancelled = true; clearInterval(timer); clearTimeout(startupTimeout); worker.terminate();
    };
  }, [isCameraActive]);

  useEffect(() => {
    if (tracking !== 'active' || !isCameraActive) return;
    const timer = window.setTimeout(() => setBadgeCompact(true), 4000);
    return () => clearTimeout(timer);
  }, [tracking, isCameraActive]);

  if (!isCameraActive) return cameraError ? <p role="alert" className="camera-access-error">{cameraError}</p> : null;
  const status = tracking === 'active' ? 'Visual Analysis Active' : tracking === 'loading' ? 'Starting visual analysis…' : 'Visual analysis unavailable';
  return (
    <section className={`interview-camera-card visual-camera-card ${compact ? 'visual-camera-card--compact' : ''}`} data-analysis-expanded={expanded} aria-label="Camera and visual analysis">
      <div className={`interview-camera-video visual-camera-video ${tracking === 'active' && issue ? 'visual-camera-video--warning' : ''}`}>
        <video ref={videoRef} autoPlay playsInline muted disablePictureInPicture disableRemotePlayback controlsList="nofullscreen noremoteplayback" className="visual-camera-feed" />
        <div className={`visual-camera-status ${badgeCompact && tracking === 'active' ? 'visual-camera-status--compact' : ''}`} title={status} aria-label={status}>
          <span className={`visual-camera-dot ${tracking === 'active' ? 'visual-camera-dot--active' : ''}`} />
          <span className="visual-camera-status-text">{status}</span>
        </div>
        <div className={`visual-camera-role ${issue ? 'visual-camera-role--raised' : ''}`}>{candidateRole}</div>
        {issue && <p className="visual-camera-distance" role="status" aria-live="polite">{cameraGuidance[issue]}</p>}
      </div>
      <div className="visual-camera-analysis">
        <button type="button" className="visual-camera-heading" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpanded(value => !value)}>
          <span>Visual Analysis</span><ChevronDown aria-hidden="true" size={17} className={expanded ? 'visual-camera-chevron--open' : ''} />
        </button>
        {expanded && <div id={panelId} className="visual-camera-analysis-body">
          <p className="visual-camera-context" aria-live="polite">{tracking === 'unavailable' ? 'Tracking could not start. Check your connection and reopen the camera.' : issue ? cameraGuidance[issue] : recordingActive ? 'Observing this answer…' : evaluationUnavailable ? 'This answer did not have enough clear footage for visual analysis. Adjust your lighting and framing, then try again.' : feedback ? 'Most recent answer · camera-based estimates' : 'Feedback appears after you finish an answer.'}</p>
          {feedback && !recordingActive && !issue && tracking === 'active' && <dl className="visual-camera-observations">
            {visualDimensions.map((dimension, index) => <div key={dimension} className="visual-camera-row">
              <dt>{dimension}</dt><dd>{feedback?.[index] || 'Waiting for a recorded answer.'}</dd>
            </div>)}
          </dl>}
        </div>}
      </div>
    </section>
  );
};
