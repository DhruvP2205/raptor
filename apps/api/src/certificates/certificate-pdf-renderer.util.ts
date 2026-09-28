import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';

const DEFAULT_WIDTH = 792; // 11in landscape, points
const DEFAULT_HEIGHT = 612; // 8.5in landscape, points

// Reads the rendered certificate SVG's own declared size so the PDF
// page matches the template's native dimensions; falls back to a
// landscape default for a template that never set one.
function extractDimensions(svg: string): { width: number; height: number } {
  const widthMatch = svg.match(/<svg[^>]*\bwidth="(\d+(?:\.\d+)?)"/);
  const heightMatch = svg.match(/<svg[^>]*\bheight="(\d+(?:\.\d+)?)"/);
  return {
    width: widthMatch ? Number(widthMatch[1]) : DEFAULT_WIDTH,
    height: heightMatch ? Number(heightMatch[1]) : DEFAULT_HEIGHT,
  };
}

// Pure-JS SVG->PDF conversion, no headless browser (ARCHITECTURE.md §2)
// — the already-rendered, already-placeholder-substituted SVG is the
// single source of both the on-platform view and the PDF download
// (Section 5, docs/stages/12-certificates.md); this never re-derives
// content independently of that SVG.
export function renderSvgToPdfBuffer(svg: string): Promise<Buffer> {
  const { width, height } = extractDimensions(svg);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [width, height], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      SVGtoPDF(doc, svg, 0, 0, { width, height, preserveAspectRatio: 'xMidYMid meet' });
    } catch (err) {
      reject(err);
      return;
    }
    doc.end();
  });
}
