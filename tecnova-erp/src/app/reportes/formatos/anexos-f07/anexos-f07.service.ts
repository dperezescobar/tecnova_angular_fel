import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface ColumnDef {
  field: string;
  header: string;
  type: 'text' | 'number';
  minWidth?: string;
}

export interface AnexoConfig {
  tipo: string;
  label: string;
  columns: ColumnDef[];
}

export const ANEXO_CONFIGS: AnexoConfig[] = [
  {
    tipo: 'COMPRAS',
    label: 'Anexo de Compras',
    columns: [
      { field: 'FECHA',                        header: 'Fecha',              type: 'text',   minWidth: '90px' },
      { field: 'Clase_Doc',                    header: 'Clase',              type: 'text',   minWidth: '55px' },
      { field: 'TIPO_COMPROBANTE',             header: 'T.Comp',             type: 'text',   minWidth: '60px' },
      { field: 'NUMERO',                       header: 'Número',             type: 'text',   minWidth: '120px' },
      { field: 'REGISTRO_COMERCIO',            header: 'NRC/NIT',            type: 'text',   minWidth: '100px' },
      { field: 'NOMBRE',                       header: 'Proveedor',          type: 'text',   minWidth: '150px' },
      { field: 'COMPRAS_INTERNAS_EXENTAS',     header: 'Comp.Int.Exentas',   type: 'number', minWidth: '110px' },
      { field: 'INTERNA_EXENTAS_O_NO_SUJETAS', header: 'Int.Exentas/NS',     type: 'number', minWidth: '110px' },
      { field: 'IMPORT_EXENTAS_O_NO_SUJETAS',  header: 'Imp.Exentas/NS',     type: 'number', minWidth: '110px' },
      { field: 'COMPRAS_INTERNAS_GRAVADAS',    header: 'Comp.Int.Gravadas',  type: 'number', minWidth: '110px' },
      { field: 'INTERNA_GRAVADAS_BIENES',      header: 'Int.Grav.Bienes',    type: 'number', minWidth: '110px' },
      { field: 'IMPORT_GRAVADAS_BIENES',       header: 'Imp.Grav.Bienes',    type: 'number', minWidth: '110px' },
      { field: 'IMPORT_GRAVADAS_SERVICIOS',    header: 'Imp.Grav.Servs',     type: 'number', minWidth: '110px' },
      { field: 'CREDITO_FISCAL',               header: 'Créd.Fiscal',        type: 'number', minWidth: '100px' },
      { field: 'TOTAL_COMPRAS',                header: 'Total Compras',      type: 'number', minWidth: '100px' },
      { field: 'DUI',                          header: 'DUI',                type: 'text',   minWidth: '90px' },
      { field: 'TIPO_OPERACION',               header: 'T.Op',               type: 'text',   minWidth: '50px' },
      { field: 'CLASIFICACION',                header: 'Clasif.',            type: 'text',   minWidth: '60px' },
      { field: 'SECTOR',                       header: 'Sector',             type: 'text',   minWidth: '55px' },
      { field: 'Cod_Costo_Gasto',              header: 'C.CG',               type: 'text',   minWidth: '50px' },
      { field: 'NUMERO_ANEXO',                 header: 'N.Anx',              type: 'text',   minWidth: '55px' },
    ]
  },
  {
    tipo: 'CONTRIBUYENTES',
    label: 'Anexo Ventas a Contribuyentes',
    columns: [
      { field: 'FECHA',                   header: 'Fecha',          type: 'text',   minWidth: '90px' },
      { field: 'ClaseDocumento',          header: 'Clase',          type: 'text',   minWidth: '55px' },
      { field: 'Tipo_Documento',          header: 'T.Doc',          type: 'text',   minWidth: '55px' },
      { field: 'Numero_resolucion',       header: 'N.Resolución',   type: 'text',   minWidth: '110px' },
      { field: 'Serie_Documento',         header: 'Serie/Sello',    type: 'text',   minWidth: '160px' },
      { field: 'Numero_Documento',        header: 'N.Documento',    type: 'text',   minWidth: '120px' },
      { field: 'NUMERO_CONTROL_INTERNO',  header: 'Ctrl.Interno',   type: 'text',   minWidth: '100px' },
      { field: 'NIT',                     header: 'NIT',            type: 'text',   minWidth: '100px' },
      { field: 'NOMBRE',                  header: 'Cliente',        type: 'text',   minWidth: '150px' },
      { field: 'EXENTAS',                 header: 'Exentas',        type: 'number', minWidth: '90px' },
      { field: 'NO_SUJETAS',              header: 'No Sujetas',     type: 'number', minWidth: '90px' },
      { field: 'GRAVADAS',                header: 'Gravadas',       type: 'number', minWidth: '90px' },
      { field: 'DEBITO_FISCAL',           header: 'Déb.Fiscal',     type: 'number', minWidth: '90px' },
      { field: 'Venta_cuentas_tercero',   header: 'Vta.Terceros',   type: 'number', minWidth: '90px' },
      { field: 'Debito_fiscal_ventas',    header: 'Déb.Fisc.Vta',  type: 'number', minWidth: '90px' },
      { field: 'TOTAL_VENTAS',            header: 'Total Ventas',   type: 'number', minWidth: '100px' },
      { field: 'DUI',                     header: 'DUI',            type: 'text',   minWidth: '90px' },
      { field: 'Tipo_Operacion',          header: 'T.Op',           type: 'text',   minWidth: '50px' },
      { field: 'Tipo_Ingreso',            header: 'T.Ingreso',      type: 'text',   minWidth: '70px' },
      { field: 'NUMERO_ANEXO',            header: 'N.Anx',          type: 'text',   minWidth: '55px' },
    ]
  },
  {
    tipo: 'CONSUMIDOR_FINAL',
    label: 'Anexo Ventas a Consumidor Final',
    columns: [
      { field: 'FECHA',                     header: 'Fecha',            type: 'text',   minWidth: '90px' },
      { field: 'ClaseDocumento',            header: 'Clase',            type: 'text',   minWidth: '55px' },
      { field: 'Tipo_Documento',            header: 'T.Doc',            type: 'text',   minWidth: '55px' },
      { field: 'Numero_resolucion',         header: 'N.Resolución',     type: 'text',   minWidth: '110px' },
      { field: 'Serie_Documento',           header: 'Serie/Sello',      type: 'text',   minWidth: '160px' },
      { field: 'NumeroControlInternoDel',   header: 'Ctrl.Int.Desde',   type: 'text',   minWidth: '100px' },
      { field: 'NumeroControlInternoAl',    header: 'Ctrl.Int.Hasta',   type: 'text',   minWidth: '100px' },
      { field: 'Numero_DocumentoDel',       header: 'N.Doc.Desde',      type: 'text',   minWidth: '100px' },
      { field: 'Numero_DocumentoAl',        header: 'N.Doc.Hasta',      type: 'text',   minWidth: '100px' },
      { field: 'NumeroMaqRegistradora',     header: 'N.Máq.Reg.',       type: 'text',   minWidth: '90px' },
      { field: 'EXENTAS',                   header: 'Exentas',          type: 'number', minWidth: '90px' },
      { field: 'VentasIntExeNoSujetas',     header: 'Int.Exe.NS',       type: 'number', minWidth: '90px' },
      { field: 'NO_SUJETAS',               header: 'No Sujetas',       type: 'number', minWidth: '90px' },
      { field: 'GRAVADAS',                  header: 'Gravadas',         type: 'number', minWidth: '90px' },
      { field: 'ExportDentroCentroA',       header: 'Exp.Dentro CA',    type: 'number', minWidth: '100px' },
      { field: 'ExportFueraCentroA',        header: 'Exp.Fuera CA',     type: 'number', minWidth: '100px' },
      { field: 'ExportacionServicio',       header: 'Exp.Serv.',        type: 'number', minWidth: '90px' },
      { field: 'VentasZonaFranca',          header: 'Z.Franca',         type: 'number', minWidth: '80px' },
      { field: 'VentaCuentasTercero',       header: 'Vta.Terceros',     type: 'number', minWidth: '90px' },
      { field: 'TOTAL_VENTAS',              header: 'Total Ventas',     type: 'number', minWidth: '100px' },
      { field: 'Tipo_Operacion',            header: 'T.Op',             type: 'text',   minWidth: '50px' },
      { field: 'Tipo_Ingreso',              header: 'T.Ingreso',        type: 'text',   minWidth: '70px' },
      { field: 'NUMERO_ANEXO',              header: 'N.Anx',            type: 'text',   minWidth: '55px' },
    ]
  },
  {
    tipo: 'SUJETO_EXCLUIDO',
    label: 'Compras a Sujetos Excluidos',
    columns: [
      { field: 'TIPO_DOCUMENTO',             header: 'T.Documento',       type: 'text',   minWidth: '90px' },
      { field: 'NUMERO_DUI_NIT',             header: 'DUI/NIT',           type: 'text',   minWidth: '100px' },
      { field: 'NOMBRE',                     header: 'Proveedor',         type: 'text',   minWidth: '150px' },
      { field: 'FECHA',                      header: 'Fecha',             type: 'text',   minWidth: '90px' },
      { field: 'NUMERO_SERIE_DOC',           header: 'Serie Doc',         type: 'text',   minWidth: '100px' },
      { field: 'NUMERO',                     header: 'Número',            type: 'text',   minWidth: '120px' },
      { field: 'COMPRAS_INTERNAS_GRAVADAS',  header: 'Compras Gravadas',  type: 'number', minWidth: '110px' },
      { field: 'MONTO_RETENCION',            header: 'M.Retención',       type: 'number', minWidth: '90px' },
      { field: 'TIPO_OPERACION',             header: 'T.Op',              type: 'text',   minWidth: '50px' },
      { field: 'CLASIFICACION',              header: 'Clasif.',           type: 'text',   minWidth: '60px' },
      { field: 'SECTOR',                     header: 'Sector',            type: 'text',   minWidth: '55px' },
      { field: 'Cod_Costo_Gasto',            header: 'C.CG',              type: 'text',   minWidth: '50px' },
      { field: 'NUMERO_ANEXO',               header: 'N.Anx',             type: 'text',   minWidth: '55px' },
    ]
  },
  {
    tipo: 'RETENCION',
    label: 'Retención IVA 1% Declarante',
    columns: [
      { field: 'NIT_AGENTE',        header: 'NIT Agente',     type: 'text',   minWidth: '110px' },
      { field: 'FECHA_EMISION',     header: 'Fecha Emisión',  type: 'text',   minWidth: '100px' },
      { field: 'TIPO_DOCUMENTO',    header: 'T.Doc',          type: 'text',   minWidth: '55px' },
      { field: 'NUMERO_RESOLUCION', header: 'N.Resolución',   type: 'text',   minWidth: '110px' },
      { field: 'SERIE_DOCUMENTO',   header: 'Serie',          type: 'text',   minWidth: '100px' },
      { field: 'NUMERO_DOCUMENTO',  header: 'N.Documento',    type: 'text',   minWidth: '120px' },
      { field: 'MONTO_SUJETO',      header: 'M.Sujeto',       type: 'number', minWidth: '90px' },
      { field: 'MONTO_RETENCION',   header: 'M.Retención',    type: 'number', minWidth: '90px' },
      { field: 'DUI_AGENTE',        header: 'DUI Agente',     type: 'text',   minWidth: '90px' },
      { field: 'NUMERO_ANEXO',      header: 'N.Anx',          type: 'text',   minWidth: '55px' },
    ]
  },
  {
    tipo: 'PERCEPCION',
    label: 'Percepción IVA 1% Declarante',
    columns: [
      { field: 'NIT_AGENTE',        header: 'NIT Agente',     type: 'text',   minWidth: '110px' },
      { field: 'FECHA_EMISION',     header: 'Fecha Emisión',  type: 'text',   minWidth: '100px' },
      { field: 'TIPO_DOCUMENTO',    header: 'T.Doc',          type: 'text',   minWidth: '55px' },
      { field: 'NUMERO_RESOLUCION', header: 'N.Resolución',   type: 'text',   minWidth: '110px' },
      { field: 'SERIE_DOCUMENTO',   header: 'Serie',          type: 'text',   minWidth: '100px' },
      { field: 'NUMERO_DOCUMENTO',  header: 'N.Documento',    type: 'text',   minWidth: '120px' },
      { field: 'MONTO_SUJETO',      header: 'M.Sujeto',       type: 'number', minWidth: '90px' },
      { field: 'MONTO_PERCEPCION',  header: 'M.Percepción',   type: 'number', minWidth: '90px' },
      { field: 'DUI_AGENTE',        header: 'DUI Agente',     type: 'text',   minWidth: '90px' },
      { field: 'NUMERO_ANEXO',      header: 'N.Anx',          type: 'text',   minWidth: '55px' },
    ]
  },
  {
    tipo: 'ANULADOS',
    label: 'Anexo Documentos Anulados',
    columns: [
      { field: 'NUMERO_RESOLUCION',  header: 'N.Resolución',    type: 'text', minWidth: '110px' },
      { field: 'ClaseDocumento',     header: 'Clase',           type: 'text', minWidth: '55px' },
      { field: 'DESDE_PRE_IMPRESO',  header: 'Desde Preimpr.',  type: 'text', minWidth: '100px' },
      { field: 'HASTA_PRE_IMPRESO',  header: 'Hasta Preimpr.',  type: 'text', minWidth: '100px' },
      { field: 'TIPO_DOC',           header: 'T.Doc',           type: 'text', minWidth: '55px' },
      { field: 'TIPO_DETALLE',       header: 'Detalle',         type: 'text', minWidth: '65px' },
      { field: 'Serie_Documento',    header: 'Serie',           type: 'text', minWidth: '100px' },
      { field: 'DESDE',              header: 'Desde',           type: 'text', minWidth: '100px' },
      { field: 'HASTA',              header: 'Hasta',           type: 'text', minWidth: '100px' },
      { field: 'Codigo_Generacion',  header: 'Cód.Generación',  type: 'text', minWidth: '140px' },
    ]
  }
];

