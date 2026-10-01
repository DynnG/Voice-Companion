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
  // 1. Top Decorative Brand Accent Bar
  // ---------------------------------------------------------------------------
  doc.setFillColor(4, 98, 65); // Savi Forest Emerald (#046241)
  doc.rect(0, 0, pageWidth, 5, 'F');

  // ---------------------------------------------------------------------------
  // 2. Header: Savi Branding + Session Context
  // ---------------------------------------------------------------------------
  // Brand Logo Text
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(4, 98, 65);
  doc.text('MockMate', margin, currentY + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(71, 85, 105); // slate-600
  doc.text(' ·  Interview Review', margin + 104, currentY + 16);

  // Right-aligned Date & Role Header
  const dateFormatted = data.completedAt || new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(dateFormatted, pageWidth - margin, currentY + 6, { align: 'right' });

  const roleText = `Target Role: ${data.jobRole || 'Software Developer'}`;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(roleText, pageWidth - margin, currentY + 20, { align: 'right' });

  currentY += 32;

  // Thin dividing line
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.75);
  doc.line(margin, currentY, pageWidth - margin, currentY);
  currentY += 14;

  // ---------------------------------------------------------------------------
  // 3. Session Summary Box
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

  const summaryBoxHeight = 52;
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(203, 213, 225); // slate-300
  doc.roundedRect(margin, currentY, contentWidth, summaryBoxHeight, 5, 5, 'FD');

  const colWidth = contentWidth / 3;

  // Summary Item 1: Questions Answered
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('QUESTIONS ANSWERED', margin + 14, currentY + 16);
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`${data.exchanges.length} ${data.exchanges.length === 1 ? 'Question' : 'Questions'}`, margin + 14, currentY + 36);

  // Summary Item 2: Total Duration
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('TOTAL DURATION', margin + colWidth + 14, currentY + 16);
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(durationStr, margin + colWidth + 14, currentY + 36);

  // Summary Item 3: Session Status
  const sessionStatusText = data.status || 'Completed';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('SESSION STATUS', margin + colWidth * 2 + 14, currentY + 16);
  doc.setFontSize(13);
  if (sessionStatusText === 'In Progress') {
    doc.setTextColor(217, 119, 6); // amber-600
  } else {
    doc.setTextColor(4, 98, 65); // forest emerald (#046241)
  }
  doc.text(sessionStatusText, margin + colWidth * 2 + 14, currentY + 36);

  currentY += summaryBoxHeight + 20;

  // ---------------------------------------------------------------------------
  // 4. Questions & Answers Section Header
  // ---------------------------------------------------------------------------
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(19, 48, 32);
  doc.text('Interview Questions & Candidate Answers', margin, currentY);
  currentY += 12;

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
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(4, 98, 65);
    doc.text(`Question ${orderNum}`, margin, currentY);
    currentY += 8;

    // --- A. PAL (Interviewer Question) Block ---
    const qText = ex.question ? `"${ex.question.trim()}"` : '"[Interview Question]"';
    doc.setFont('helvetica', 'normal');
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
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(4, 98, 65);
    doc.text('PAL (INTERVIEWER):', margin + 12, currentY + 12);

    // Question Text
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text(qLines, margin + 12, currentY + 24);

    currentY += qHeight + 8;

    // --- B. YOUR ANSWER Block ---
    const aText = ex.userAnswer ? `"${ex.userAnswer.trim()}"` : '"[No answer transcribed]"';
    doc.setFont('helvetica', 'normal');
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
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    const answerLabel = ex.durationSeconds && ex.durationSeconds > 0
      ? `YOUR ANSWER (Duration: ${ex.durationSeconds}s):`
      : 'YOUR ANSWER:';
    doc.text(answerLabel, margin + 12, currentY + 12);

    // Transcript Text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(aLines, margin + 12, currentY + 24);

    currentY += aHeight + 8;

    // --- C. AI NOTES Block ---
    const notes = (ex.aiNotes && ex.aiNotes.length > 0)
      ? ex.aiNotes
      : ['AI notes are unavailable right now.'];

    // Calculate AI Notes height
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    let totalNotesLines = 0;
    const splitNotes: string[][] = [];

    notes.forEach((note) => {
      const cleanNote = note.replace(/^[•\-\*]\s*/, '').trim();
      const lines = doc.splitTextToSize(`•  ${cleanNote}`, contentWidth - 28);
      splitNotes.push(lines);
      totalNotesLines += lines.length;
    });

    const notesHeight = Math.max(28, totalNotesLines * 11.5 + 20);

    ensureSpace(notesHeight + 14);

    // Notes Box Background (warm amber tint)
    doc.setFillColor(255, 251, 235); // amber-50
    doc.setDrawColor(254, 243, 199); // amber-200
    doc.roundedRect(margin, currentY, contentWidth, notesHeight, 4, 4, 'FD');

    // Left Accent Bar (warm amber)
    doc.setFillColor(217, 119, 6); // amber-600
    doc.rect(margin, currentY, 3.5, notesHeight, 'F');

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text('AI NOTES:', margin + 12, currentY + 12);

    // Bullet Points
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);

    let noteY = currentY + 24;
    splitNotes.forEach((lines) => {
      doc.text(lines, margin + 12, noteY);
      noteY += lines.length * 11.5;
    });

    currentY += notesHeight + 16;

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
    doc.setFont('helvetica', 'normal');
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
