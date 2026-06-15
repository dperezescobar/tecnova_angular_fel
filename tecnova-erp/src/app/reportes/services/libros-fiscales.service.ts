import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable, { RowInput } from 'jspdf-autotable';

import { environment } from '../../../environments/environment';

// ─── Request DTOs ────────────────────────────────────────────────────────────

export interface ReporteLibroVentasRequest {
  FechaDesde: string;   // ISO date string yyyy-MM-dd
  FechaHasta: string;   // ISO date string yyyy-MM-dd
  Sucursal: string;
  NombreSucursal: string;
  PuntoVenta: string;
  IdEmpresa: number;
  MostrarCuadro: string;
}

export interface LibroVentasConsumidorFinalRequest {
  Sucursal: string;
  PuntoVenta: string;
  FechaDesde: string;   // ISO date string yyyy-MM-dd
  FechaHasta: string;   // ISO date string yyyy-MM-dd
  Mes: string;
  NrcEmpresa: string;
  NitEmpresa: string;
  NombreSucursal: string;
  IdEmpresa: number;
}

// ─── Response DTOs ───────────────────────────────────────────────────────────

export interface ReporteLibroVentasResponse {
  CORRELATIVO: number;
  NUMERO_FORM_UNICO: string | null;
  PREFIJO: string | null;
  CLIENTE: string | null;
  NOMBRE: string | null;
  ALIAS: string | null;
  NIT: string | null;
  FACTURAR_A: string | null;
  ACTIVIDAD_ECONOMICA: string | null;
  REGISTRO_COMERCIO: string | null;
  DOCUMENTO: string | null;
  FECHA: string | null;
  SUCURSAL: string | null;
  DESCRIPCION: string | null;
  TIPODOC: string | null;
  SUMAS: number;
  GRAVADAS: number;
  EXENTAS: number;
  NO_SUJETAS: number;
  TERCERO_GRAVADA: number;
  TERCERO_EXENTA: number;
  TERCERO_NOSUJETA: number;
  TOTAL_IMPUESTO1: number;
  TOTAL_IMPUESTO2: number;
  TOTAL_IMPUESTO3: number;
  RETENCION: number;
  PERCEPCION: number;
  TOTAL: number;
  NOMBRE_EMPRESA: string | null;
  TITULO_REPORTE: string | null;
  SIMBOLO_MONEDA: string | null;
  MES: string | null;
  NRC_EMPRESA: string | null;
  NIT_EMPRESA: string | null;
  ENCABEZADO: number;
  NPAGINA: number;
  ANIO: number;
  DESC_SUCURSAL: string | null;
  IVAGCF: number;
  IVAECF: number;
  IVAPCF: number;
  IVANCF: number;
  VGCF: number;
  VECF: number;
  VPCF: number;
  VNCF: number;
  RETECF: number;
  OCULTAR: string | null;
  MOSTRAR_CUADRO: string | null;
  Numero_Control: string | null;
  Sello_Recepcion: string | null;
  CodigoGeneracion: string | null;
  FIRMACONTA: string | null;
}

export interface LibroVentasConsumidorFinalResponse {
  DOCUMENTO_MAX: string | null;
  DOCUMENTO_MIN: string | null;
  PREFIJO: string | null;
  SUCURSAL: string | null;
  PUNTO_VENTA: string | null;
  CORRELATIVO: number;
  CLIENTE: string | null;
  NOMBRE: string | null;
  ALIAS: string | null;
  NIT: string | null;
  ACTIVIDAD_ECONOMICA: string | null;
  REGISTRO_COMERCIO: string | null;
  FECHA: number;
  TIPODOC: string | null;
  SUMAS: number;
  GRAVADAS: number;
  EXENTAS: number;
  EXPORTACIONES: number;
  NO_SUJETAS: number;
  TOTAL_IMPUESTO1: number;
  TOTAL_IMPUESTO2: number;
  TOTAL_IMPUESTO3: number;
  RETENCION: number;
  TOTAL: number;
  NOMBRE_EMPRESA: string | null;
  TITULO_REPORTE: string | null;
  SIMBOLO_MONEDA: string | null;
  Mes: string | null;
  NRC_EMPRESA: string | null;
  NIT_EMPRESA: string | null;
  ENCABEZADO: number;
  NPAGINA: number;
  ANIO: number;
  DESC_SUCURSAL: string | null;
  TOTAL_SERVICIOS: number;
  TOTAL_PRODUCTOS: number;
  CodigoGeneracion_Min: string | null;
  CodigoGeneracion_Max: string | null;
  FIRMACONTA: string | null;
}

