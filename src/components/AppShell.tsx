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
}

export const AppShell: React.FC<AppShellProps> = (props) => {
  const {
    children,
    onNewInterview,
    isLivePanelOpen,
    onToggleLivePanel,
    activeRole,
    showNewInterviewButton = false,
  } = props;
  return (
    <div className="w-screen h-screen flex flex-col bg-[#04170F] text-[#F5EEDB] overflow-hidden select-none font-manrope relative">
      {/* ============================================================== */}
      {/* 0. RICH BOTANICAL ATMOSPHERIC BACKGROUND (Z-0, BEHIND ALL UI)   */}
      {/* ============================================================== */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden select-none z-0" aria-hidden="true">
        {/* Base dark botanical image texture with soft screen blend */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-screen"
          style={{ backgroundImage: "url('/botanical-bg.jpg')" }}
        />

        {/* TOP: subtle green/amber atmospheric glow behind header titles */}
        <div
          className="absolute top-0 left-0 right-0 h-[280px]"
          style={{
            background:
              'radial-gradient(ellipse 900px 240px at 30% 0%, rgba(4, 98, 65, 0.50), transparent 70%), radial-gradient(ellipse 550px 180px at 15% 0%, rgba(255, 179, 71, 0.18), transparent 65%)'
          }}
        />

        {/* LEFT: soft organic green illumination behind Candidate Camera */}
        <div
          className="absolute top-[15%] left-0 w-[650px] h-[650px]"
          style={{
            background:
              'radial-gradient(circle 500px at 25% 45%, rgba(4, 98, 65, 0.55), rgba(19, 48, 32, 0.30) 45%, transparent 75%), radial-gradient(circle 360px at 18% 50%, rgba(142, 182, 155, 0.20), transparent 65%)'
          }}
        />

        {/* CENTER: restrained dark green background with subtle atmospheric depth */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 1100px 750px at 48% 50%, rgba(19, 48, 32, 0.45), transparent 80%)'
          }}
        />

        {/* AROUND SAVI: stronger ambient green/amber glow to complement the orb */}
        <div
          className="absolute top-[8%] right-[15%] md:right-[22%] w-[720px] h-[720px]"
          style={{
            background:
              'radial-gradient(circle 460px at 50% 50%, rgba(255, 179, 71, 0.25), rgba(255, 195, 112, 0.10) 42%, transparent 70%), radial-gradient(circle 620px at 50% 50%, rgba(4, 98, 65, 0.60), rgba(19, 48, 32, 0.32) 50%, transparent 80%)'
          }}
        />
        {/* Soft luminous aura center directly under Savi */}
        <div
          className="absolute top-[20%] right-[22%] md:right-[28%] w-[340px] h-[340px] rounded-full blur-[75px]"
          style={{
            background: 'radial-gradient(circle, rgba(255, 179, 71, 0.24) 0%, rgba(4, 98, 65, 0.40) 60%, transparent 80%)'
          }}
        />

        {/* BOTTOM: subtle warm amber/green curved highlight behind controls */}
        <div
          className="absolute bottom-0 left-0 right-0 h-[320px]"
          style={{
            background:
              'radial-gradient(ellipse 950px 280px at 45% 100%, rgba(255, 179, 71, 0.20), rgba(4, 98, 65, 0.42) 42%, transparent 75%)'
          }}
        />

        {/* RIGHT: darker background vignette behind transcript for clean rounded contrast */}
        <div
          className="absolute top-0 right-0 bottom-0 w-[480px]"
          style={{
            background:
              'linear-gradient(to left, rgba(4, 23, 15, 0.95) 0%, rgba(4, 23, 15, 0.82) 340px, transparent 100%)'
          }}
        />

        {/* SUBTLE BOTANICAL SILHOUETTES & PARTICLES (Organic vector details) */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.18] mix-blend-screen pointer-events-none"
          viewBox="0 0 1440 900"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Top-Left botanical foliage silhouette */}
          <path
            d="M-20 -20 C 120 40, 180 160, 140 280 C 110 220, 80 180, 20 150 C 90 200, 110 270, 70 340 C 50 290, 20 260, -30 250 Z"
            fill="url(#botanicalGreenGlow)"
          />
          <path
            d="M40 -30 C 160 30, 240 120, 220 220 C 190 170, 150 140, 90 120 C 170 160, 190 230, 150 300 C 130 250, 90 220, 30 200 Z"
            fill="url(#botanicalAmberGlow)"
            opacity="0.65"
          />

          {/* Left-Middle organic vine curve */}
          <path
            d="M-40 380 C 80 420, 140 500, 110 600 C 90 540, 60 500, 0 480 C 70 520, 80 580, 40 650 Z"
            fill="url(#botanicalGreenGlow)"
          />

          {/* Bottom-Left gentle leaf frond */}
          <path
            d="M-10 720 C 100 700, 180 760, 200 860 C 160 820, 110 800, 50 810 C 130 840, 150 910, 120 950 Z"
            fill="url(#botanicalGreenGlow)"
          />

          {/* Ambient organic micro-spores / particles */}
          <circle cx="280" cy="220" r="2.5" fill="#FFC370" opacity="0.5" />
          <circle cx="340" cy="180" r="1.5" fill="#4fbf83" opacity="0.55" />
          <circle cx="880" cy="260" r="2" fill="#FFB347" opacity="0.65" />
          <circle cx="940" cy="310" r="1.5" fill="#FFC370" opacity="0.55" />
          <circle cx="760" cy="190" r="2" fill="#4fbf83" opacity="0.6" />
          <circle cx="820" cy="380" r="1.5" fill="#FFB347" opacity="0.45" />
          <circle cx="520" cy="740" r="2" fill="#4fbf83" opacity="0.45" />
          <circle cx="620" cy="790" r="1.5" fill="#FFB347" opacity="0.5" />

          <defs>
            <linearGradient id="botanicalGreenGlow" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#4fbf83" stopOpacity="0.85" />
              <stop offset="60%" stopColor="#046241" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#133020" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="botanicalAmberGlow" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#FFC370" stopOpacity="0.75" />
              <stop offset="50%" stopColor="#FFB347" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#133020" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Top Application Shell Navbar - Seamlessly blended into atmospheric background */}
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

      {/* Main Layout Workspace */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {children}
      </div>
    </div>
  );
};

