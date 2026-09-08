const pdfParseMod = require('pdf-parse');
const mammoth = require('mammoth');

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
    return buffer.toString('utf8');
  }
  if (ext === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer });
      if (result.value && result.value.trim()) return result.value;
    } catch (e) {}
    return buffer.toString('utf8');
  }
  throw new Error(`Unsupported file type: .${ext} — please upload PDF or DOCX`);
}

module.exports = { extractText };
