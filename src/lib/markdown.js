// =====================================================
// vibeMate 3.2 · markdown.js
// Turns an AI answer (Markdown) into blocks the chat can show:
//   { type: "html", html }            text: headings, paragraphs, lists, quotes, tables, rules
//   { type: "code", lang, code, open } a fenced code block (shown with Copy / Preview buttons)
// Everything is escaped first, so the answer can never inject HTML into the page.
// =====================================================
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);

// **bold**, *italic*, `code`, [text](https://…), bare https:// links
function inline(text) {
    const codes = [];
    let s = escapeHtml(text).replace(/`([^`]+)`/g, (m, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
    s = s
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?'"])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/__([^_]+)__/g, "<strong>$1</strong>")
        .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>")
        .replace(/~~([^~]+)~~/g, "<del>$1</del>");
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => `<code>${codes[Number(i)]}</code>`);
}

const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
const isTableRule = (line) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

// Lists, including one level of nesting (indented 2+ spaces)
function renderList(lines) {
    let html = "";
    const stack = [];                       // [{ tag, indent }]
    for (const line of lines) {
        const m = line.match(/^(\s*)([-*+•]|\d+[.)])\s+(.*)$/);
        if (!m) { if (stack.length) html = html.replace(/<\/li>$/, "") + "<br>" + inline(line.trim()) + "</li>"; continue; }
        const indent = m[1].replace(/\t/g, "  ").length;
        const tag = /\d/.test(m[2]) ? "ol" : "ul";
        while (stack.length && indent < stack[stack.length - 1].indent) { html += `</${stack.pop().tag}>`; }
        const top = stack[stack.length - 1];
        if (!top || indent > top.indent) {
            if (top) html = html.replace(/<\/li>$/, "");
            const start = tag === "ol" && parseInt(m[2], 10) > 1 ? ` start="${parseInt(m[2], 10)}"` : "";
            html += `<${tag}${start}>`;
            stack.push({ tag, indent });
        }
        html += `<li>${inline(m[3])}</li>`;
    }
    while (stack.length) {
        const { tag } = stack.pop();
        html += `</${tag}>` + (stack.length ? "</li>" : "");
    }
    return html;
}

export function parseMarkdown(text) {
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    const blocks = [];
    let html = "";
    const flush = () => { if (html) { blocks.push({ type: "html", html }); html = ""; } };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // ```lang … ``` (an unfinished block at the end still shows as code)
        const fence = line.match(/^\s*(```+|~~~+)\s*([\w#+.-]*)/);
        if (fence) {
            flush();
            const close = fence[1];
            const code = [];
            let j = i + 1;
            while (j < lines.length && !lines[j].trim().startsWith(close)) { code.push(lines[j]); j++; }
            blocks.push({ type: "code", lang: (fence[2] || "").toLowerCase(), code: code.join("\n"), open: j >= lines.length });
            i = j;
            continue;
        }
        if (!line.trim()) continue;

        const heading = line.match(/^\s*(#{1,6})\s+(.*?)\s*#*\s*$/);
        if (heading) { const level = Math.min(4, heading[1].length + 1); html += `<h${level}>${inline(heading[2])}</h${level}>`; continue; }

        if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { html += "<hr>"; continue; }

        if (/^\s*>/.test(line)) {
            const quote = [];
            while (i < lines.length && /^\s*>/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
            i--;
            html += `<blockquote>${quote.map(inline).join("<br>")}</blockquote>`;
            continue;
        }

        if (isTableRow(line) && i + 1 < lines.length && isTableRule(lines[i + 1])) {
            const head = cells(line);
            const rows = [];
            i += 2;
            while (i < lines.length && isTableRow(lines[i])) { rows.push(cells(lines[i])); i++; }
            i--;
            html += `<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>` +
                rows.map((r) => `<tr>${head.map((_, k) => `<td>${inline(r[k] ?? "")}</td>`).join("")}</tr>`).join("") + "</tbody></table></div>";
            continue;
        }

        if (/^\s*([-*+•]|\d+[.)])\s+/.test(line)) {
            const list = [];
            while (i < lines.length && lines[i].trim() && !/^\s*(```|~~~)/.test(lines[i]) &&
                (/^\s*([-*+•]|\d+[.)])\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) { list.push(lines[i]); i++; }
            i--;
            html += renderList(list);
            continue;
        }

        // Paragraph: lines until a blank line or another block starts
        const para = [line.trim()];
        while (i + 1 < lines.length && lines[i + 1].trim() &&
            !/^\s*(#{1,6}\s|```|~~~|>|([-*+•]|\d+[.)])\s+)/.test(lines[i + 1]) && !(isTableRow(lines[i + 1]) && isTableRule(lines[i + 2] || ""))) {
            para.push(lines[++i].trim());
        }
        html += `<p>${para.map(inline).join("<br>")}</p>`;
    }
    flush();
    return blocks;
}

// A code block that is a whole web page (or HTML with CSS) can be previewed
export const isPreviewable = (block) =>
    block.type === "code" && (/^(html|htm|xhtml|svg)$/.test(block.lang) || /^\s*(<!doctype html|<html[\s>])/i.test(block.code));

// Plain text of an answer (for copying)
export const plainText = (text) => String(text || "").trim();
