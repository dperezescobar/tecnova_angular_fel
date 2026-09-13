import { Injectable } from '@angular/core';
import { ReciboCompra } from './registro-compra-json.service';

// Recibo simple de una compra cargada (JSON de DTE del proveedor o registro manual).
// Formato propio (no ReciboService de facturación): ese servicio está pensado para documentos
// DE VENTA ("Documento de Venta", "Cliente") y aquí el flujo es al revés — el proveedor es quien
// emite y nosotros somos el receptor — por lo que reutilizarlo obligaría a relabels incorrectos.
@Injectable({ providedIn: 'root' })
export class ReciboCompraService {
  private money(v: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v ?? 0);
  }

  private esc(s: string): string {
    return String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  }

  private buildFragment(r: ReciboCompra): string {
    const filas = r.lineas
      .map(
        (l) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${l.cantidad}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${this.esc(l.descripcion)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${this.money(l.precioUnitario)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${this.money(l.total)}</td>
        </tr>`
      )
      .join('');

    const avisoFuente =
      r.fuente === 'REGISTRO'
        ? `<div style="background:#fffbeb; border:1px solid #fde68a; color:#92400e; padding:10px 15px; border-radius:5px; margin-bottom:20px; font-size:12px;">
             Esta compra no tiene el JSON del DTE archivado — se muestran los datos guardados en el registro.
           </div>`
        : '';

    return `
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #f0f0f0; }
        .a4-container {
          width: 210mm; min-height: 297mm; margin: 20mm auto; padding: 20mm;
          background: white; box-shadow: 0 0 10px rgba(0,0,0,0.1); box-sizing: border-box;
        }
        .header { text-align: center; margin-bottom: 20px; }
        .company-name { font-size: 22px; font-weight: bold; margin: 0; color: #333; }
        .doc-title { font-size: 16px; color: #666; margin: 8px 0 0; text-transform: uppercase; letter-spacing: 1px; }
        .info-grid { display: flex; justify-content: space-between; margin-bottom: 20px; border: 1px solid #ddd; padding: 15px; border-radius: 5px; gap: 20px; }
        .info-col { flex: 1; }
        .info-col strong { display: block; font-size: 11px; color: #777; margin-bottom: 2px; text-transform: uppercase; }
        .info-col span { display: block; font-size: 13px; color: #333; margin-bottom: 8px; word-break: break-word; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background-color: #f8f9fa; padding: 10px 8px; text-align: left; font-size: 13px; color: #555; border-bottom: 2px solid #ddd; }
        th.center { text-align: center; } th.right { text-align: right; }
        .totals { width: 300px; margin-left: auto; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; }
        .total-row.grand-total { font-weight: bold; font-size: 18px; border-top: 2px solid #ddd; margin-top: 10px; padding-top: 10px; }
        .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 15px; }
        @media print {
          body { background: white; margin: 0; }
          .a4-container { box-shadow: none; margin: 0; padding: 10mm; width: 100%; min-height: auto; }
        }
      </style>
      <div class="a4-container">
        <div class="header">
          <h1 class="company-name">${this.esc(r.proveedorNombre) || 'Proveedor sin nombre registrado'}</h1>
          <h2 class="doc-title">Recibo de compra — Documento del proveedor</h2>
        </div>

        ${avisoFuente}

        <div class="info-grid">
          <div class="info-col">
            <strong>NIT / NRC Proveedor</strong>
            <span>${this.esc(r.proveedorNit)} / ${this.esc(r.proveedor)}</span>
            <strong>Dirección</strong>
            <span>${this.esc(r.proveedorDireccion) || '—'}</span>
            <strong>Teléfono</strong>
            <span>${this.esc(r.proveedorTelefono) || '—'}</span>
          </div>
          <div class="info-col" style="text-align: right;">
            <strong>Número de documento</strong>
            <span>${this.esc(r.numero)}</span>
            <strong>Número de control</strong>
            <span>${this.esc(r.numeroControl) || '—'}</span>
            <strong>Sello de recepción</strong>
            <span>${this.esc(r.selloRecepcion) || '—'}</span>
            <strong>Fecha de emisión</strong>
            <span>${this.esc(r.fecha)}</span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="center" style="width: 10%;">CANT.</th>
              <th style="width: 50%;">DESCRIPCIÓN</th>
              <th class="right" style="width: 20%;">PRECIO UNIT.</th>
              <th class="right" style="width: 20%;">TOTAL</th>
            </tr>
          </thead>
          <tbody>${filas}</tbody>
        </table>

        <div class="totals">
          <div class="total-row"><span>Gravadas:</span><span>${this.money(r.gravadas)}</span></div>
          <div class="total-row"><span>IVA:</span><span>${this.money(r.iva)}</span></div>
          ${
            r.otrosImpuestos > 0
              ? `<div class="total-row"><span>Otros impuestos/retenciones:</span><span>${this.money(r.otrosImpuestos)}</span></div>`
              : ''
          }
          <div class="total-row grand-total"><span>Total:</span><span>${this.money(r.total)}</span></div>
        </div>

        <div class="footer">
          <p>Recibo generado internamente a partir del documento recibido del proveedor. No sustituye al DTE original.</p>
        </div>
      </div>`;
  }

  buildDocumentoVisual(r: ReciboCompra): string {
    return `<!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><title>Recibo de compra ${this.esc(r.numero)}</title></head>
      <body>${this.buildFragment(r)}</body>
      </html>`;
  }
}
