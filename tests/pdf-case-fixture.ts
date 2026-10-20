import { readCasePdf } from '../src/lib/pdfCase';
import { getDocument } from 'pdfjs-dist';
import '../src/styles.css';

Object.assign(window, { readCasePdf, inspectPdf: async (data: number[]) => {
  const task = getDocument({ data: new Uint8Array(data) });
  const pdf = await task.promise;
  try {
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push({ page: i, viewport: page.getViewport({ scale: 1 }), items: content.items });
      page.cleanup();
    }
    return pages;
  } finally { await task.destroy(); }
} });
