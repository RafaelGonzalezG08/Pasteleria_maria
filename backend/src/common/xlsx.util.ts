import * as ExcelJS from 'exceljs';

/** Cabecera HTTP para servir un .xlsx como descarga. */
export const XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Genera un archivo .xlsx real (no un CSV renombrado) a partir de filas
 * planas: cada objeto es una fila y sus llaves son los encabezados. Excel lo
 * abre sin avisos de "el formato no coincide con la extension".
 */
export async function generarXlsx(hoja: string, filas: Record<string, unknown>[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(hoja);

  const encabezados = filas.length > 0 ? Object.keys(filas[0]) : [];
  ws.columns = encabezados.map((h) => ({ header: h, key: h }));
  for (const fila of filas) ws.addRow(fila);

  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((col) => {
    let ancho = String(col.header ?? '').length;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const largo = String(cell.value ?? '').length;
      if (largo > ancho) ancho = largo;
    });
    col.width = Math.min(60, Math.max(10, ancho + 2));
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
