import { displayCoachingNotes, coachingNoteLabels } from './coachingNoteStyle';
/**
 * Savi Session-Only PDF Review Generator
 *
 * Generates clean, professional, multi-page PDF reviews for completed interview sessions
 * directly in the browser using jsPDF.
 *
 * Privacy Guarantees:
 * - Purely client-side generation using session memory only.
 * - Zero database writes, zero backend uploads, zero persistence.
 * - Downloaded directly via browser blob.
 */

import { jsPDF } from 'jspdf';
import { manropeRegular, manropeBold, frauncesRegular } from '../assets/pdf-fonts/embeddedFonts';

import { InterviewExchangeRecord } from '../types/conversation';

export interface InterviewReviewPdfData {
  jobRole: string;
  exchanges: InterviewExchangeRecord[];
  startTime?: number;
  endTime?: number;
  completedAt?: string;
  interviewId?: string;
  status?: 'In Progress' | 'Completed' | string;
}

/**
 * Generate and trigger download for the interview review PDF.
 */
export async function generateInterviewReviewPdf(data: InterviewReviewPdfData): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  // Embed the same font families configured by the Savi UI. No network requests.
  doc.addFileToVFS('Manrope-Regular.ttf', manropeRegular);
  doc.addFont('Manrope-Regular.ttf', 'Manrope', 'normal');
  doc.addFileToVFS('Manrope-Bold.ttf', manropeBold);
  doc.addFont('Manrope-Bold.ttf', 'Manrope', 'bold');
  doc.addFileToVFS('Fraunces-Regular.ttf', frauncesRegular);
  doc.addFont('Fraunces-Regular.ttf', 'Fraunces', 'normal');

  const pageWidth = doc.internal.pageSize.getWidth(); // 595.28 pt
  const pageHeight = doc.internal.pageSize.getHeight(); // 841.89 pt
  const margin = 40;
  const contentWidth = pageWidth - margin * 2; // 515.28 pt
  const bottomMargin = 45;
  const topMargin = 42;
  let currentY = topMargin;

  // Helper for page break checks
  const ensureSpace = (neededHeight: number) => {
    if (currentY + neededHeight > pageHeight - bottomMargin) {
      doc.addPage();
      currentY = topMargin;
      return true;
    }
    return false;
  };

  // ---------------------------------------------------------------------------
  // 1. Minimal Savi Header
  // ---------------------------------------------------------------------------
  // Keep the UI's Fraunces wordmark; the PDF header has no logo icon.

  doc.setFont('Fraunces', 'normal');
  doc.setFontSize(26);
  doc.setTextColor(19, 48, 32);
  doc.text('Savi', margin, currentY + 40);
  currentY += 64;

  doc.setFont('Fraunces', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(19, 48, 32);
  doc.text('Interview Review', margin, currentY);
  const titleY = currentY;

  doc.setFont('Manrope', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const roleText = `Target Role: ${data.jobRole || 'Software Developer'}`;
  const metadataWidth = contentWidth * 0.48;
  const metadataX = pageWidth - margin;
  const metadataY = topMargin + 27;
  const roleLines = doc.splitTextToSize(roleText, metadataWidth);
  doc.text(roleLines, metadataX, metadataY, { align: 'right', lineHeightFactor: 1.4 });

  const reviewDate = data.completedAt ? new Date(data.completedAt) : new Date();
  const dateFormatted = Number.isNaN(reviewDate.getTime())
    ? data.completedAt!
    : reviewDate.toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric'
    });
  const dateY = metadataY + roleLines.length * 14;
  doc.text(dateFormatted, metadataX, dateY, { align: 'right' });
  currentY = Math.max(titleY, dateY) + 20;

  doc.setDrawColor(213, 226, 218);
  doc.setLineWidth(0.6);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 12;

  // ---------------------------------------------------------------------------
  // 2. Centered session summary
  // ---------------------------------------------------------------------------
  let durationStr = 'N/A';
  if (data.startTime && data.endTime && data.endTime > data.startTime) {
    const elapsedSec = Math.max(1, Math.round((data.endTime - data.startTime) / 1000));
    const mins = Math.floor(elapsedSec / 60);
    const secs = elapsedSec % 60;
    durationStr = `${mins}m ${secs}s`;
  } else if (data.exchanges.length > 0) {
    const totalSecs = data.exchanges.reduce((sum, e) => sum + (e.durationSeconds || 0), 0);
    if (totalSecs > 0) {
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      durationStr = `${mins}m ${secs}s`;
    }
  }

  const summaryBoxHeight = 56;
  const colWidth = contentWidth / 3;
  const sessionStatusText = data.status || 'Completed';
  doc.setFillColor(246, 250, 247);
  doc.setDrawColor(213, 226, 218);
  doc.roundedRect(margin, currentY, contentWidth, summaryBoxHeight, 6, 6, 'FD');
  const summaryItems = [
    ['QUESTIONS ANSWERED', `${data.exchanges.length} ${data.exchanges.length === 1 ? 'Question' : 'Questions'}`],
    ['TOTAL DURATION', durationStr],
    ['SESSION STATUS', sessionStatusText],
  ];
  summaryItems.forEach(([label, value], index) => {
    const centerX = margin + colWidth * (index + 0.5);
    if (index > 0) doc.line(margin + colWidth * index, currentY + 12, margin + colWidth * index, currentY + summaryBoxHeight - 12);
    doc.setFont('Manrope', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(label, centerX, currentY + 19, { align: 'center' });
    doc.setFontSize(11);
    if (index === 2 && sessionStatusText === 'In Progress') doc.setTextColor(217, 119, 6);
    else if (index === 2) doc.setTextColor(4, 98, 65);
    else doc.setTextColor(15, 23, 42);
    const valueLines = doc.splitTextToSize(value, colWidth - 20);
    doc.text(valueLines, centerX, currentY + 38, { align: 'center' });
  });
  currentY += summaryBoxHeight + 30;

  // ---------------------------------------------------------------------------
  // 5. Render Each Question / Answer / AI Notes Exchange
  // ---------------------------------------------------------------------------
  const exchanges = data.exchanges || [];

  for (let idx = 0; idx < exchanges.length; idx++) {
    const ex = exchanges[idx];
    const orderNum = idx + 1;

    // Estimate exchange height to prevent awkward page fragmentation
    ensureSpace(80);

    // --- Exchange Container Header ---
    doc.setFont('Manrope', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(4, 98, 65);
    doc.text(`Question ${orderNum}`, margin, currentY);
    currentY += 8;

    // --- A. Savi (Interviewer Question) Block ---
    const qText = ex.question ? `"${ex.question.trim()}"` : '"[Interview Question]"';
    doc.setFont('Manrope', 'normal');
    doc.setFontSize(9.5);
    const qLines = doc.splitTextToSize(qText, contentWidth - 28);
    const qHeight = Math.max(28, qLines.length * 12 + 18);

    ensureSpace(qHeight + 10);

    // Question Box Background (light emerald tint)
    doc.setFillColor(240, 253, 244); // emerald-50
    doc.setDrawColor(187, 247, 208); // emerald-200
    doc.roundedRect(margin, currentY, contentWidth, qHeight, 4, 4, 'FD');

    // Left Accent Bar (emerald)
    doc.setFillColor(4, 98, 65);
    doc.rect(margin, currentY, 3.5, qHeight, 'F');

    // Label
    doc.setFont('Manrope', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(4, 98, 65);
    doc.text('SAVI (INTERVIEWER):', margin + 12, currentY + 12);

    // Question Text
    doc.setFont('Manrope', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text(qLines, margin + 12, currentY + 24);

    currentY += qHeight + 8;

    // --- B. YOUR ANSWER Block ---
    const aText = ex.userAnswer ? `"${ex.userAnswer.trim()}"` : '"[No answer transcribed]"';
    doc.setFont('Manrope', 'normal');
    doc.setFontSize(9.5);
    const aLines = doc.splitTextToSize(aText, contentWidth - 28);
    const aHeight = Math.max(30, aLines.length * 12 + 20);

    ensureSpace(aHeight + 10);

    // Answer Box Background (light slate tint)
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(margin, currentY, contentWidth, aHeight, 4, 4, 'FD');

    // Left Accent Bar (slate dark)
    doc.setFillColor(51, 65, 85); // slate-700
    doc.rect(margin, currentY, 3.5, aHeight, 'F');

    // Label
    doc.setFont('Manrope', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    const answerLabel = ex.durationSeconds && ex.durationSeconds > 0
      ? `YOUR ANSWER (Duration: ${ex.durationSeconds}s):`
      : 'YOUR ANSWER:';
    doc.text(answerLabel, margin + 12, currentY + 12);

    // Transcript Text
    doc.setFont('Manrope', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(aLines, margin + 12, currentY + 24);

    currentY += aHeight + 8;

    // --- C. AI NOTES Block ---
    const notes = (ex.aiNotes && ex.aiNotes.length > 0)
      ? ex.aiNotes
      : ['AI notes are unavailable right now.'];

    doc.setFont('Manrope', 'bold');
    doc.setFontSize(8);
    ensureSpace(58);
    doc.setTextColor(19, 48, 32);
    doc.text('AI NOTES', margin, currentY + 10);
    currentY += 18;
    for (const { text, kind } of displayCoachingNotes(notes)) {
      const colors = {
        strength: { background: [240, 253, 244], accent: [4, 98, 65] },
        improvement: { background: [255, 248, 232], accent: [180, 83, 9] },
        advice: { background: [239, 246, 255], accent: [48, 89, 145] },
        feedback: { background: [246, 250, 247], accent: [71, 101, 84] },
      }[kind];
      doc.setFont('Manrope', 'normal');
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(text.replace(/^[�\-\*]\s*/, '').trim(), contentWidth - 28);
      const height = lines.length * 13 + 30;
      ensureSpace(height + 8);
      doc.setFillColor(colors.background[0], colors.background[1], colors.background[2]);
      doc.setDrawColor(colors.accent[0], colors.accent[1], colors.accent[2]);
      doc.setLineWidth(0.5);
      doc.roundedRect(margin, currentY, contentWidth, height, 6, 6, 'FD');
      doc.setFillColor(colors.accent[0], colors.accent[1], colors.accent[2]);
      doc.rect(margin, currentY + 6, 2.5, height - 12, 'F');
      doc.setTextColor(colors.accent[0], colors.accent[1], colors.accent[2]);
      doc.setFont('Manrope', 'bold');
      doc.setFontSize(8);
      doc.text(coachingNoteLabels[kind], margin + 12, currentY + 14);
      doc.setFont('Manrope', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(30, 41, 59);
      doc.text(lines, margin + 12, currentY + 29, { lineHeightFactor: 13 / 9 });
      currentY += height + 8;
    }
    currentY += 8;

    // Divider between exchanges (except last)
    if (idx < exchanges.length - 1) {
      doc.setDrawColor(241, 245, 249); // slate-100
      doc.setLineWidth(0.5);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 14;
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Running Page Footers & Numbers (All Pages)
  // ---------------------------------------------------------------------------
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);

    // Footer divider line
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30);

    // Footer text
    doc.setFont('Manrope', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    doc.text('Savi · Confidential Interview Review · Session-Only', margin, pageHeight - 18);
    doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 18, { align: 'right' });
  }

  // ---------------------------------------------------------------------------
  // 7. Save / Trigger Browser Download
  // ---------------------------------------------------------------------------
  const cleanRole = (data.jobRole || 'Interview').replace(/[^a-zA-Z0-9_-]/g, '_');
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `Savi-Interview-Review-${cleanRole}-${dateStamp}.pdf`;

  doc.save(filename);
}

