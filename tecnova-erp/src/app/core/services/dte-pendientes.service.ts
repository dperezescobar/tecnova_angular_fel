import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, forkJoin } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { CompRetencionService } from '../../features/comprobantes/services/comp-retencion.service';
import { FacturacionService } from '../../features/facturacion/services/facturacion';
import { FacturaGeneralDto } from '../models/facturacion.models';
import { AuthService } from './auth';

function toIsoDateStr(raw: any): string {
  if (!raw) return '';
  const str = String(raw).trim();
  if (!str) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 10);
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const d = new Date(str);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  return '';
}

export interface DtePendienteItem {
  id: string | number;
  correl?: number;
  comprobante: string;
  tipoDoc: 'RETENCION' | 'CCF' | 'FAC' | 'FEX' | 'NC' | 'ND';
  tipoDocNombre: string;
  fecha: string;
  nombreClienteProveedor: string;
  nitDui: string;
  montoTotal: number;
  estado: string;
  routeUrl: string;
  emitting?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DtePendientesService {
  private compRetencionService = inject(CompRetencionService);
  private facturacionService = inject(FacturacionService);
  private authService = inject(AuthService);

  readonly pendientes = signal<DtePendienteItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly esEmisorDte = computed(() => {
    const ambRaw = this.authService.currentUser()?.selectedEmpresa?.ambienteEmision;
    if (ambRaw === undefined || ambRaw === null) return true;
    return Number(ambRaw) !== 0;
  });
  readonly totalPendientes = computed(() => this.pendientes().length);
  readonly tienePendientes = computed(() => this.totalPendientes() > 0);

  cargarPendientes(): void {
    this.loading.set(true);
    const hoy = new Date();
    const hace90dias = new Date();
    hace90dias.setDate(hoy.getDate() - 90);

    const desde = hace90dias.toISOString().split('T')[0];
    const hasta = hoy.toISOString().split('T')[0];
    const isEmisor = this.esEmisorDte();

    // 1. Consultar Comprobantes de Retención (CR)
    const retenciones$ = this.compRetencionService.getListado(desde, hasta, '').pipe(
      map(list => {
        return (list ?? [])
          .filter(item => {
            const estado = String(item.ESTADO || '').trim().toUpperCase();
            const esAplicado = estado === 'A' || estado === 'APLICADO' || estado === 'APLICADA';
            const esAnulado = estado === 'I' || estado === 'ANULADO' || estado === 'CANCELADO';
            const sinSello = !item.SelloRecepcion && !item.CodigoGeneracion && !item.NoControl;

            if (isEmisor) {
              return esAplicado && sinSello;
            } else {
              return !esAplicado && !esAnulado;
            }
          })
          .map(item => ({
            id: item.ID,
            correl: item.ID,
            comprobante: `CR-${item.ID}`,
            tipoDoc: 'RETENCION' as const,
            tipoDocNombre: 'Comprobante de Retención (07)',
            fecha: item.FECHA ? item.FECHA.split('T')[0] : '',
            nombreClienteProveedor: item.NOMBRE || 'Proveedor',
            nitDui: item.PROVEEDOR || '',
            montoTotal: item.TOTAL_RETENCION ?? item.TOTAL ?? 0,
            estado: isEmisor ? 'Pendiente de emisión' : 'Pendiente de aplicar',
            routeUrl: `/comprobantes-retencion?correl=${item.ID}`
          }));
      }),
      catchError(() => of([] as DtePendienteItem[]))
    );

    // 2. Consultar Facturación General (FAC, CCF, FEX, NC)
    const facturas$ = this.facturacionService.getFacturasGeneral(desde, hasta).pipe(
      map(list => {
        return (list ?? [])
          .filter(item => {
            const estado = String(item.ESTADO || '').trim().toUpperCase();
            const esAplicado = estado === 'A' || estado === 'APLICADO' || estado === 'APLICADA';
            const esAnulado = estado === 'I' || estado === 'ANULADO' || estado === 'CANCELADO';
            const selloStr = String(item.SelloRecepcion ?? '').trim();
            const codGenStr = String(item.CodGeneracion ?? '').trim();
            const sinSello = !selloStr && !codGenStr;

            if (isEmisor) {
              return esAplicado && sinSello;
            } else {
              return !esAplicado && !esAnulado;
            }
          })
          .map(item => {
            const tipo = String(item.Tipo_Factura || 'FAC').trim().toUpperCase();
            const pref = String(item.Prefijo ?? '').trim();
            const fact = String(item.Factura || item.iddoc || '').trim();
            const fullNum = pref ? `${pref}${fact}` : fact;
            const fechaStr = toIsoDateStr(item.FECHA);

            let tipoNombre = 'Factura (01)';
            let route = `/facturacion/fac-ampliada?factura=${encodeURIComponent(fullNum)}&fecha=${fechaStr}`;
            if (tipo === 'CCF') {
              tipoNombre = 'Crédito Fiscal (03)';
              route = `/facturacion/ccf-ampliada?factura=${encodeURIComponent(fullNum)}&fecha=${fechaStr}`;
            } else if (tipo === 'FEX') {
              tipoNombre = 'Factura de Exportación (11)';
              route = `/facturacion/fex?factura=${encodeURIComponent(fullNum)}&fecha=${fechaStr}`;
            } else if (tipo === 'NC') {
              tipoNombre = 'Nota de Crédito (05)';
              route = `/facturacion/nc?factura=${encodeURIComponent(fullNum)}&fecha=${fechaStr}`;
            }

            const monto = typeof item.TOTAL === 'number' ? item.TOTAL : parseFloat(String(item.TOTAL || '0'));

            return {
              id: item.iddoc || item.Factura,
              correl: Number(item.Factura || 0),
              comprobante: fullNum,
              tipoDoc: tipo as any,
              tipoDocNombre: tipoNombre,
              fecha: fechaStr,
              nombreClienteProveedor: item.CLIENTE || item.FACTURAR_A || 'Cliente',
              nitDui: '',
              montoTotal: isNaN(monto) ? 0 : monto,
              estado: isEmisor ? 'Pendiente de emisión' : 'Pendiente de aplicar',
              routeUrl: route
            } as DtePendienteItem;
          });
      }),
      catchError(() => of([] as DtePendienteItem[]))
    );

    forkJoin([retenciones$, facturas$]).subscribe({
      next: ([retenciones, facturas]) => {
        this.pendientes.set([...retenciones, ...facturas]);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  removerPendiente(id: string | number): void {
    this.pendientes.update(items => items.filter(i => i.id !== id));
  }
}
