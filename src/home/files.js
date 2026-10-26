// Reading attachments in the browser: documents -> text (PDF via pdf.js, Word via mammoth, plain text directly)
import { LIBS, loadScript } from "../lib/api.js";
import { extOf } from "./constants.jsx";

export async function readDoc(file, maxChars) {
    const ext = extOf(file.name);
    if (ext === "pdf") {
        await loadScript(LIBS.pdf);
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIBS.pdfWorker;
        const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
        let text = "";
        for (let p = 1; p <= Math.min(pdf.numPages, 40) && text.length < maxChars * 1.5; p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            text += content.items.map((i) => i.str).join(" ") + "\n";
        }
        return { text, info: `${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}` };
    }
    if (ext === "docx") {
        await loadScript(LIBS.docx);
        const out = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
        return { text: out.value, info: "" };
    }
    return { text: await file.text(), info: "" };
}
