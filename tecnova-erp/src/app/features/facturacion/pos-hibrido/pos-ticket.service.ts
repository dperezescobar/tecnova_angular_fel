import { Injectable } from '@angular/core';
import * as QRCode from 'qrcode';

export interface PosTicketLinea {
  cantidad: number;
  unidad: string;
  descripcion: string;
  precio: number;
  total: number;
  descuento?: number;
  tipoDescuento?: string;
}

export interface PosTicketDte {
  ambiente: string;        // '00' | '01'
  codGeneracion: string;
  numeroControl: string;
  selloRecepcion: string;
  fechaEmi: string;        // yyyy-MM-dd
}

export interface PosTicketDatos {
  nombreEmpresa: string;
  logoSrc: string;
  clienteNombre: string;
  fecha: string;
  lineas: PosTicketLinea[];
  subtotalBruto: number;
  descuentoTotal: number;
  total: number;
  vuelto?: number;         // presente solo si hubo pago en efectivo con excedente
  dte?: PosTicketDte;      // presente cuando el documento se emitió (hubo sello), sea ambiente '00' o '01'
  // POS Híbrido - Fase 2: true si es un recibo interno pendiente de facturar (Cierre de Recibos),
  // para distinguirlo en el ticket de un documento simplemente no emitido por otra razón.
  esRecibo?: boolean;
  // Campos especializados para Alquiler de Canchas (EuroSoccer):
  canchaNombre?: string;
  canchaTipo?: string;
  canchaTurno?: string;
  canchaTarifaTipo?: string;
  montoTotalTurno?: number;
  saldoPendiente?: number;
  formaPago?: string;
  cajeroNombre?: string;
  puntoVenta?: string;
}

/**
 * Ticket térmico 80mm del POS híbrido — código EXCLUSIVO del POS (no toca ReciboService).
 * Si el documento se emitió (hay Sello de Recepción) agrega el bloque legal del DTE con el ambiente
 * REAL en el QR ('00' pruebas / '01' producción); si no hubo emisión, imprime el recibo simple.
 * (Código de Generación, Número de Control, Sello de Recepción y QR de consulta del MH).
 * La apertura de gaveta se delega al driver de la impresora al enviar a imprimir.
 */