@Injectable({ providedIn: 'root' })
export class AnexosF07Service {
  private http = inject(HttpClient);
  private api = `${environment.apiUrl}/AnexosF07`;

  getAnexo(tipo: string, fechaInicio: string, fechaFin: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.api}?tipo=${tipo}&fechaInicio=${fechaInicio}&fechaFin=${fechaFin}`);
  }

  async exportarExcel(datos: any[], columnas: ColumnDef[], nombreArchivo: string): Promise<void> {
    const { utils, writeFile } = await import('xlsx');
    const headers = columnas.map(c => c.header);
    const rows = datos.map(row => columnas.map(c => {
      const v = row[c.field];
      return v == null ? '' : v;
    }));
    const worksheet = utils.aoa_to_sheet([headers, ...rows]);
    const colWidths = headers.map((h, i) => {
      let max = h.length;
      rows.forEach(r => { const len = String(r[i] ?? '').length; if (len > max) max = len; });
      return { wch: max + 2 };
    });
    worksheet['!cols'] = colWidths;
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Anexo F07');
    writeFile(workbook, `${nombreArchivo}.xlsx`);
  }

  // Formato exigido por el portal del MH (F07): delimitador ';', SIN BOM y codificación ANSI
  // (Windows-1252). Con coma + BOM UTF-8 el portal lo rechaza (Excel en locale ES no separa por
  // coma y los acentos UTF-8 quedan mal). Este formato coincide con el archivo que el portal acepta.
  exportarCsv(datos: any[], columnas: ColumnDef[], nombreArchivo: string): void {
    const DELIM = ';';
    const esc = (val: unknown): string => {
      const str = String(val ?? '');
      return str.includes(DELIM) || str.includes('"') || str.includes('\n') || str.includes('\r')
        ? `"${str.replace(/"/g, '""')}"` : str;
    };
    const headers = columnas.map(c => esc(c.header));
    const rows = datos.map(row => columnas.map(c => esc(row[c.field] ?? '')));
    const csv = [headers.join(DELIM), ...rows.map(r => r.join(DELIM))].join('\r\n');

    // Codificar a Windows-1252 (un byte por carácter). Los acentos del español (á,é,í,ó,ú,ñ,¿,¡…)
    // caen en 0xA0–0xFF y coinciden con Latin1; lo que no sea representable se sustituye por '?'.
    const bytes = new Uint8Array(csv.length);
    for (let i = 0; i < csv.length; i++) {
      const code = csv.charCodeAt(i);
      bytes[i] = code <= 0xff ? code : 0x3f;
    }

    const blob = new Blob([bytes], { type: 'text/csv;charset=windows-1252;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${nombreArchivo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
