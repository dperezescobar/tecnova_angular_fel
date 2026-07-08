import { Injectable } from '@angular/core';

export interface ReciboLinea {
  cantidad: number;
  descripcion: string;
  precioUnitario: number;
  total: number;
}

export interface ReciboDatos {
  nombreEmpresa: string;
  logoSrc: string;
  clienteNombre: string;
  codigoDocumento: string;
  fechaEmision: string;
  lineas: ReciboLinea[];
  subtotal: number;
  descuento: number;
  total: number;
}

// Recibo informal para documentos que NO pasan por Hacienda (ambiente de emisión 0, o empresas
// que no emiten DTE). Antes vivía embebido en fac-pos.ts (imprimirTicketInformal); se comparte
// aquí para que fac.ts pueda reutilizar exactamente el mismo formato.
@Injectable({ providedIn: 'root' })
export class ReciboService {
  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value ?? 0);
  }

  private buildFragment(datos: ReciboDatos): string {
    const filasDetalle = datos.lineas
      .map(
        (item) => `
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.cantidad}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd;">${item.descripcion}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${this.formatCurrency(item.precioUnitario)}</td>
          <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${this.formatCurrency(item.total)}</td>
        </tr>`
      )
      .join('');

    return `
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 0; background: #f0f0f0; }
        .a4-container {
          width: 210mm;
          min-height: 297mm;
          margin: 20mm auto;
          padding: 20mm;
          background: white;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
          box-sizing: border-box;
        }
        .header { text-align: center; margin-bottom: 30px; }
        .logo { max-width: 150px; max-height: 80px; margin-bottom: 10px; }
        .company-name { font-size: 24px; font-weight: bold; margin: 0; color: #333; }
        .doc-title { font-size: 18px; color: #666; margin: 10px 0; text-transform: uppercase; letter-spacing: 1px; }
        .info-grid { display: flex; justify-content: space-between; margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
        .info-col { flex: 1; }
        .info-col strong { display: block; font-size: 12px; color: #777; margin-bottom: 3px; }
        .info-col span { display: block; font-size: 14px; color: #333; margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th { background-color: #f8f9fa; padding: 10px 8px; text-align: left; font-size: 13px; color: #555; border-bottom: 2px solid #ddd; }
        th.center { text-align: center; }
        th.right { text-align: right; }
        .totals { width: 300px; margin-left: auto; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
        .total-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; }
        .total-row.grand-total { font-weight: bold; font-size: 18px; border-top: 2px solid #ddd; margin-top: 10px; padding-top: 10px; }
        .footer { text-align: center; margin-top: 50px; font-size: 12px; color: #888; border-top: 1px solid #ddd; padding-top: 20px; }
        @media print {
          body { background: white; margin: 0; }
          .a4-container { box-shadow: none; margin: 0; padding: 10mm; width: 100%; min-height: auto; }
        }
      </style>
      <div class="a4-container">
        <div class="header">
          ${datos.logoSrc ? `<img src="${datos.logoSrc}" alt="Logo" class="logo">` : ''}
          <h1 class="company-name">${datos.nombreEmpresa}</h1>
          <h2 class="doc-title">Documento de Venta</h2>
        </div>

        <div class="info-grid">
          <div class="info-col">
            <strong>CLIENTE</strong>
            <span>${datos.clienteNombre}</span>
          </div>
          <div class="info-col" style="text-align: right;">
            <strong>CÓDIGO DE DOCUMENTO</strong>
            <span>${datos.codigoDocumento}</span>
            <strong>FECHA DE EMISIÓN</strong>
            <span>${datos.fechaEmision}</span>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="center" style="width: 10%;">CANTIDAD</th>
              <th style="width: 50%;">DESCRIPCIÓN</th>
              <th class="right" style="width: 20%;">PRECIO UNIT.</th>
              <th class="right" style="width: 20%;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${filasDetalle}
          </tbody>
        </table>

        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>${this.formatCurrency(datos.subtotal)}</span>
          </div>
          ${
            datos.descuento > 0
              ? `<div class="total-row" style="color: #dc3545;"><span>Descuento:</span><span>-${this.formatCurrency(datos.descuento)}</span></div>`
              : ''
          }
          <div class="total-row grand-total">
            <span>Total a Pagar:</span>
            <span>${this.formatCurrency(datos.total)}</span>
          </div>
        </div>

        <div class="footer">
          <p>Gracias por su compra.</p>
        </div>
      </div>`;
  }

  private buildDocument(datos: ReciboDatos, autoPrint: boolean): string {
    const fragment = this.buildFragment(datos);
    const script = autoPrint
      ? `<script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          };
        </script>`
      : '';

    return `<!DOCTYPE html>
      <html lang="es">
      <head><meta charset="UTF-8"><title>Recibo ${datos.codigoDocumento}</title></head>
      <body>
        ${fragment}
        ${script}
      </body>
      </html>`;
  }

  // Documento completo SIN script de auto-impresión, para incrustar en un visor propio
  // (ej. openDteVisualPreview en fac-pos/fac, que agrega su propia barra con botón de imprimir).
  buildDocumentoVisual(datos: ReciboDatos): string {
    return this.buildDocument(datos, false);
  }

  imprimirRecibo(datos: ReciboDatos): boolean {
    const popup = window.open('', '_blank');
    if (!popup) return false;
    popup.document.open();
    popup.document.write(this.buildDocument(datos, true));
    popup.document.close();
    return true;
  }

  async generarReciboPdfBase64(datos: ReciboDatos): Promise<string> {
    const [{ default: JsPdf }, { default: html2canvas }] = await Promise.all([
      import('jspdf'),
      import('html2canvas')
    ]);

    // NO usamos doc.html(): su renderer/paginador es inestable (produce paginas en
    // blanco y desalineacion). En su lugar capturamos el DOM real con html2canvas
    // (copia fiel de lo que se ve en pantalla) y lo insertamos como imagen en un PDF
    // cuyo tamano de pagina coincide exactamente con la captura -> copia identica,
    // una sola pagina, sin paginas en blanco.
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '-10000px';
    container.style.width = '800px';
    container.style.background = '#ffffff';
    container.innerHTML = this.buildFragment(datos);
    document.body.appendChild(container);

    const a4 = container.querySelector<HTMLElement>('.a4-container');
    if (a4) {
      a4.style.width = '100%';
      a4.style.minHeight = 'auto';
      a4.style.margin = '0';
      a4.style.boxShadow = 'none';
    }

    try {
      await this.esperarImagenes(container);

      const canvas = await html2canvas(container, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        windowWidth: 800,
        width: 800
      });

      const imgData = canvas.toDataURL('image/png');
      const doc = new JsPdf({
        orientation: 'p',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });
      doc.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);

      const dataUri = doc.output('datauristring');
      return dataUri.split(',')[1] ?? '';
    } finally {
      document.body.removeChild(container);
    }
  }

  private esperarImagenes(container: HTMLElement): Promise<void> {
    const imgs = Array.from(container.querySelectorAll('img'));
    if (imgs.length === 0) return Promise.resolve();
    return Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete && img.naturalWidth > 0) {
              resolve();
              return;
            }
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          })
      )
    ).then(() => undefined);
  }
}