@Injectable({ providedIn: 'root' })
export class PosTicketService {
  private money(v: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v ?? 0);
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  }

  async imprimir(d: PosTicketDatos): Promise<boolean> {
    let qrImg = '';
    if (d.dte) {
      const url = `https://admin.factura.gob.sv/consultaPublica?ambiente=${d.dte.ambiente}&codGen=${d.dte.codGeneracion}&fechaEmi=${d.dte.fechaEmi}`;
      try {
        const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 200 });
        qrImg = `<img class="qr" src="${dataUrl}" alt="QR de consulta" />`;
      } catch {
        qrImg = '';
      }
    }

    const popup = window.open('', '_blank');
    if (!popup) return false;
    popup.document.open();
    popup.document.write(this.build(d, qrImg));
    popup.document.close();
    return true;
  }

  private build(d: PosTicketDatos, qrImg: string): string {
    const filas = d.lineas
      .map(
        (l) => `
        <tr>
          <td class="c">${this.fmtCant(l.cantidad)}${l.unidad ? ' ' + this.esc(l.unidad) : ''}</td>
          <td>${this.esc(l.descripcion)}</td>
          <td class="r">${this.money(l.cantidad * l.precio)}</td>
        </tr>${l.descuento ? `
        <tr class="desc-row">
          <td></td>
          <td>Precio unitario</td>
          <td class="r">${this.money(l.precio)}</td>
        </tr>
        <tr class="desc-row">
          <td></td>
          <td>Descuento${l.tipoDescuento ? ' ' + this.esc(l.tipoDescuento) : ''}</td>
          <td class="r">-${this.money(l.descuento)}</td>
        </tr>` : ''}`
      )
      .join('');

    const dteBloque = d.dte
      ? `
      <div class="dte">
        <div class="dte-row"><span>Cód. Generación</span><b>${this.esc(d.dte.codGeneracion)}</b></div>
        <div class="dte-row"><span>Número de Control</span><b>${this.esc(d.dte.numeroControl)}</b></div>
        <div class="dte-row"><span>Sello de Recepción</span><b>${this.esc(d.dte.selloRecepcion)}</b></div>
        ${qrImg ? `<div class="qr-wrap">${qrImg}<small>Consulta en el portal del Ministerio de Hacienda</small></div>` : ''}
      </div>`
      : '';

    const esCancha = Boolean(d.canchaNombre || d.canchaTurno);

    const canchaBloque = esCancha
      ? `
      <div class="cancha-box">
        <div class="row-cancha">
          <span>CANCHA:</span>
          <span>${this.esc(d.canchaNombre || '')}${d.canchaTipo ? ' (' + this.esc(d.canchaTipo) + ')' : ''}</span>
        </div>
        ${d.canchaTurno ? `
        <div class="row-turno">
          <span>TURNO RESERVADO:</span>
          <span class="turno-badge">${this.esc(d.canchaTurno)}</span>
        </div>` : ''}
        ${d.canchaTarifaTipo ? `<div class="tarifa-sub">(${this.esc(d.canchaTarifaTipo)})</div>` : ''}
      </div>`
      : '';

    return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><title>Ticket</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body {
    width: 80mm;
    font: 12px/1.35 'Segoe UI', -apple-system, BlinkMacSystemFont, 'Roboto', 'Arial', sans-serif;
    color: #000000 !important;
    font-weight: 600;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }
  .ticket { width: 72mm; margin: 0 auto; padding: 3mm 2mm 8mm; box-sizing: border-box; }
  .center { text-align: center; }
  .logo { max-width: 45mm; max-height: 20mm; display: block; margin: 0 auto 4px; }
  .emp { font-size: 16px; font-weight: 900; text-align: center; text-transform: uppercase; letter-spacing: 0.5px; }
  .sub { text-align: center; font-size: 11px; font-weight: 800; text-transform: uppercase; margin: 2px 0 6px; }
  .meta { font-size: 11px; margin-bottom: 5px; }
  .meta div { display: flex; justify-content: space-between; margin-bottom: 1.5px; }
  .meta span.lbl { font-weight: 700; }
  .meta span.val { font-weight: 800; }
  
  .cancha-box {
    border: 2px solid #000000;
    border-radius: 4px;
    padding: 6px 8px;
    margin: 6px 0 8px;
    background: #fbfbfb;
  }
  .cancha-box .row-cancha { display: flex; justify-content: space-between; font-size: 11px; font-weight: 900; }
  .cancha-box .row-turno {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11.5px;
    font-weight: 900;
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px dashed #000000;
  }
  .cancha-box .turno-badge {
    background: #000000;
    color: #ffffff !important;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 900;
    letter-spacing: 0.5px;
  }
  .cancha-box .tarifa-sub { text-align: center; font-size: 9.5px; font-weight: 700; margin-top: 3px; }

  table { width: 100%; border-collapse: collapse; margin: 5px 0; }
  th { border-bottom: 2px solid #000000; text-align: left; font-size: 10.5px; font-weight: 900; padding: 3px 0; }
  th.r, td.r { text-align: right; }
  th.c, td.c { text-align: center; white-space: nowrap; }
  td { padding: 3px 0; vertical-align: top; font-size: 11.5px; font-weight: 700; }
  .desc-row td { padding: 0 0 3px; font-size: 10px; font-weight: 600; color: #000000; }

  .tot { border-top: 2px solid #000000; margin-top: 5px; padding-top: 5px; }
  .tot .row { display: flex; justify-content: space-between; font-size: 11.5px; font-weight: 700; margin-bottom: 2px; }
  .tot .row.vuelto { font-size: 13px; font-weight: 900; margin-top: 3px; border-top: 1px dashed #000000; padding-top: 3px; }
  .tot .grand { display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; margin: 3px 0; }
  .tot .status-box {
    border: 1.5px solid #000000;
    border-radius: 3px;
    text-align: center;
    padding: 3px;
    font-size: 11px;
    font-weight: 900;
    margin: 5px 0;
  }
  .tot .saldo-pend { color: #000000; font-weight: 900; font-size: 12px; }
  .iva { text-align: center; font-size: 10px; font-weight: 600; margin-top: 2px; }

  .dte { border-top: 2px solid #000000; margin-top: 6px; padding-top: 6px; font-size: 10px; }
  .dte-row { margin-bottom: 3px; }
  .dte-row span { display: block; font-weight: 700; }
  .dte-row b { word-break: break-all; font-weight: 900; font-size: 10.5px; }
  .qr-wrap { text-align: center; margin-top: 6px; }
  .qr { width: 38mm; height: 38mm; }
  .qr-wrap small { display: block; font-size: 9px; font-weight: 600; margin-top: 2px; }

  .foot { text-align: center; font-size: 10.5px; font-weight: 700; margin-top: 8px; border-top: 1.5px dashed #000000; padding-top: 6px; }
  .foot-rules {
    border-top: 1.5px dashed #000000;
    margin-top: 8px;
    padding-top: 6px;
    font-size: 9.5px;
    font-weight: 700;
    line-height: 1.4;
    text-align: center;
  }
  .foot-thanks { font-size: 11px; font-weight: 900; text-transform: uppercase; margin-top: 4px; }
  .foot-sys { text-align: center; font-size: 8.5px; font-weight: 600; margin-top: 6px; border-top: 1px solid #000000; padding-top: 3px; }
</style></head>
<body>
  <div class="ticket">
    ${d.logoSrc ? `<img class="logo" src="${this.esc(d.logoSrc)}" alt="logo" />` : ''}
    <div class="emp">${this.esc(d.nombreEmpresa)}</div>
    <div class="sub">${esCancha ? 'Comprobante de Alquiler de Cancha' : (d.dte ? 'Factura (Consumidor Final)' : (d.esRecibo ? 'Recibo interno - pendiente de facturar' : 'Recibo de venta'))}</div>
    <div class="meta">
      <div><span class="lbl">Fecha:</span><span class="val">${this.esc(d.fecha)}</span></div>
      <div><span class="lbl">Cliente:</span><span class="val">${this.esc(d.clienteNombre)}</span></div>
      ${d.cajeroNombre ? `<div><span class="lbl">Atendido por:</span><span class="val">${this.esc(d.cajeroNombre)}${d.puntoVenta ? ' (' + this.esc(d.puntoVenta) + ')' : ''}</span></div>` : ''}
      ${d.formaPago ? `<div><span class="lbl">Forma Pago:</span><span class="val">${this.esc(d.formaPago)}</span></div>` : ''}
    </div>

    ${canchaBloque}

    <table>
      <thead><tr><th class="c">Cant</th><th>Descripción</th><th class="r">Total</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="tot">
      ${d.descuentoTotal > 0 ? `
      <div class="row"><span>Subtotal</span><span>${this.money(d.subtotalBruto)}</span></div>
      <div class="row"><span>Descuento</span><span>-${this.money(d.descuentoTotal)}</span></div>` : ''}
      
      ${d.montoTotalTurno !== undefined && d.montoTotalTurno !== d.total ? `
      <div class="row"><span>Total Turno:</span><span>${this.money(d.montoTotalTurno)}</span></div>
      <div class="row"><span>Monto Pagado:</span><span>${this.money(d.total)}</span></div>` : `
      <div class="grand"><span>TOTAL</span><span>${this.money(d.total)}</span></div>`}

      ${d.saldoPendiente !== undefined ? (
        d.saldoPendiente > 0 ? `
        <div class="row saldo-pend"><span>SALDO PENDIENTE:</span><span>${this.money(d.saldoPendiente)}</span></div>` : `
        <div class="status-box">✅ TURNO LIQUIDADO (SALDO: $0.00)</div>`
      ) : ''}

      <div class="iva">IVA incluido</div>
      ${d.vuelto && d.vuelto > 0 ? `<div class="row vuelto"><span>Vuelto</span><span>${this.money(d.vuelto)}</span></div>` : ''}
    </div>
    ${dteBloque}

    ${esCancha ? `
    <div class="foot-rules">
      <div>• Presentarse con 10 minutos de anticipación al turno.</div>
      <div>• Uso obligatorio de calzado adecuado para césped sintético.</div>
      <div>• Conserve este comprobante para ingresar a la cancha.</div>
      <div class="foot-thanks">¡Gracias por jugar en EuroSoccer Club!</div>
      <div class="foot-sys">Tecnova ERP • EuroSoccer App</div>
    </div>` : `
    <div class="foot">¡Gracias por su compra!</div>`}
  </div>
  <script>window.onload=function(){setTimeout(function(){window.print();},300);};</script>
</body></html>`;
  }

  private fmtCant(n: number): string {
    return Number.isInteger(n) ? String(n) : String(n).replace(/\.?0+$/, '');
  }
}