// ─── Company info for PDF header ─────────────────────────────────────────────

export interface CompanyInfo {
  nombre: string;
  nit?: string;
  nrc?: string;
  periodo?: string;
  sucursal?: string;
  contador?: string;
}

export interface ResumenFiscal {
  gravadas: number;
  exentas: number;
  noSujetas: number;
  debitoFiscal: number;
  retencion: number;
  percepcion: number;
  total: number;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class LibrosFiscalesService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/Factura`;

  // ── HTTP Methods ────────────────────────────────────────────────────────────

  getReporteLibroVentasContribuyente(
    request: ReporteLibroVentasRequest
  ): Observable<ReporteLibroVentasResponse[]> {
    return this.http
      .post<Record<string, unknown>[]>(`${this.baseUrl}/ReporteLibroVentasContribuyente`, request)
      .pipe(map((rows) => (rows ?? []).map((r) => this.mapLibroVentas(r))));
  }

  getLibroVentasConsumidorFinal(
    request: LibroVentasConsumidorFinalRequest
  ): Observable<LibroVentasConsumidorFinalResponse[]> {
    return this.http
      .post<Record<string, unknown>[]>(`${this.baseUrl}/LibroVentasConsumidorFinal`, request)
      .pipe(map((rows) => (rows ?? []).map((r) => this.mapConsumidorFinal(r))));
  }

  // ── Response mappers (case-insensitive field lookup) ────────────────────────

  private pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
    for (const key of keys) {
      if (raw[key] !== undefined && raw[key] !== null) return raw[key];
      const found = Object.keys(raw).find((k) => k.toLowerCase() === key.toLowerCase());
      if (found !== undefined && raw[found] !== undefined && raw[found] !== null) return raw[found];
    }
    return undefined;
  }

  private toStr(raw: Record<string, unknown>, ...keys: string[]): string | null {
    const v = this.pick(raw, ...keys);
    return v == null ? null : String(v).trim() || null;
  }

  private toNum(raw: Record<string, unknown>, ...keys: string[]): number {
    const v = Number(this.pick(raw, ...keys));
    return Number.isFinite(v) ? v : 0;
  }

  private mapLibroVentas(r: Record<string, unknown>): ReporteLibroVentasResponse {
    return {
      CORRELATIVO:        this.toNum(r, 'CORRELATIVO', 'correlativo'),
      NUMERO_FORM_UNICO:  this.toStr(r, 'NUMERO_FORM_UNICO', 'numerO_FORM_UNICO'),
      PREFIJO:            this.toStr(r, 'PREFIJO', 'prefijo'),
      CLIENTE:            this.toStr(r, 'CLIENTE', 'cliente'),
      NOMBRE:             this.toStr(r, 'NOMBRE', 'nombre'),
      ALIAS:              this.toStr(r, 'ALIAS', 'alias'),
      NIT:                this.toStr(r, 'NIT', 'nit'),
      FACTURAR_A:         this.toStr(r, 'FACTURAR_A', 'facturaR_A', 'facturar_A'),
      ACTIVIDAD_ECONOMICA:this.toStr(r, 'ACTIVIDAD_ECONOMICA', 'actividaD_ECONOMICA'),
      REGISTRO_COMERCIO:  this.toStr(r, 'REGISTRO_COMERCIO', 'registrO_COMERCIO'),
      DOCUMENTO:          this.toStr(r, 'DOCUMENTO', 'documento'),
      FECHA:              this.toStr(r, 'FECHA', 'fecha'),
      SUCURSAL:           this.toStr(r, 'SUCURSAL', 'sucursal'),
      DESCRIPCION:        this.toStr(r, 'DESCRIPCION', 'descripcion'),
      TIPODOC:            this.toStr(r, 'TIPODOC', 'tipodoc'),
      SUMAS:              this.toNum(r, 'SUMAS', 'sumas'),
      GRAVADAS:           this.toNum(r, 'GRAVADAS', 'gravadas'),
      EXENTAS:            this.toNum(r, 'EXENTAS', 'exentas'),
      NO_SUJETAS:         this.toNum(r, 'NO_SUJETAS', 'nO_SUJETAS'),
      TERCERO_GRAVADA:    this.toNum(r, 'TERCERO_GRAVADA', 'tercerO_GRAVADA'),
      TERCERO_EXENTA:     this.toNum(r, 'TERCERO_EXENTA', 'tercerO_EXENTA'),
      TERCERO_NOSUJETA:   this.toNum(r, 'TERCERO_NOSUJETA', 'tercerO_NOSUJETA'),
      TOTAL_IMPUESTO1:    this.toNum(r, 'TOTAL_IMPUESTO1', 'totaL_IMPUESTO1'),
      TOTAL_IMPUESTO2:    this.toNum(r, 'TOTAL_IMPUESTO2', 'totaL_IMPUESTO2'),
      TOTAL_IMPUESTO3:    this.toNum(r, 'TOTAL_IMPUESTO3', 'totaL_IMPUESTO3'),
      RETENCION:          this.toNum(r, 'RETENCION', 'retencion'),
      PERCEPCION:         this.toNum(r, 'PERCEPCION', 'percepcion'),
      TOTAL:              this.toNum(r, 'TOTAL', 'total'),
      NOMBRE_EMPRESA:     this.toStr(r, 'NOMBRE_EMPRESA', 'nombrE_EMPRESA'),
      TITULO_REPORTE:     this.toStr(r, 'TITULO_REPORTE', 'titulO_REPORTE'),
      SIMBOLO_MONEDA:     this.toStr(r, 'SIMBOLO_MONEDA', 'simbolO_MONEDA'),
      MES:                this.toStr(r, 'MES', 'mes'),
      NRC_EMPRESA:        this.toStr(r, 'NRC_EMPRESA', 'nrC_EMPRESA'),
      NIT_EMPRESA:        this.toStr(r, 'NIT_EMPRESA', 'niT_EMPRESA'),
      ENCABEZADO:         this.toNum(r, 'ENCABEZADO', 'encabezado'),
      NPAGINA:            this.toNum(r, 'NPAGINA', 'npagina'),
      ANIO:               this.toNum(r, 'ANIO', 'anio'),
      DESC_SUCURSAL:      this.toStr(r, 'DESC_SUCURSAL', 'desC_SUCURSAL'),
      IVAGCF:             this.toNum(r, 'IVAGCF', 'ivagcf'),
      IVAECF:             this.toNum(r, 'IVAECF', 'ivaecf'),
      IVAPCF:             this.toNum(r, 'IVAPCF', 'ivapcf'),
      IVANCF:             this.toNum(r, 'IVANCF', 'ivancf'),
      VGCF:               this.toNum(r, 'VGCF', 'vgcf'),
      VECF:               this.toNum(r, 'VECF', 'vecf'),
      VPCF:               this.toNum(r, 'VPCF', 'vpcf'),
      VNCF:               this.toNum(r, 'VNCF', 'vncf'),
      RETECF:             this.toNum(r, 'RETECF', 'retecf'),
      OCULTAR:            this.toStr(r, 'OCULTAR', 'ocultar'),
      MOSTRAR_CUADRO:     this.toStr(r, 'MOSTRAR_CUADRO', 'mostraR_CUADRO'),
      Numero_Control:     this.toStr(r, 'Numero_Control', 'numero_Control'),
      Sello_Recepcion:    this.toStr(r, 'Sello_Recepcion', 'sello_Recepcion'),
      CodigoGeneracion:   this.toStr(r, 'CodigoGeneracion', 'codigoGeneracion'),
      FIRMACONTA:         this.toStr(r, 'FIRMACONTA', 'firmaconta'),
    };
  }

  private mapConsumidorFinal(r: Record<string, unknown>): LibroVentasConsumidorFinalResponse {
    return {
      DOCUMENTO_MAX:         this.toStr(r, 'DOCUMENTO_MAX', 'documentO_MAX'),
      DOCUMENTO_MIN:         this.toStr(r, 'DOCUMENTO_MIN', 'documentO_MIN'),
      PREFIJO:               this.toStr(r, 'PREFIJO', 'prefijo'),
      SUCURSAL:              this.toStr(r, 'SUCURSAL', 'sucursal'),
      PUNTO_VENTA:           this.toStr(r, 'PUNTO_VENTA', 'puntO_VENTA'),
      CORRELATIVO:           this.toNum(r, 'CORRELATIVO', 'correlativo'),
      CLIENTE:               this.toStr(r, 'CLIENTE', 'cliente'),
      NOMBRE:                this.toStr(r, 'NOMBRE', 'nombre'),
      ALIAS:                 this.toStr(r, 'ALIAS', 'alias'),
      NIT:                   this.toStr(r, 'NIT', 'nit'),
      ACTIVIDAD_ECONOMICA:   this.toStr(r, 'ACTIVIDAD_ECONOMICA', 'actividaD_ECONOMICA'),
      REGISTRO_COMERCIO:     this.toStr(r, 'REGISTRO_COMERCIO', 'registrO_COMERCIO'),
      FECHA:                 this.toNum(r, 'FECHA', 'fecha'),
      TIPODOC:               this.toStr(r, 'TIPODOC', 'tipodoc'),
      SUMAS:                 this.toNum(r, 'SUMAS', 'sumas'),
      GRAVADAS:              this.toNum(r, 'GRAVADAS', 'gravadas'),
      EXENTAS:               this.toNum(r, 'EXENTAS', 'exentas'),
      EXPORTACIONES:         this.toNum(r, 'EXPORTACIONES', 'exportaciones'),
      NO_SUJETAS:            this.toNum(r, 'NO_SUJETAS', 'nO_SUJETAS'),
      TOTAL_IMPUESTO1:       this.toNum(r, 'TOTAL_IMPUESTO1', 'totaL_IMPUESTO1'),
      TOTAL_IMPUESTO2:       this.toNum(r, 'TOTAL_IMPUESTO2', 'totaL_IMPUESTO2'),
      TOTAL_IMPUESTO3:       this.toNum(r, 'TOTAL_IMPUESTO3', 'totaL_IMPUESTO3'),
      RETENCION:             this.toNum(r, 'RETENCION', 'retencion'),
      TOTAL:                 this.toNum(r, 'TOTAL', 'total'),
      NOMBRE_EMPRESA:        this.toStr(r, 'NOMBRE_EMPRESA', 'nombrE_EMPRESA'),
      TITULO_REPORTE:        this.toStr(r, 'TITULO_REPORTE', 'titulO_REPORTE'),
      SIMBOLO_MONEDA:        this.toStr(r, 'SIMBOLO_MONEDA', 'simbolO_MONEDA'),
      Mes:                   this.toStr(r, 'Mes', 'mes'),
      NRC_EMPRESA:           this.toStr(r, 'NRC_EMPRESA', 'nrC_EMPRESA'),
      NIT_EMPRESA:           this.toStr(r, 'NIT_EMPRESA', 'niT_EMPRESA'),
      ENCABEZADO:            this.toNum(r, 'ENCABEZADO', 'encabezado'),
      NPAGINA:               this.toNum(r, 'NPAGINA', 'npagina'),
      ANIO:                  this.toNum(r, 'ANIO', 'anio'),
      DESC_SUCURSAL:         this.toStr(r, 'DESC_SUCURSAL', 'desC_SUCURSAL'),
      TOTAL_SERVICIOS:       this.toNum(r, 'TOTAL_SERVICIOS', 'totaL_SERVICIOS'),
      TOTAL_PRODUCTOS:       this.toNum(r, 'TOTAL_PRODUCTOS', 'totaL_PRODUCTOS'),
      CodigoGeneracion_Min:  this.toStr(r, 'CodigoGeneracion_Min', 'codigoGeneracion_Min'),
      CodigoGeneracion_Max:  this.toStr(r, 'CodigoGeneracion_Max', 'codigoGeneracion_Max'),
      FIRMACONTA:            this.toStr(r, 'FIRMACONTA', 'firmaconta'),
    };
  }

  // ── Excel Export (SheetJS) ──────────────────────────────────────────────────

  /**
   * Exports data to an Excel (.xlsx) file.
   * - Columns are ordered and labeled by the `headers` array.
   * - Numeric values are rounded to 2 decimal places.
   * - Column widths are auto-fitted to the longest cell content.
   *
   * @param data     Array of plain objects whose keys match `headers`.
   * @param headers  Ordered list of property keys to include as columns.
   * @param fileName File name without extension.
   */
  async exportToExcel(data: any[], headers: string[], fileName: string): Promise<void> {
    const { utils, writeFile } = await import('xlsx');
    
    // Generar la hoja de cálculo combinando encabezados y filas
    const worksheet = utils.json_to_sheet(data, { skipHeader: true });
    utils.sheet_add_aoa(worksheet, [headers], { origin: 'A1' });

    // Configurar formateo numérico de 2 decimales para evitar desbordamiento visual
    const range = utils.decode_range(worksheet['!ref'] || 'A1:A1');
    for (let R = range.s.r + 1; R <= range.e.r; ++R) {
      for (let C = range.s.c; C <= range.e.c; ++C) {
        const cellAddress = utils.encode_cell({ r: R, c: C });
        const cell = worksheet[cellAddress];
        if (cell && typeof cell.v === 'number') {
          cell.t = 'n';
          cell.z = '#,##0.00'; // Formato de moneda/decimal estándar
        }
      }
    }

    // Auto-fit automático de columnas basado en el contenido más largo
    const maxColsWidth = headers.map((header, colIndex) => {
      let maxLength = header.length;
      data.forEach(row => {
        const cellValue = Object.values(row)[colIndex];
        if (cellValue !== null && cellValue !== undefined) {
          const strLen = String(cellValue).length;
          if (strLen > maxLength) maxLength = strLen;
        }
      });
      return { wch: maxLength + 3 }; // Margen de seguridad acolchado
    });
    worksheet['!cols'] = maxColsWidth;

    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Reporte Fiscal');
    writeFile(workbook, `${fileName}.xlsx`);
  }

  // ── PDF Export (jsPDF + AutoTable) ─────────────────────────────────────────

  /**
   * Exports tabular data to a landscape PDF using jsPDF + AutoTable.
   * - Professional Helvetica font, A4 landscape.
   * - Company header block with NIT/NRC/period.
   * - Paginated with page numbers in the footer.
   * - Fiscal summary box totaling key monetary columns (last data row if it is a summary row).
   * - Accountant / contributor signature line centered at the bottom of the last page.
   *
   * @param title       Report title shown below the company name.
   * @param headers     Two-dimensional array for AutoTable head (e.g. `[['Col1','Col2',...]]`).
   * @param rows        Data rows matching the header columns.
   * @param companyInfo Object with company metadata for the header block.
   * @param fileName    File name without extension.
   */
  async exportToPdf(
    title: string,
    headers: any[][],
    rows: any[][],
    companyInfo: { nombre: string; nrc: string; nit: string; periodo: string },
    fileName: string,
    resumen?: ResumenFiscal,
    options?: {
      pageFormat?: string | [number, number];
      dataFontSize?: number;
      columnStyles?: any;
      footRows?: any[][];
      footStyles?: any;
      folioBase?: number;
      resumenRows?: Array<{ label: string; value: number; bold?: boolean; separator?: boolean }>;
    }
  ): Promise<void> {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    // Inicializar documento en orientación horizontal (Landscape), puntos (pt)
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'pt',
      format: (options?.pageFormat ?? 'letter') as any
    });

    const pageWidth = doc.internal.pageSize.getWidth();

    // Evento encargado de pintar el encabezado de Ley MH en cada página
    const totalPagesExp = '{total_pages_count}';
    const drawHeader = (data: any) => {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(title.toUpperCase(), 40, 35); 

      doc.setFontSize(10);
      doc.text(companyInfo.nombre.toUpperCase(), 40, 50); 
      
      doc.setFont('Helvetica', 'normal');
      doc.text(`FECHA: ${companyInfo.periodo}`, 40, 65); 
      doc.text(`NRC: ${companyInfo.nrc}`, pageWidth - 180, 35);
      doc.text(`NIT: ${companyInfo.nit}`, pageWidth - 180, 50);
      doc.text('(VALORES EXPRESADOS EN US DOLARES)', pageWidth - 250, 65);
      
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(1);
      doc.line(40, 75, pageWidth - 40, 75);
    };

    // Renderizar la tabla principal con jspdf-autotable
    autoTable(doc, {
      head: headers,
      body: rows,
      foot: options?.footRows ?? [],
      showFoot: 'lastPage',
      startY: 85,
      margin: { top: 85, right: 40, bottom: 60, left: 40 },
      styles: {
        fontSize: options?.dataFontSize ?? 7.5,
        cellPadding: 4,
        overflow: 'linebreak',
        font: 'Helvetica'
      },
      columnStyles: options?.columnStyles ?? {},
      headStyles: {
        fillColor: [30, 41, 59], // Slate 800 - Color corporativo ConTask
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center'
      },
      footStyles: options?.footStyles ?? {
        fillColor: [226, 232, 240],
        textColor: [15, 23, 42],
        fontStyle: 'bold'
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252] // Slate 50
      },
      didDrawPage: (data) => {
        drawHeader(data);

        // Pie de página con numeración dinámica
        const pageNum = doc.getNumberOfPages();
        const str = 'Página ' + pageNum;
        doc.setFontSize(8);
        doc.setFont('Helvetica', 'normal');
        doc.text(str, data.settings.margin.left, doc.internal.pageSize.getHeight() - 25);
        if (options?.folioBase !== undefined) {
          doc.text(
            `Folio N° ${options.folioBase + pageNum}`,
            pageWidth - 40,
            doc.internal.pageSize.getHeight() - 25,
            { align: 'right' }
          );
        }
      }
    });

    // Añadir cuadro resumen + firma en la última página
    const currentY = (doc as any).lastAutoTable.finalY + 30;
    const footerHeightRequired = resumen ? 160 : (options?.resumenRows?.length ? options.resumenRows.length * 16 + 60 : 100);

    // Si no cabe el pie en la página actual, saltar de página para evitar cortes
    if (currentY + footerHeightRequired > doc.internal.pageSize.getHeight()) {
      doc.addPage();
      drawHeader(null);
    }

    const finalY = (doc as any).lastAutoTable.finalY + 40;

    if (resumen) {
      // ── Cuadro RESUMEN DE OPERACIONES (izquierda) ───────────────────────
      const boxX = 40;
      const boxW = 262;
      const rowH = 15;
      const padX = 7;
      let ry = finalY;

      // Barra de título (azul oscuro)
      doc.setFillColor(30, 58, 95);
      doc.rect(boxX, ry, boxW, 18, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('RESUMEN DE OPERACIONES', boxX + boxW / 2, ry + 12, { align: 'center' });
      ry += 18;
      doc.setTextColor(0, 0, 0);

      const drawResRow = (label: string, amount: number, bold = false, r = 255, g = 255, b = 255) => {
        doc.setFillColor(r, g, b);
        doc.setDrawColor(220, 220, 220);
        doc.rect(boxX, ry, boxW, rowH, 'FD');
        doc.setFont('Helvetica', bold ? 'bold' : 'normal');
        doc.setFontSize(7.5);
        doc.text(label, boxX + padX, ry + 10);
        doc.text(`$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, boxX + boxW - padX, ry + 10, { align: 'right' });
        ry += rowH;
      };

      const drawDashedLine = () => {
        doc.setDrawColor(180, 180, 180);
        (doc as any).setLineDash([2, 2], 0);
        doc.line(boxX + 4, ry, boxX + boxW - 4, ry);
        (doc as any).setLineDash([], 0);
      };

      drawResRow('Ventas Gravadas Totales', resumen.gravadas);
      drawResRow('Rebajas y Devoluciones s/Ventas', 0);
      drawDashedLine();
      drawResRow('Ventas Gravadas Netas', resumen.gravadas, false, 241, 245, 249);
      drawResRow('IVA Débito Fiscal (13%)', resumen.debitoFiscal);
      if (resumen.percepcion > 0) {
        drawResRow('Percepción 1%', resumen.percepcion);
      }
      drawDashedLine();
      drawResRow('Ventas Totales', resumen.total, true, 219, 234, 254);

      // ── Línea de firma (derecha del cuadro resumen) ──────────────────────
      const boxHeight = ry - finalY;
      const sigAreaX = boxX + boxW + 50;
      const sigAreaW = pageWidth - sigAreaX - 40;
      const sigCenterX = sigAreaX + sigAreaW / 2;
      const sigLineY = finalY + boxHeight / 2 + 5;

      doc.setDrawColor(100, 100, 100);
      (doc as any).setLineDash([], 0);
      doc.line(sigCenterX - 110, sigLineY, sigCenterX + 110, sigLineY);
      doc.setFontSize(9);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Nombre y Firma del Contador o Contribuyente', sigCenterX, sigLineY + 15, { align: 'center' });
    } else if (options?.resumenRows && options.resumenRows.length > 0) {
      // ── Cuadro RESUMEN personalizado ────────────────────────────────────────
      const boxX = 40;
      const boxW = 262;
      const rowH = 15;
      const padX = 7;
      let ry = finalY;

      doc.setFillColor(30, 58, 95);
      doc.rect(boxX, ry, boxW, 18, 'F');
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      doc.text('RESUMEN', boxX + boxW / 2, ry + 12, { align: 'center' });
      ry += 18;
      doc.setTextColor(0, 0, 0);

      for (const resRow of options.resumenRows) {
        if (resRow.separator) {
          doc.setDrawColor(180, 180, 180);
          (doc as any).setLineDash([2, 2], 0);
          doc.line(boxX + 4, ry, boxX + boxW - 4, ry);
          (doc as any).setLineDash([], 0);
          ry += 4;
          continue;
        }
        const bg = resRow.bold ? [219, 234, 254] : [255, 255, 255];
        doc.setFillColor(bg[0], bg[1], bg[2]);
        doc.setDrawColor(220, 220, 220);
        doc.rect(boxX, ry, boxW, rowH, 'FD');
        doc.setFont('Helvetica', resRow.bold ? 'bold' : 'normal');
        doc.setFontSize(7.5);
        doc.text(resRow.label, boxX + padX, ry + 10);
        doc.text(
          `$${resRow.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          boxX + boxW - padX, ry + 10, { align: 'right' }
        );
        ry += rowH;
      }

      const boxH2 = ry - finalY;
      const sigAreaX2 = boxX + boxW + 50;
      const sigCenterX2 = sigAreaX2 + (pageWidth - sigAreaX2 - 40) / 2;
      const sigLineY2 = finalY + boxH2 / 2 + 5;
      doc.setDrawColor(100, 100, 100);
      (doc as any).setLineDash([], 0);
      doc.line(sigCenterX2 - 110, sigLineY2, sigCenterX2 + 110, sigLineY2);
      doc.setFontSize(9);
      doc.setFont('Helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text('Nombre y Firma del Contador o Contribuyente', sigCenterX2, sigLineY2 + 15, { align: 'center' });
    } else {
      // Sin cuadro resumen: firma centrada
      doc.setDrawColor(100, 100, 100);
      doc.line(pageWidth / 2 - 120, finalY + 40, pageWidth / 2 + 120, finalY + 40);
      doc.setFontSize(9);
      doc.setFont('Helvetica', 'bold');
      doc.text('Nombre y Firma del Contador o Contribuyente', pageWidth / 2, finalY + 55, { align: 'center' });
    }

    doc.save(`${fileName}.pdf`);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /**
   * Draws a compact fiscal summary box below the table.
   * It sums all numeric columns and displays them in two columns inside a shaded box.
   */
  private drawFiscalSummary(
    doc: jsPDF,
    rows: RowInput[],
    headers: string[][],
    startY: number,
    marginX: number,
    pageWidth: number
  ): void {
    const flatHeaders = headers[0] ?? [];

    // Identify numeric columns by sampling the first data row
    const numericColIndexes: number[] = [];
    if (rows.length > 0) {
      const firstRow = rows[0] as unknown[];
      firstRow.forEach((cell, idx) => {
        if (typeof cell === 'number' || (typeof cell === 'string' && !isNaN(Number(cell)) && cell.trim() !== '')) {
          numericColIndexes.push(idx);
        }
      });
    }

    if (numericColIndexes.length === 0) return;

    // Compute column totals
    const totals: { label: string; value: number }[] = numericColIndexes.map((idx) => ({
      label: flatHeaders[idx] ?? `Col ${idx + 1}`,
      value: rows.reduce((acc, row) => acc + (Number((row as unknown[])[idx]) || 0), 0),
    }));

    const boxHeight = Math.ceil(totals.length / 2) * 7 + 14;
    const boxX = marginX;
    const boxWidth = pageWidth - marginX * 2;

    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(150, 150, 150);
    doc.roundedRect(boxX, startY, boxWidth, boxHeight, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    doc.text('RESUMEN FISCAL', boxX + boxWidth / 2, startY + 6, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    const col1X = boxX + 6;
    const col2X = boxX + boxWidth / 2 + 6;
    let rowIdx = 0;

    for (let i = 0; i < totals.length; i += 2) {
      const y = startY + 12 + rowIdx * 7;
      const left = totals[i];
      doc.text(`${left.label}:`, col1X, y);
      doc.setFont('helvetica', 'bold');
      doc.text(
        this.round2(left.value).toFixed(2),
        col1X + boxWidth / 2 - 16,
        y,
        { align: 'right' }
      );
      doc.setFont('helvetica', 'normal');

      if (i + 1 < totals.length) {
        const right = totals[i + 1];
        doc.text(`${right.label}:`, col2X, y);
        doc.setFont('helvetica', 'bold');
        doc.text(
          this.round2(right.value).toFixed(2),
          col2X + boxWidth / 2 - 16,
          y,
          { align: 'right' }
        );
        doc.setFont('helvetica', 'normal');
      }

      rowIdx++;
    }
  }
}
