import React from 'react';
import { Plus, MessageSquare } from 'lucide-react';

interface AppShellProps {
  children: React.ReactNode;
  onNewInterview: () => void;
  isLivePanelOpen: boolean;
  onToggleLivePanel: () => void;
  activeRole?: string;
  showNewInterviewButton?: boolean;
  isCompleted?: boolean;
  onOpenReview?: () => void;
  canDownloadReview?: boolean;
  onDownloadReview?: () => void;
  isDownloadingReview?: boolean;
  isInterviewActive?: boolean;
}

export const AppShell: React.FC<AppShellProps> = (props) => {
  const {
    children,
    onNewInterview,
    isLivePanelOpen,
    onToggleLivePanel,
    activeRole,
    showNewInterviewButton = false,
    isInterviewActive = false,
  } = props;
  return (
    <div className="w-screen h-screen flex flex-col bg-[#030d08] text-[#F5EEDB] overflow-hidden select-none font-manrope relative">
      {/* ========================================================================= */}
      {/* 0. ATMOSPHERIC DEEP FOREST BACKGROUND (MATCHING REFERENCE SPECIFICATION) */}
      {/* 80-85% Dark Serpent (#133020) & deep emerald, 15-20% visible Saffron (#FFB347) */}
      {/* ========================================================================= */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden select-none z-0" aria-hidden="true">
        {/* Layer 1: Base depth gradient: Dark Serpent (#133020) blending into near-black emerald (#030d08) */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 1400px 900px at 50% 45%, #0e2d1f 0%, #071e14 42%, #030d08 100%)'
          }}
        />

        {/* Layer 2: TOP-LEFT: Clearly visible diagonal warm Saffron (#FFB347) ambient lighting sweep matching reference image */}
        <div
          className="absolute top-0 left-0 w-[950px] h-[440px]"
          style={{
            background:
              'radial-gradient(ellipse 850px 380px at 26% 0%, rgba(255, 179, 71, 0.26) 0%, rgba(255, 195, 112, 0.14) 36%, rgba(19, 48, 32, 0.40) 65%, transparent 85%), linear-gradient(135deg, rgba(255, 179, 71, 0.20) 0%, rgba(255, 179, 71, 0.06) 30%, transparent 60%)'
          }}
        />

        {/* Layer 3: LEFT MARGIN: Warm golden ambient illumination spilling from left edge between camera & audio cards */}
        <div
          className="absolute top-[18%] left-0 w-[420px] h-[640px]"
          style={{
            background:
              'radial-gradient(ellipse 380px 580px at 0% 50%, rgba(255, 179, 71, 0.24) 0%, rgba(255, 179, 71, 0.10) 40%, rgba(19, 48, 32, 0.35) 68%, transparent 88%)'
          }}
        />

        {/* Layer 4: AROUND SAVI ORB: Warm Saffron (#FFB347) & deep emerald ambient aura complementing the orb */}
        <div
          className="absolute top-[4%] right-[12%] md:right-[18%] w-[740px] h-[740px]"
          style={{
            background:
              'radial-gradient(circle 460px at 50% 50%, rgba(255, 179, 71, 0.22) 0%, rgba(255, 195, 112, 0.12) 35%, rgba(19, 48, 32, 0.45) 60%, transparent 80%)'
          }}
        />
        {/* Soft luminous center aura directly behind Savi */}
        <div
          className="absolute top-[16%] right-[18%] md:right-[24%] w-[340px] h-[340px] rounded-full blur-[75px]"
          style={{
            background:
              'radial-gradient(circle, rgba(255, 179, 71, 0.26) 0%, rgba(255, 195, 112, 0.12) 40%, rgba(19, 48, 32, 0.35) 60%, transparent 80%)'
          }}
        />

        {/* Layer 5: BOTTOM CONTROLS & SPEAK BUTTON: Luminous golden ambient aura centered behind Speak */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[360px]"
          style={{
            background:
              'radial-gradient(ellipse 1150px 320px at 42% 100%, rgba(255, 179, 71, 0.26) 0%, rgba(255, 179, 71, 0.12) 45%, rgba(19, 48, 32, 0.45) 70%, transparent 92%), radial-gradient(circle 320px at 45% 94%, rgba(255, 179, 71, 0.32) 0%, rgba(255, 179, 71, 0.15) 45%, transparent 80%)'
          }}
        />

        {/* Layer 6: RIGHT: Darker near-black vignette behind transcript for crisp glassmorphism edge contrast */}
        <div
          className="absolute top-0 right-0 bottom-0 w-[480px]"
          style={{
            background:
              'linear-gradient(to left, rgba(3, 13, 8, 0.96) 0%, rgba(3, 13, 8, 0.78) 360px, transparent 100%)'
          }}
        />

        {/* Layer 7: Silky atmospheric ambient wave lighting (matching reference image's smooth organic ribbons) */}
        {/* Top-left diagonal ambient ribbon */}
        <svg
          className="absolute top-0 left-0 w-[960px] h-[360px] pointer-events-none mix-blend-screen"
          viewBox="0 0 960 360"
          fill="none"
        >
          <path
            d="M-60,15 Q340,135 680,50 T1000,90"
            stroke="url(#topGoldStroke)"
            strokeWidth="1.5"
            opacity="0.45"
            fill="none"
          />
          <defs>
            <linearGradient id="topGoldStroke" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFC370" stopOpacity="0.70" />
              <stop offset="45%" stopColor="#FFB347" stopOpacity="0.38" />
              <stop offset="85%" stopColor="#133020" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#133020" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Bottom ambient flowing wave ribbons behind Speak / Camera controls */}
        <svg
          className="absolute bottom-0 left-0 right-0 w-full h-[240px] pointer-events-none mix-blend-screen"
          viewBox="0 0 1440 240"
          fill="none"
          preserveAspectRatio="none"
        >
          <path
            d="M-80,200 Q350,110 780,165 T1520,120 L1520,240 L-80,240 Z"
            fill="url(#bottomAmbientGrad)"
            opacity="0.32"
          />
          <path
            d="M-60,215 Q400,125 880,180 T1520,135"
            stroke="url(#bottomGoldStroke1)"
            strokeWidth="1.5"
            opacity="0.55"
            fill="none"
          />
          <path
            d="M-100,230 Q300,160 740,210 T1540,170"
            stroke="url(#bottomGoldStroke2)"
            strokeWidth="1"
            opacity="0.35"
            fill="none"
          />
          <defs>
            <linearGradient id="bottomAmbientGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="10%" stopColor="#FFB347" stopOpacity="0.22" />
              <stop offset="50%" stopColor="#FFC370" stopOpacity="0.10" />
              <stop offset="85%" stopColor="#133020" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#030d08" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="bottomGoldStroke1" x1="0" y1="0" x2="1" y2="0">
              <stop offset="5%" stopColor="#FFB347" stopOpacity="0" />
              <stop offset="25%" stopColor="#FFC370" stopOpacity="0.65" />
              <stop offset="55%" stopColor="#FFB347" stopOpacity="0.45" />
              <stop offset="85%" stopColor="#133020" stopOpacity="0.10" />
              <stop offset="100%" stopColor="#133020" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="bottomGoldStroke2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="15%" stopColor="#FFB347" stopOpacity="0" />
              <stop offset="40%" stopColor="#FFB347" stopOpacity="0.40" />
              <stop offset="70%" stopColor="#FFC370" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#133020" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Layer 8: Subtle ambient stardust micro-particles around Savi (clean dots, zero foliage) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle cx="280" cy="220" r="1.5" fill="#FFC370" opacity="0.35" />
          <circle cx="340" cy="180" r="1.2" fill="#8EB69B" opacity="0.35" />
          <circle cx="880" cy="260" r="1.8" fill="#FFB347" opacity="0.55" />
          <circle cx="940" cy="310" r="1.2" fill="#FFC370" opacity="0.45" />
          <circle cx="760" cy="190" r="1.6" fill="#8EB69B" opacity="0.40" />
          <circle cx="820" cy="380" r="1.2" fill="#FFB347" opacity="0.40" />
          <circle cx="520" cy="740" r="1.5" fill="#8EB69B" opacity="0.30" />
          <circle cx="620" cy="790" r="1.2" fill="#FFB347" opacity="0.45" />
        </svg>
      </div>

      {/* Top Application Shell Navbar - Seamlessly blended into atmospheric background (hidden during active interview) */}
      {!isInterviewActive && (
        <header className="h-14 bg-transparent px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 relative">
          {/* Left Section: Brand, Metadata & Action */}
          <div className="flex items-center gap-3 sm:gap-3.5 min-w-0">
            {/* Savi Brand Logo & Title */}
            <div className="flex items-center gap-2.5 shrink-0">
              <svg viewBox="0 0 40 40" aria-hidden="true" className="w-7 h-7 shrink-0">
                <path d="M20 4c8 3 12 10 8 17-3-6-8-8-14-8 0-4 2-7 6-9z" fill="#FFB347"/>
                <path d="M36 20c-3 8-10 12-17 8 6-3 8-8 8-14 4 0 7 2 9 6z" fill="#4fbf83"/>
                <path d="M20 36c-8-3-12-10-8-17 3 6 8 8 14 8 0 4-2 7-6 9z" fill="#FFB347" opacity=".8"/>
                <path d="M4 20c3-8 10-12 17-8-6 3-8 8-8 14-4 0-7-2-9-6z" fill="#2f8f5c"/>
              </svg>
              <span className="font-fraunces font-normal text-xl tracking-tight text-[#F5EEDB] leading-none">
                Savi
              </span>
            </div>

            {/* Subtle Vertical Divider */}
            <span className="w-px h-6 bg-[rgba(218,241,222,0.14)] shrink-0" />

            {/* AI Mock Interview & Job Role Metadata */}
            <div className="flex flex-col justify-center min-w-0 pr-1">
              <span className="font-manrope font-semibold text-xs sm:text-[13px] text-[#F5EEDB] leading-tight truncate">
                AI Mock Interview
              </span>
              <span className="font-manrope text-[11px] text-[#8EB69B] leading-tight truncate">
                {activeRole || 'Software Developer'}
              </span>
            </div>

            {/* Subtle Divider before Action & New Interview Button */}
            {showNewInterviewButton && (
              <>
                <span className="w-px h-6 bg-[rgba(218,241,222,0.14)] shrink-0 hidden sm:block" />
                <button
                  onClick={onNewInterview}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-manrope font-semibold bg-[rgba(9,32,23,0.55)] hover:bg-[rgba(9,32,23,0.80)] backdrop-blur-xl text-[#F5EEDB] border border-[rgba(218,241,222,0.12)] border-t-[rgba(245,238,219,0.24)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.16),0_4px_16px_rgba(0,0,0,0.25)] active:scale-95 transition-all"
                  title="Start a new interview session"
                >
                  <Plus className="w-3.5 h-3.5 text-[#FFB347]" />
                  <span>New Interview</span>
                </button>
              </>
            )}

            {/* Note: "Download Interview Review" excluded from top navigation per design requirement; download remains inside transcript */}
          </div>

          {/* Right Section: Transcript Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onToggleLivePanel}
              className={`
                flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-manrope font-semibold transition-all duration-200 border shadow-xs
                ${
                  isLivePanelOpen
                    ? 'bg-[rgba(255,179,71,0.16)] backdrop-blur-xl text-[#FFB347] border border-[rgba(255,179,71,0.35)] border-t-[rgba(255,195,112,0.50)] shadow-[inset_0_1px_1px_rgba(255,195,112,0.20),0_0_16px_rgba(255,179,71,0.20)]'
                    : 'bg-[rgba(9,32,23,0.55)] backdrop-blur-xl text-[#F5EEDB] border border-[rgba(218,241,222,0.12)] border-t-[rgba(245,238,219,0.24)] hover:bg-[rgba(9,32,23,0.80)] hover:border-[rgba(255,179,71,0.35)] hover:border-t-[rgba(255,195,112,0.45)] shadow-[inset_0_1px_1px_rgba(245,238,219,0.16),0_4px_16px_rgba(0,0,0,0.25)]'
                }
              `}
              aria-expanded={isLivePanelOpen}
              title="Toggle Transcript Panel"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#FFB347]" />
              <span>Transcript</span>
            </button>
          </div>
        </header>
      )}

      {/* Main Layout Workspace */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {children}
      </div>
    </div>
  );
};

