import React from 'react';

interface ResponseCaptionProps {
  captionText: string;
  visible: boolean;
}

export const ResponseCaption: React.FC<ResponseCaptionProps> = ({ captionText, visible }) => {
  return (
    <div
      className={`caption ${visible ? 'show' : ''}`}
      id="caption"
      title={captionText ? `${captionText} (Full message in Live Conversation panel)` : undefined}
    >
      {captionText}
    </div>
  );
};
