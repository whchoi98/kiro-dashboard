'use client';

// Client-side exporters for AI analysis output. PDF uses DOM capture
// (html2canvas-pro → jsPDF image pages) instead of jsPDF text APIs because
// jsPDF has no built-in Korean glyphs — rasterizing the rendered DOM
// keeps Hangul, tables, and the dark theme intact. html2canvas-pro (not
// html2canvas) is required: Tailwind v4 emits oklab()/oklch() colors that
// the original library cannot parse. Both libraries are dynamically
// imported so they never enter the initial bundle.

function timestampSlug(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function exportMarkdown(content: string, titleHint?: string) {
  const header = [
    `# Kiro AI 분석 리포트`,
    ``,
    `- 생성일: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    titleHint ? `- 질문: ${titleHint}` : null,
    ``,
    `---`,
    ``,
  ]
    .filter((l): l is string => l !== null)
    .join('\n');

  const blob = new Blob([header + content], {
    type: 'text/markdown;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, `kiro-ai-analysis-${timestampSlug()}.md`);
  URL.revokeObjectURL(url);
}

export async function exportPdf(element: HTMLElement): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  const canvas = await html2canvas(element, {
    backgroundColor: '#0b0b12',
    scale: 2,
    useCORS: true,
    logging: false,
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * pageWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  // Paginate a tall capture by re-drawing the full image shifted up on
  // each page; the page viewport crops it to the visible slice.
  let offsetY = 0;
  let page = 0;
  while (offsetY < imgHeight) {
    if (page > 0) pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, -offsetY, imgWidth, imgHeight);
    offsetY += pageHeight;
    page++;
  }

  pdf.save(`kiro-ai-analysis-${timestampSlug()}.pdf`);
}
