"use client";

import { useState } from "react";
import mammoth from "mammoth";

type Exam = { id: string; name: string };

type ImportedRow = { text: string; options: string[]; correctIndex: number };

export default function BulkQuestionImport({ courseId, exams, onImported }: { courseId: string; exams: Exam[]; onImported: () => void }) {
  const [examId, setExamId] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function importFile(file: File) {
    setError(null);
    setFileName(file.name);
    if (!examId) { setError("Choose a test first"); return; }
    const rows = file.name.toLowerCase().endsWith(".docx")
      ? await parseDocx(await file.arrayBuffer())
      : parseCsv(await file.text());
    if (!rows.length) { setError("The CSV file has no question rows"); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/admin/questions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId, examId, rows }),
      });
      const data = await response.json();
      if (!response.ok) { setError(data.error ?? "Import failed"); return; }
      setFileName(`${data.imported} questions imported`);
      onImported();
    } catch { setError("Import failed. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return (
    <section style={panel}>
      <h2 style={{ fontSize: "1.1rem", margin: "0 0 0.45rem" }}>Import questions</h2>
      <p style={help}>Choose the test, then upload CSV or Word (.docx). Word questions must be numbered with A-D options; mark one option bold/underlined or add an answer key at the end.</p>
      <div style={row}>
        <select value={examId} onChange={(event) => setExamId(event.target.value)} style={input} disabled={busy || !courseId}>
          <option value="">Select a test</option>
          {exams.map((exam) => <option key={exam.id} value={exam.id}>{exam.name}</option>)}
        </select>
        <label style={{ ...upload, opacity: busy || !examId ? 0.5 : 1 }}>
          {busy ? "Importing..." : "Choose CSV or Word file"}
          <input type="file" accept=".csv,.docx,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document" disabled={busy || !examId} onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); }} style={{ display: "none" }} />
        </label>
      </div>
      {fileName && <p style={help}>{fileName}</p>}
      {error && <p style={{ color: "var(--danger)", fontSize: "0.9rem" }}>{error}</p>}
    </section>
  );
}

function parseCsv(source: string): ImportedRow[] {
  const cells: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) cells.push(row);
      row = [];
    } else cell += character;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) cells.push(row);
  const start = cells[0]?.[0]?.toLowerCase() === "question" ? 1 : 0;
  return cells.slice(start).map((values) => ({ text: values[0] ?? "", options: values.slice(1, 5), correctIndex: Number(values[5]) - 1 }));
}

async function parseDocx(source: ArrayBuffer): Promise<ImportedRow[]> {
  const result = await mammoth.convertToHtml({ arrayBuffer: source });
  const document = new DOMParser().parseFromString(result.value, "text/html");
  const blocks = Array.from(document.body.querySelectorAll("p, li"));
  const answerKey = new Map<number, number>();
  let inAnswerKey = false;
  const questions: Array<{ number: number; text: string; options: string[]; markedAnswer: number | null }> = [];
  let current: (typeof questions)[number] | null = null;

  for (const block of blocks) {
    const text = block.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!text) continue;
    if (/^(answer\s*key|answers?)\s*:?/i.test(text)) { inAnswerKey = true; current = null; continue; }
    const inlineAnswerMatch = text.match(/^(?:correct\s+)?answer\s*:\s*([A-D1-4])\b/i);
    if (current && inlineAnswerMatch) {
      const answer = inlineAnswerMatch[1].toUpperCase();
      current.markedAnswer = /^[A-D]$/.test(answer) ? answer.charCodeAt(0) - 65 : Number(answer) - 1;
      continue;
    }
    const keyMatch = text.match(/^(\d+)\s*(?:[.):\-]|\s)\s*([A-D])\s*$/i);
    if (keyMatch && (inAnswerKey || !current || text.length <= 8)) {
      answerKey.set(Number(keyMatch[1]), keyMatch[2].toUpperCase().charCodeAt(0) - 65);
      continue;
    }
    const questionMatch = text.match(/^(?:question\s*)?(\d+)\s*[.):\-]\s*(.+)$/i);
    if (questionMatch) {
      current = { number: Number(questionMatch[1]), text: questionMatch[2], options: [], markedAnswer: null };
      questions.push(current);
      continue;
    }
    const optionMatch = text.match(/^\(?([A-D])\)?\s*[.):\-]\s*(.+)$/i);
    if (current && optionMatch) {
      const optionIndex = optionMatch[1].toUpperCase().charCodeAt(0) - 65;
      const optionText = optionMatch[2].replace(/^(?:correct\s+)?answer\s*:\s*/i, "").trim();
      current.options.push(optionText);
      if (block.querySelector("strong, b, u")) current.markedAnswer = optionIndex;
    }
  }

  return questions.map((question) => ({
    text: question.text,
    options: question.options,
    correctIndex: question.markedAnswer ?? answerKey.get(question.number) ?? -1,
  }));
}

const panel = { background: "#fff", border: "1px solid var(--line)", borderRadius: 6, padding: "1.25rem", marginBottom: "2rem" } as const;
const help = { color: "var(--ink-600)", fontSize: "0.85rem", margin: "0.35rem 0 1rem" } as const;
const row = { display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" } as const;
const input = { border: "1px solid var(--line)", borderRadius: 4, padding: "0.65rem 0.75rem", minWidth: 190 } as const;
const upload = { background: "var(--burgundy-900)", color: "#fff", borderRadius: 4, padding: "0.65rem 0.9rem", cursor: "pointer", fontSize: "0.9rem", fontWeight: 600 } as const;
