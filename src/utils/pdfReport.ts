import { jsPDF } from 'jspdf';
import { AnalysisResult } from '../types/analysis.ts';

export function formatClassificationLabel(classification: AnalysisResult['classification']): string {
  switch (classification) {
    case 'LIKELY_AUTHENTIC':
      return 'Likely Authentic';
    case 'SUSPICIOUS':
      return 'Suspicious';
    case 'LIKELY_MANIPULATED_OR_AI_GENERATED':
      return 'Likely Manipulated / AI-Generated';
    default:
      return classification;
  }
}

/**
 * Generates and downloads a structured PDF report for a TruthLens AI analysis.
 */
export function downloadAnalysisPdfReport(result: AnalysisResult): void {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const contentWidth = pageWidth - margin * 2;
  let y = 44;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 56) {
      doc.addPage();
      y = 44;
    }
  };

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 82, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(248, 250, 252);
  doc.text('TruthLens AI — Content Authenticity Report', margin, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Analysis ID: ${result.id}   ·   Date: ${new Date(result.createdAt).toLocaleString()}   ·   Mode: ${
      result.isDemo ? 'DEMO RESULT' : 'Live AI Assessment'
    }`,
    margin,
    56
  );

  y = 108;

  // Primary Assessment Box
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentWidth, 74, 4, 4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('AUTHENTICITY ASSESSMENT', margin + 16, y + 22);

  doc.setFontSize(15);
  if (result.classification === 'LIKELY_AUTHENTIC') {
    doc.setTextColor(22, 163, 74);
  } else if (result.classification === 'SUSPICIOUS') {
    doc.setTextColor(217, 119, 6);
  } else {
    doc.setTextColor(220, 38, 38);
  }
  doc.text(formatClassificationLabel(result.classification).toUpperCase(), margin + 16, y + 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Input Type: ${result.analysisType.toUpperCase()}   ·   Reference: ${result.inputReference.slice(0, 68)}`,
    margin + 16,
    y + 62
  );

  // Right side score in box
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Risk Score: ${result.riskScore}/100`,
    pageWidth - margin - 16,
    y + 34,
    { align: 'right' }
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Confidence: ${Math.round(result.confidence * 100)}% (${result.riskTier})`,
    pageWidth - margin - 16,
    y + 52,
    { align: 'right' }
  );

  y += 96;

  // Executive Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Executive Summary', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  const summaryLines = doc.splitTextToSize(result.summary, contentWidth);
  doc.text(summaryLines, margin, y);
  y += summaryLines.length * 14 + 14;

  // Component Risk Breakdown
  ensureSpace(90);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Transparent Risk Breakdown', margin, y);
  y += 16;

  const components = [
    { label: 'Source Signals (20%)', val: result.breakdown.source },
    { label: 'Content Signals (20%)', val: result.breakdown.content },
    { label: 'Metadata Signals (15%)', val: result.breakdown.metadata },
    { label: 'Visual / Media Signals (30%)', val: result.breakdown.visual },
    { label: 'AI Engine Assessment (15%)', val: result.breakdown.aiAssessment },
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  for (const comp of components) {
    doc.setTextColor(51, 65, 85);
    doc.text(comp.label, margin, y);
    doc.text(`${comp.val} / 100`, margin + 210, y);
    doc.setFillColor(226, 232, 240);
    doc.rect(margin + 260, y - 8, 180, 8, 'F');
    doc.setFillColor(14, 165, 233);
    doc.rect(margin + 260, y - 8, Math.max(4, (comp.val / 100) * 180), 8, 'F');
    y += 16;
  }
  y += 10;

  // Explanation System
  ensureSpace(120);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('3. Forensic Assessment Explanation', margin, y);
  y += 16;

  const expBlocks = [
    { title: 'What Was Detected:', body: result.explanation.whatDetected },
    { title: 'Why It Matters:', body: result.explanation.whyItMatters },
    { title: 'Confidence & Uncertainty:', body: result.explanation.confidenceReasoning },
    { title: 'What To Verify:', body: result.explanation.whatToVerify },
  ];

  for (const blk of expBlocks) {
    ensureSpace(55);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(30, 41, 59);
    doc.text(blk.title, margin, y);
    y += 13;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(71, 85, 105);
    const lines = doc.splitTextToSize(blk.body, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 13 + 8;
  }

  // Detected Signals
  ensureSpace(90);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`4. Detected Signals (${result.signals.length})`, margin, y);
  y += 16;

  for (const sig of result.signals) {
    ensureSpace(56);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(15, 23, 42);
    doc.text(
      `[${sig.severity.toUpperCase()}] ${sig.category.toUpperCase()} — ${sig.description}`,
      margin,
      y
    );
    y += 13;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    const evLines = doc.splitTextToSize(
      `Evidence: ${sig.evidence} (Confidence: ${Math.round(sig.confidence * 100)}%)`,
      contentWidth - 12
    );
    doc.text(evLines, margin + 10, y);
    y += evLines.length * 12 + 8;
  }

  // Evidence & Metadata Summary
  ensureSpace(80);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('5. Technical Evidence & Metadata', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);

  if (result.urlData) {
    const metaLines = [
      `Source Domain: ${result.urlData.domain} (HTTPS: ${result.urlData.isHttps ? 'Yes' : 'No'})`,
      `Author: ${result.urlData.author}   ·   Published: ${result.urlData.publishedDate}`,
      `Word Count: ${result.urlData.wordCount}   ·   Embedded Images: ${result.urlData.imageCount}   ·   External Links: ${result.urlData.externalLinksCount}`,
      `Schema.org Types: ${result.urlData.schemaOrgTypes.join(', ') || 'None'}`,
    ];
    for (const line of metaLines) {
      doc.text(line, margin, y);
      y += 14;
    }
  } else if (result.imageMetadata) {
    const imgLines = [
      `Filename: ${result.imageMetadata.filename}   ·   Format: ${result.imageMetadata.extension} (${result.imageMetadata.mimeType})`,
      `Resolution: ${result.imageMetadata.width} × ${result.imageMetadata.height} px   ·   Size: ${result.imageMetadata.fileSizeFormatted}`,
      `Color Mode: ${result.imageMetadata.colorMode}   ·   Compression: ${result.imageMetadata.compressionInfo}`,
      `EXIF Camera: ${result.imageMetadata.exif.cameraMakeModel || 'Not Available'}   ·   Timestamp: ${result.imageMetadata.exif.timestamp || 'Not Available'}`,
      `SHA-256: ${result.imageMetadata.sha256Hash}`,
    ];
    for (const line of imgLines) {
      doc.text(line, margin, y);
      y += 14;
    }
  }
  y += 10;

  // Recommendations
  ensureSpace(80);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('6. Recommended Verification Actions', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(51, 65, 85);
  result.recommendations.forEach((rec, i) => {
    ensureSpace(28);
    const lines = doc.splitTextToSize(`${i + 1}. ${rec}`, contentWidth);
    doc.text(lines, margin, y);
    y += lines.length * 13 + 4;
  });

  // Responsible AI Disclaimer Footer
  ensureSpace(75);
  y += 12;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 14;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  doc.text('LIMITATIONS & RESPONSIBLE AI DISCLAIMER', margin, y);
  y += 12;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const disclaimer =
    'This report represents an automated AI-based probabilistic assessment generated by TruthLens AI. It is not definitive forensic proof of authenticity or falsification. A suspicious score does not prove content is false, and an authentic score does not guarantee content is true. Users should independently verify important claims using primary sources.';
  const discLines = doc.splitTextToSize(disclaimer, contentWidth);
  doc.text(discLines, margin, y);

  doc.save(`TruthLens_AI_Report_${result.id}.pdf`);
}
