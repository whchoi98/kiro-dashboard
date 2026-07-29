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

// The exported file's own header follows the UI language, like the answer it
// wraps. Kept as a local table rather than i18n keys so this module stays
// importable without the React context.
const MD_LABELS = {
  ko: { title: 'Kiro AI 분석 리포트', generated: '생성일', question: '질문' },
  en: { title: 'Kiro AI Analysis Report', generated: 'Generated', question: 'Question' },
} as const;

export function exportMarkdown(
  content: string,
  titleHint?: string,
  locale: 'ko' | 'en' = 'ko'
) {
  const L = MD_LABELS[locale] ?? MD_LABELS.ko;
  const header = [
    `# ${L.title}`,
    ``,
    `- ${L.generated}: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    titleHint ? `- ${L.question}: ${titleHint}` : null,
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

const PDF_BG = '#0b0b12';

export async function exportPdf(element: HTMLElement): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ]);

  // Wide Athena tables live in overflow-x-auto wrappers; a plain capture
  // paints only the visible clip window and silently drops the scrolled-out
  // columns. Measure the widest overflow and widen the cloned card so the
  // capture contains the full tables.
  const overflowExtra = Math.max(
    0,
    ...Array.from(element.querySelectorAll<HTMLElement>('*')).map((d) =>
      d.scrollWidth > d.clientWidth + 1 ? d.scrollWidth - d.clientWidth : 0
    )
  );
  const captureWidth = Math.ceil(element.getBoundingClientRect().width + overflowExtra);

  const canvas = await html2canvas(element, {
    backgroundColor: PDF_BG,
    scale: 2,
    useCORS: true,
    logging: false,
    width: captureWidth,
    windowWidth: Math.max(document.documentElement.clientWidth, captureWidth + 100),
    onclone: (doc: Document, cloned: HTMLElement) => {
      // The exported report is always dark (PDF_BG). Force the clone to the
      // dark palette so a user on the light theme doesn't capture light-mode
      // computed colors that composite into a murky gray over PDF_BG.
      doc.documentElement.classList.remove('light');
      cloned.style.width = `${captureWidth}px`;
      cloned.style.maxWidth = 'none';
      cloned.querySelectorAll<HTMLElement>('.overflow-x-auto').forEach((d) => {
        d.style.overflow = 'visible';
        d.style.width = 'max-content';
        d.style.maxWidth = 'none';
      });
    },
  });

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * pageWidth) / canvas.width;
  const imgData = canvas.toDataURL('image/png');

  // Paginate a tall capture by re-drawing the full image shifted up on
  // each page; the page viewport crops it to the visible slice. Pre-fill
  // each page with the capture background so the final partial page does
  // not end in a white block under dark content.
  let offsetY = 0;
  let page = 0;
  while (offsetY < imgHeight) {
    if (page > 0) pdf.addPage();
    pdf.setFillColor(PDF_BG);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');
    pdf.addImage(imgData, 'PNG', 0, -offsetY, imgWidth, imgHeight);
    offsetY += pageHeight;
    page++;
  }

  pdf.save(`kiro-ai-analysis-${timestampSlug()}.pdf`);
}
