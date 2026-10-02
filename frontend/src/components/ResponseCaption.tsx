import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';

interface ResponseCaptionProps {
  captionText: string;
  visible: boolean;
}

export const ResponseCaption: React.FC<ResponseCaptionProps> = ({ captionText, visible }) => {
  const [chunks, setChunks] = useState<string[]>([]);
  const [displayIndex, setDisplayIndex] = useState(0);
  const [trigger, setTrigger] = useState(0);
  const measureRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-measure on window resize to ensure correct chunking if container width changes
  useEffect(() => {
    const handleResize = () => setTrigger((t) => t + 1);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useLayoutEffect(() => {
    if (!measureRef.current || !captionText) {
      setChunks(captionText ? [captionText] : []);
      return;
    }

    const wordsArr = captionText.split(' ');
    const newChunks: string[] = [];
    let currentChunkWords: string[] = [];

    // Clear measure div
    measureRef.current.textContent = '';

    for (let i = 0; i < wordsArr.length; i++) {
      const word = wordsArr[i];
      currentChunkWords.push(word);
      measureRef.current.textContent = currentChunkWords.join(' ');

      // 56px is the max-height of the parent container in VoiceExperience.tsx
      // At clamp(15px, 2.2vh + 4px, 19px) and line-height 1.4, 2 lines is ~53.2px.
      // So > 56 catches the 3rd line wrap.
      if (measureRef.current.scrollHeight > 56) {
        // Exceeded available area, finalize this chunk
        currentChunkWords.pop();
        if (currentChunkWords.length > 0) {
          newChunks.push(currentChunkWords.join(' '));
        }
        // Start the next chunk with the word that caused the overflow
        currentChunkWords = [word];
        measureRef.current.textContent = word;
      }
    }

    // Add any remaining words as the final chunk
    if (currentChunkWords.length > 0) {
      newChunks.push(currentChunkWords.join(' '));
    }

    // Only update chunks if they actually changed to avoid restarting timers unnecessarily
    setChunks((prev) => (JSON.stringify(prev) === JSON.stringify(newChunks) ? prev : newChunks));
  }, [captionText, trigger]);

  // Sequentially advance chunks synced to natural reading speed
  useEffect(() => {
    if (chunks.length <= 1) {
      setDisplayIndex(0);
      return;
    }

    // Always start from the beginning of the question when a new question arrives
    let currentIndex = 0;
    setDisplayIndex(0);
    let timeoutId: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      const currentChunk = chunks[currentIndex];
      if (!currentChunk) return;

      // Sync timing with ttsService.ts's own speech estimate (85ms per character)
      // with a minimum buffer so short chunks don't vanish instantly
      const durationMs = Math.max(currentChunk.length * 85, 2000);

      timeoutId = setTimeout(() => {
        currentIndex++;
        if (currentIndex < chunks.length) {
          setDisplayIndex(currentIndex);
          scheduleNext();
        }
      }, durationMs);
    };

    scheduleNext();

    return () => clearTimeout(timeoutId);
  }, [chunks]);

  const displayedText = chunks[displayIndex] || '';

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center">
      {/* Visible display chunk */}
      <div
        className={`caption ${visible ? 'show' : ''}`}
        id="caption"
        title={captionText ? `${captionText} (Full message in Live Conversation panel)` : undefined}
        style={{
          WebkitLineClamp: 'unset',
          display: 'block',
          overflow: 'visible',
          textOverflow: 'clip',
          height: 'auto',
          maxHeight: 'none',
        }}
      >
        {displayedText}
      </div>

      {/* Invisible measuring clone */}
      <div
        ref={measureRef}
        className="caption"
        aria-hidden="true"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          pointerEvents: 'none',
          WebkitLineClamp: 'unset',
          display: 'block',
          overflow: 'visible',
          height: 'auto',
          maxHeight: 'none',
          width: '100%',
          top: 0,
          left: 0,
          opacity: 0,
        }}
      />
    </div>
  );
};
