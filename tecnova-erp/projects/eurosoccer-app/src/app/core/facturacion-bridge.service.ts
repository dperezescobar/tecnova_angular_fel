import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, switchMap, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { EuroAuthService } from './euro-auth.service';

/**
 * Puente EuroSoccer -> Facturacion.FACTURA, vía los mismos endpoints de FacturaController que ya
 * usa PosVentaService (tecnova-erp) para el POS Híbrido. Cada cobro genera un recibo independiente
 * (EsRecibo=1, Sucursal SC0001 / PuntoVenta P002 / Artículo EUROSOCCER000001 / Bodega BODEURO) que
 * nunca emite DTE; queda "Aplicado, pendiente de emitir" hasta que un admin lo consolide en
 * Cierre de Recibos.
 *
 * Deliberadamente NO reutiliza PosVentaService.crearBorrador(): ese método resuelve sucursal/punto
 * de venta vía Configuracion.PuntoVenta (asignación por usuario), donde todo usuario existente
 * -incluido el operador de EuroSoccer- ya está asignado a P001/Oficina Central. Usarlo tal cual
 * mandaría los recibos de EuroSoccer al punto de venta equivocado. Este servicio fija SC0001/P002
 * a mano y llama los mismos endpoints de FacturaController directamente; el token se adjunta solo
 * vía euroJwtInterceptor (ya registrado en app.config.ts), igual que el resto de EuroSoccerService.
 */
@Injectable({ providedIn: 'root' })
export class FacturacionBridgeService {
  private http = inject(HttpClient);
  private auth = inject(EuroAuthService);
  private baseUrl = environment.apiUrl;

  private readonly sucursal = 'SC0001';
  private readonly puntoVenta = 'P002';
  private readonly tipoFactura = 'FAC';
  private readonly articulo = 'EUROSOCCER000001';
  private readonly bodega = 'BODEURO';

  private readonly codigosFormaPago: Record<string, string> = {
    Efectivo: '01',
    Tarjeta: '02',
    Transferencia: '05'
  };

  private get usuario(): string {
    return String(this.auth.currentUser()?.username ?? '').trim();
  }

  private get idEmpresa(): number {
    return this.auth.currentUser()?.idEmpresa ?? 22;
  }

  /** Crea un recibo (encabezado -> detalle -> forma de pago -> aplicar) por un cobro puntual. */
  crearRecibo(datos: { clienteNombre: string; descripcion: string; monto: number; formaPago: string; referenciaPago?: string }): Observable<{ idFactura: number }> {
    const codGeneracion = crypto.randomUUID().toUpperCase();
    const usuario = this.usuario;

    const header = {
      CodGeneracion: codGeneracion,
      Sucursal: this.sucursal, PuntoVenta: this.puntoVenta,
      TipoVenta: 'G',
      // Facturacion.FACTURA.CLIENTE tiene FK a Facturacion.CLIENTE (no acepta '' ni NULL libre):
      // CE00001 es el cliente genérico "Sr(a)" ya usado en este tenant para recibos sin cliente
      // registrado (mismo código que usan los recibos de ANTOJ/CARWASH). El nombre real del
      // jugador va en FACTURAR_A, que sí es texto libre.
      Cliente: 'CE00001', FacturarA: (datos.clienteNombre || 'Sr(a)').trim() || 'Sr(a)',
      Fecha: this.fechaHoy(),
      // Configuracion.VENDEDOR solo tiene 'OFICINA' dado de alta en este tenant (FK_FACTURA_VENDEDOR).
      CondicionPago: 'VCP000', Vendedor: 'OFICINA', Observaciones: datos.referenciaPago || '',
      Usuario: usuario, TipoMtto: 'A', Contabilizar: 0,
      SubTotal: 0, IVA: 0, Impuesto2: 0, Impuesto3: 0, Retencion: 0,
      NIT: '', RegistroComercio: '',
      NumeroResolucion: '', ExistenciaFecDoc: 0, NumeroControl: '', SelloRecepcion: '',
      JSON: '', IdCondicionTraslado: '', NombreEntrega: '', IdentificacionEntrega: '',
      NombreRecibe: '', IdentificacionRecibe: '', TipoDestinoRemision: '', Proveedor: '',
      IdModoTransporte: 0, NombreConductor: '', NumeroConductor: '', PlacaTransporte: '',
      IdRecintoFiscal: 0, IdIncoterm: 0, IdRegimenExportacion: 0,
      PrecioConIVA: 1,
      Flete: 0, Seguro: 0, DescuentoAdicional: 0, DTE: 0,
      // Facturacion.Update_Factura exige un correo válido (Configuracion.ValidarCorreo rechaza
      // vacío/NULL siempre, sin excepción para clientes anónimos) — EuroSoccer no captura correo
      // del jugador, así que se usa uno institucional fijo para los recibos.
      CorreoCliente: 'recibos@eurosoccer.tecnovasv.com',
      TipoFactura: this.tipoFactura,
      TipoRegimen: '',
      EsRecibo: true
    };

    return this.http.post<any>(`${this.baseUrl}/Factura/UpdateFactura`, header).pipe(
      switchMap((resp) => {
        const idFactura = this.extractIdFactura(resp);
        if (!idFactura) throw new Error('No se pudo crear el recibo: la API no devolvió IdFactura.');

        const detalle = {
          CodGeneracion: codGeneracion,
          Sucursal: this.sucursal, PuntoVenta: this.puntoVenta, TipoFactura: this.tipoFactura,
          Cantidad: 1, Articulo: this.articulo, Descripcion: datos.descripcion,
          PrecioUnitario: this.round2(datos.monto), CostoUnitario: 0, Calidad: '',
          Bodega: this.bodega, UnidadMedida: 'UND',
          Usuario: usuario, TipoMtto: 'A', Linea: 0,
          SubTotal: this.round2(datos.monto), IVA: 0, Impuesto2: 0, Impuesto3: 0, Retencion: 0,
          TipoColor: 'NA', CantidadConversion: 1, UnidadMedidaConversion: 'UND',
          IdColor: 0, IdAcabado: ''
        };

        const pago = {
          IdFactura: idFactura,
          Codigo: this.codigosFormaPago[datos.formaPago] || '01',
          Monto: this.round2(datos.monto),
          TipoMtto: 'A'
        };

        const aplicar = {
          CodGeneracion: codGeneracion,
          Sucursal: this.sucursal, PuntoVenta: this.puntoVenta, TipoFactura: this.tipoFactura,
          Usuario: usuario, IdEmpresa: this.idEmpresa, TipoMtto: 'Aplicar'
        };

        return this.http.post(`${this.baseUrl}/Factura/UpdateDetalleFactura`, detalle).pipe(
          switchMap(() => this.http.post(`${this.baseUrl}/Factura/UpdateFacturaFormaPago`, pago)),
          switchMap(() => this.http.post(`${this.baseUrl}/Factura/UpdateFacturacionAplicacion`, aplicar)),
          map(() => ({ idFactura }))
        );
      })
    );
  }

  private extractIdFactura(resp: unknown): number {
    const raw = (resp ?? {}) as Record<string, unknown>;
    const v = raw['idFactura'] ?? raw['IdFactura'] ?? raw['IDFACTURA'];
    const n = typeof v === 'number' ? v : parseInt(String(v ?? '0'), 10);
    return Number.isFinite(n) ? n : 0;
  }

  private round2(v: number): number {
    return Math.round(((Number(v) || 0) + Number.EPSILON) * 100) / 100;
  }

  private fechaHoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
