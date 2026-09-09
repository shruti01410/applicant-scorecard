const pdfParseMod = require('pdf-parse');
const mammoth = require('mammoth');

let WordExtractor = null;
try { WordExtractor = require('word-extractor'); } catch (e) {}

async function parsePdf(buffer) {
  if (pdfParseMod.PDFParse) {
    const parser = new pdfParseMod.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text || '';
    } finally {
      try { if (parser.destroy) await parser.destroy(); } catch (e) {}
    }
  }
  if (typeof pdfParseMod === 'function') {
    const data = await pdfParseMod(buffer);
    return data.text || '';
  }
  if (pdfParseMod.default && typeof pdfParseMod.default === 'function') {
    const data = await pdfParseMod.default(buffer);
    return data.text || '';
  }
  throw new Error('Unsupported pdf-parse version');
}

async function extractText(buffer, originalname) {
  const ext = originalname.toLowerCase().split('.').pop();
  if (ext === 'pdf') {
    try {
      const text = await parsePdf(buffer);
      if (text && text.trim()) return text;
    } catch (e) {}
    return '';
  }
  if (ext === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer });
      if (result.value && result.value.trim()) return result.value;
    } catch (e) {}
    return '';
  }
  if (ext === 'doc') {
    if (!WordExtractor) throw new Error('DOC format requires word-extractor — please convert to PDF or DOCX');
    try {
      const doc = new WordExtractor();
      const extracted = await doc.extract(buffer);
      if (extracted && extracted.text && extracted.text.trim()) return extracted.text;
    } catch (e) {}
    return '';
  }
  throw new Error(`Unsupported file type: .${ext} — please upload PDF, DOC, or DOCX`);
}

module.exports = { extractText };
