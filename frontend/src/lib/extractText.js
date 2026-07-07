// Turn an uploaded File into plain text for indexing.
// Text formats are read directly; PDFs are parsed in-browser with pdf.js so the
// server never needs a PDF dependency.
const TEXT_EXT = ["txt", "md", "markdown", "csv", "tsv", "json", "html", "htm", "log", "xml", "yaml", "yml"];

export async function extractText(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const type = file.type || "";

  if (ext === "pdf" || type === "application/pdf") {
    return extractPdf(file);
  }
  if (TEXT_EXT.includes(ext) || type.startsWith("text/") || type === "application/json") {
    return (await file.text()).trim();
  }
  // Unknown type: attempt a plain-text read; caller shows an error if it's binary junk.
  return (await file.text()).trim();
}

async function extractPdf(file) {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let out = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map((it) => it.str).join(" ");
    out += pageText + "\n\n";
  }
  const text = out.trim();
  if (!text) throw new Error("This PDF has no extractable text (it may be a scanned image).");
  return text;
}

export function isSupported(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return ext === "pdf" || TEXT_EXT.includes(ext) || (file.type || "").startsWith("text/");
}
