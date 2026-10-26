import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { formatCnpj, formatPhone } from "@/lib/domain/documents";
import { formatDateTime } from "@/lib/format";
import type { CompanySettings } from "@/lib/validation/admin";

export const RED = "#FB010C";
export const INK = "#0C0B0E";
export const GREY = "#52525B";
export const LIGHT = "#F4F4F5";

type Col = { w: number; t: string; a: "left" | "right" | "center" };

/**
 * Documento PDF com a identidade Tebras: faixa preta com logo, linha vermelha, dados da empresa (somente os
 * configurados — nada é inventado), marca d'água opcional e rodapé paginado.
 */
export function createBrandedDoc(opts: { title: string; subject?: string; company: CompanySettings; watermark?: string | null; footerLabel: string; generatedBy: string; landscape?: boolean }) {
  const { company } = opts;
  const doc = new PDFDocument({ size: "A4", layout: opts.landscape ? "landscape" : "portrait", margins: { top: 110, bottom: 70, left: 50, right: 50 }, bufferPages: true, info: { Title: opts.title, Author: company.legalName ?? "Tebras", Subject: opts.subject ?? opts.title } });
  const chunks: Buffer[] = [];
  doc.on("data", (c) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const logo = readFileSync(/*turbopackIgnore: true*/ path.join(process.cwd(), "public/brand/tebras-logo-pdf.png"));
  const W = doc.page.width;
  const contentW = W - 100;

  const header = () => {
    const { x, y } = doc;
    doc.save();
    doc.rect(0, 0, W, 80).fill(INK);
    doc.image(logo, 40, 14, { height: 52 });
    doc.rect(0, 80, W, 3).fill(RED);
    doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(9).text(company.legalName ?? company.tradeName ?? "[Razão social não configurada]", 300, 20, { width: W - 340, align: "right" });
    doc.font("Helvetica").fontSize(8).fillColor("#D4D4D8");
    const lines = [
      company.cnpj ? `CNPJ ${formatCnpj(company.cnpj)}` : "[CNPJ não configurado]",
      [[company.street, company.number, company.district].filter(Boolean).join(", "), company.city ? `${company.city}/${company.state ?? ""}` : ""].filter(Boolean).join(" — "),
      [company.phone ? formatPhone(company.phone) : null, company.email, company.website].filter(Boolean).join(" · "),
    ].filter((l) => l.trim());
    doc.text(lines.join("\n"), 300, 33, { width: W - 340, align: "right" });
    doc.restore();
    doc.x = x; doc.y = y;
  };
  const watermark = () => {
    if (!opts.watermark) return;
    const { x, y } = doc;
    doc.save();
    doc.rotate(-35, { origin: [W / 2, doc.page.height / 2] });
    doc.font("Helvetica-Bold").fontSize(48).fillColor(RED).opacity(0.12).text(opts.watermark, 0, doc.page.height / 2 - 30, { width: W, align: "center" });
    doc.restore();
    doc.opacity(1);
    doc.x = x; doc.y = y;
  };
  header(); watermark();
  doc.on("pageAdded", () => { header(); watermark(); doc.fillColor(INK); doc.x = 50; doc.y = doc.page.margins.top; });

  const section = (title: string) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(0.8);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(title.toUpperCase(), 50, doc.y, { characterSpacing: 0.5 });
    const y = doc.y + 2;
    doc.moveTo(50, y).lineTo(90, y).lineWidth(2).strokeColor(RED).stroke();
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10).fillColor(INK);
  };
  const paragraph = (t: string | null | undefined, fallback = "Não se aplica.") =>
    doc.font("Helvetica").fontSize(10).fillColor(t ? INK : GREY).text(t?.trim() || fallback, 50, doc.y, { width: contentW, align: "justify", lineGap: 2 });

  const row = (cols: Col[], cells: string[], o: { bold?: boolean; fill?: string; size?: number } = {}) => {
    const size = o.size ?? 9;
    const heights = cells.map((c, i) => doc.font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).heightOfString(c, { width: cols[i].w * contentW - 8 }));
    const h = Math.max(...heights) + 8;
    if (doc.y + h > doc.page.height - 80) doc.addPage();
    const y = doc.y;
    if (o.fill) doc.rect(50, y, contentW, h).fill(o.fill);
    let x = 50;
    cells.forEach((c, i) => {
      doc.fillColor(INK).font(o.bold ? "Helvetica-Bold" : "Helvetica").fontSize(size).text(c, x + 4, y + 4, { width: cols[i].w * contentW - 8, align: cols[i].a });
      x += cols[i].w * contentW;
    });
    doc.x = 50; doc.y = y + h;
    doc.moveTo(50, doc.y).lineTo(50 + contentW, doc.y).lineWidth(0.5).strokeColor("#E4E4E7").stroke();
  };
  const table = (cols: Col[], rows: string[][], o: { totalRow?: string[] } = {}) => {
    row(cols, cols.map((c) => c.t), { bold: true, fill: LIGHT });
    rows.forEach((r) => row(cols, r));
    if (o.totalRow) row(cols, o.totalRow, { bold: true, fill: LIGHT });
  };

  const finish = () => {
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0; // rodapé abaixo da margem: evita páginas em branco
      const y = doc.page.height - 45;
      doc.moveTo(50, y - 6).lineTo(W - 50, y - 6).lineWidth(0.5).strokeColor("#D4D4D8").stroke();
      doc.font("Helvetica").fontSize(7.5).fillColor(GREY)
        .text(`${opts.footerLabel} · Gerado em ${formatDateTime(new Date())} por ${opts.generatedBy}${opts.watermark ? ` · ${opts.watermark}` : ""}`, 50, y, { width: contentW - 80, lineBreak: false })
        .text(`Página ${i - range.start + 1} de ${range.count}`, W - 130, y, { width: 80, align: "right", lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
    return done;
  };
  return { doc, W, contentW, section, paragraph, table, row, finish };
}
