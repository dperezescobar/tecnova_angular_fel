import { ChangeDetectionStrategy, Component, HostListener, OnDestroy, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { catchError, concatMap, finalize, map, switchMap, tap } from 'rxjs/operators';
import { FacturacionService } from '../services/facturacion';
import { ArticulosService } from '../../articulos/services/articulos';
import { ArticuloPorBodegaDto, FacturaDetalleDto, FacturaGeneralDto, FormaPagoDto, PerfilClienteDto } from '../../../core/models/facturacion.models';
import { AuthService } from '../../../core/services/auth';
import { HttpClient } from '@angular/common/http';
import { PosSignalRService } from '../../../core/services/pos-signalr.service';
import { environment } from '../../../../environments/environment';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PosVentaService, PosVentaResultado, VentaKeys, PosLineaVenta, PosPago } from './pos-venta.service';
import { PosTicketService } from './pos-ticket.service';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

interface CartItem {
  articulo: string;
  descripcion: string;
  unidad: string;
  tipoArticulo: string;
  precio: number;
  precioOriginal?: number;
  tienePromocion?: boolean;
  cantidad: number;
  linea: number; // LINEA en el servidor (0 si aún no persistida)
  enAprobacion?: boolean;
  solicitudId?: number;
}

const GRUPO_SIN = '(Sin rubro)';
const PAGE_SIZE = 48;
const COD_EFECTIVO = '01'; // "Billetes y monedas"
// TODO: cuando exista el concepto de caja por terminal/punto de venta, resolver este id dinámicamente.
// Debe coincidir con el cajaID que se envía en solicitar-ajuste y con el grupo SuscribirCaja del hub.
const CAJA_ID = 1;
// Tipos que mueven inventario (bloquean al aplicar si no hay existencia). SV = servicio, no bloquea.
const TIPOS_INVENTARIO = ['TM', 'MP'];
const UNIDADES_FRACCIONADAS = ['LB', 'LBS', 'LIBRA', 'LIBRAS', 'KG', 'KGS', 'KILO', 'KILOS', 'KILOGRAMO', 'OZ', 'ONZA', 'ONZAS', 'GR', 'GRAMO', 'GRAMOS', 'M', 'MT', 'MTS', 'METRO', 'METROS', 'LT', 'LTS', 'LITRO', 'LITROS', 'QQ', 'QUINTAL', 'AR', 'ARROBA'];

interface PagoLinea {
  codigo: string;
  descripcion: string;
  monto: number;      // aplicado a la venta
  recibido: number;   // efectivo entregado (solo efectivo); para calcular vuelto
  esEfectivo: boolean;
}

@Component({
  selector: 'app-pos-hibrido',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, DialogModule, ButtonModule, InputTextModule, ToastModule],
  providers: [MessageService],
  templateUrl: './pos-hibrido.html',
  styleUrls: ['./pos-hibrido.scss']
})
export class PosHibridoComponent implements OnDestroy {
  private facturacionService = inject(FacturacionService);
  private articulosService = inject(ArticulosService);
  private auth = inject(AuthService);
  private posVenta = inject(PosVentaService);
  private posTicket = inject(PosTicketService);
  private http = inject(HttpClient);
  private messageService = inject(MessageService);
  public signalRService = inject(PosSignalRService);

  // Modal Ajuste de Precio en Vivo
  ajusteModalAbierto = signal(false);
  ajusteItemSel = signal<CartItem | null>(null);
  precioSolicitadoInput = signal<number>(0);
  motivoAjusteInput = signal<string>('');
  enviandoSolicitud = signal(false);

  // Modal Ingreso de Cantidad / Peso Fraccionado o Precio Cero
  modalCantidadVisible = signal(false);
  articuloCantSel = signal<ArticuloPorBodegaDto | null>(null);
  inputCantidadModal = signal<number>(1);
  inputPrecioModal = signal<number>(0);

  // Promociones Activas
  promociones = signal<Record<string, { tipo: string; valor: number }>>({});

  private readonly bodega = 'BOD01'; // TODO: de la sucursal/punto de venta

  loading = signal(false);
  procesando = signal(false);        // cobro/cancelación en curso
  guardando = signal(false);         // op de línea/cliente en curso
  mensaje = signal<{ tipo: 'error' | 'ok'; texto: string } | null>(null);

  confirmCancelar = signal(false);   // Fase B: diálogo "¿Cancelar venta?"

  // Fase C: historial del turno (facturas del día).
  historialAbierto = signal(false);
  historialCargando = signal(false);
  historial = signal<FacturaGeneralDto[]>([]);
  reimprimiendo = signal<string>('');  // clave del documento en reimpresión

  // Existencias en línea (por artículo, bodega del POS). Sin polling: se consulta al agregar y con "Verificar".
  private existencias = signal<Record<string, number>>({});
  verificandoExistencias = signal(false);
  articuloConError = signal('');       // artículo señalado por el error de aplicación (existencia)

  // Panel de cobro.
  cobroAbierto = signal(false);
  private formasPago = signal<FormaPagoDto[]>([]);
  pagos = signal<PagoLinea[]>([]);
  private pagosPrevios: PagoLinea[] | null = null; // preserva el desglose para reintentos tras faltante

  // Teclado numérico en pantalla.
  tecladoVisible = signal(true);
  masFormasAbierto = signal(false);
  campoActivo = signal<{ index: number; campo: 'recibido' | 'monto' } | null>(null);
  private buffer = signal<string>('');
  private overwrite = false; // el próximo dígito reemplaza el valor (evita borrar a mano)

  private articulos = signal<ArticuloPorBodegaDto[]>([]);
  filtro = signal('');
  grupoActivo = signal<string>('');
  cart = signal<CartItem[]>([]);

  // Borrador persistido en el servidor (null hasta el primer artículo).
  private ventaKeys = signal<VentaKeys | null>(null);

  // Cola de operaciones: serializa crear/agregar/actualizar/eliminar/reprice (evita carreras).
  private cola$ = new Subject<() => Observable<unknown>>();

  // Cliente de la venta. null = Consumidor Final (Sr(a)).
  private clientes = signal<PerfilClienteDto[]>([]);
  clienteSel = signal<PerfilClienteDto | null>(null);
  clienteBusqueda = signal('');
  clientePickerAbierto = signal(false);

  clienteLabel = computed(() => (this.clienteSel()?.NOMBRE || '').trim() || 'Consumidor Final');
  // Cliente "Sr(a)" del catálogo (trae correo, condición de pago, etc.) para el Consumidor Final por defecto.
  private clienteConsumidorFinal = computed<PerfilClienteDto | null>(() =>
    this.clientes().find((c) => (c.NOMBRE ?? '').trim().toLowerCase() === 'sr(a)') ?? null
  );
  // Cliente efectivo de la venta: el seleccionado, o el "Sr(a)" por defecto (para no enviar correo vacío).
  private clienteEfectivo(): PerfilClienteDto | null { return this.clienteSel() ?? this.clienteConsumidorFinal(); }
  clientesFiltrados = computed<PerfilClienteDto[]>(() => {
    const q = this.clienteBusqueda().trim().toLowerCase();
    const base = this.clientes();
    const lista = !q ? base : base.filter((c) =>
      (c.NOMBRE ?? '').toLowerCase().includes(q) ||
      (c.CLIENTE ?? '').toLowerCase().includes(q) ||
      (c.NIT ?? '').toLowerCase().includes(q));
    return lista.slice(0, 50);
  });

  // Render incremental + imágenes lazy.
  private visibleCount = signal(PAGE_SIZE);
  imagenes = signal<Record<string, string>>({});
  private requestedImg = new Set<string>();
  private objectUrls: string[] = [];

  grupos = computed<string[]>(() => {
    const set = new Set<string>();
    for (const a of this.articulos()) set.add((a.GRUPO_DESC ?? '').trim() || GRUPO_SIN);
    return Array.from(set).sort((x, y) => x.localeCompare(y));
  });
  private filtrados = computed<ArticuloPorBodegaDto[]>(() => {
    const grupo = this.grupoActivo();
    const q = this.filtro().trim().toLowerCase();
    return this.articulos().filter((a) => {
      const g = (a.GRUPO_DESC ?? '').trim() || GRUPO_SIN;
      if (grupo && g !== grupo) return false;
      if (!q) return true;
      return (a.DESCRIPCION ?? '').toLowerCase().includes(q) || (a.ARTICULO ?? '').toLowerCase().includes(q);
    });
  });
  totalFiltrados = computed(() => this.filtrados().length);
  visibles = computed<ArticuloPorBodegaDto[]>(() => this.filtrados().slice(0, this.visibleCount()));
  hayMas = computed(() => this.visibleCount() < this.filtrados().length);

  totalUnidades = computed(() => this.cart().reduce((acc, i) => acc + i.cantidad, 0));
  totalFactura = computed(() => this.cart().reduce((acc, i) => acc + this.subtotalLinea(i), 0));

  // Líneas con existencia insuficiente (solo tipos que mueven inventario).
  hayFaltantes = computed(() => this.cart().some((i) => this.lineaInsuficiente(i)));

  // Cobro.
  formasComunes = computed(() => this.formasPago().filter((f) => this.esFormaComun(f)));
  formasMas = computed(() => this.formasPago().filter((f) => !this.esFormaComun(f)));
  totalPagado = computed(() => this.pagos().reduce((acc, p) => acc + (Number(p.monto) || 0), 0));
  pendienteCobro = computed(() => this.redondear(this.totalFactura() - this.totalPagado()));
  vuelto = computed(() =>
    this.redondear(this.pagos().reduce((acc, p) => acc + (p.esEfectivo ? Math.max(0, (Number(p.recibido) || 0) - (Number(p.monto) || 0)) : 0), 0))
  );
  cobroValido = computed(() => this.cart().length > 0 && Math.abs(this.pendienteCobro()) <= 0.009 && this.totalFactura() > 0);

  preciosAprobados = signal<Record<string, number>>({});

  constructor() {
    this.cargar();
    this.cargarClientes();
    this.signalRService.iniciarConexion(CAJA_ID, false);

    this.posVenta.getFormasPago().subscribe({
      next: (rows) => this.formasPago.set(rows ?? []),
      error: () => this.formasPago.set([])
    });
    effect(() => { for (const a of this.visibles()) this.cargarImagen(a); });

    effect(() => {
      const res = this.signalRService.respuestaAjusteSignal();
      if (!res) return;

      // La respuesta solo aplica si la solicitud pertenece a una línea de ESTE carrito.
      // (Evita que una aprobación de otra caja del mismo grupo altere precios aquí.)
      const target = this.cart().find((i) => i.solicitudId === res.solicitudID);
      if (!target) return;

      const artCode = String(target.articulo ?? '').trim().toUpperCase();
      if (res.aprobado) {
        this.preciosAprobados.update((m) => ({ ...m, [artCode]: res.precioFinal }));
      }

      let itemAprobado: CartItem | null = null;
      this.cart.update((items) =>
        items.map((item) => {
          if (item.solicitudId !== res.solicitudID) return item;
          if (res.aprobado) {
            itemAprobado = { ...item, precio: res.precioFinal, enAprobacion: false, solicitudId: undefined };
            return itemAprobado;
          }
          return { ...item, enAprobacion: false, solicitudId: undefined };
        })
      );

      if (res.aprobado && itemAprobado) {
        const item: CartItem = itemAprobado;
        const keys = this.ventaKeys();
        if (keys) {
          const l: PosLineaVenta = {
            articulo: item.articulo,
            descripcion: item.descripcion,
            unidad: item.unidad,
            precio: item.precio,
            cantidad: item.cantidad,
            linea: item.linea
          };
          this.encolar(() => this.posVenta.actualizarCantidad(keys, l).pipe(switchMap(() => this.sync$(keys))));
        }
      }

      this.messageService.add(res.aprobado
        ? { severity: 'success', summary: 'Ajuste Aprobado', detail: `Ajuste APROBADO por ${res.usuarioAprobo}: $${res.precioFinal.toFixed(2)}`, life: 6000 }
        : { severity: 'warn', summary: 'Ajuste Rechazado', detail: `Ajuste RECHAZADO por ${res.usuarioAprobo}`, life: 6000 });
    });

    // Procesador de la cola (serializado). Cada op es tolerante a fallos (no rompe la cola).
    this.cola$
      .pipe(concatMap((fn) => fn().pipe(catchError((err) => { this.onOpError(err); return of(null); }))))
      .subscribe();
  }

  ngOnDestroy(): void {
    this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
    this.cola$.complete();
    this.signalRService.detenerConexion();
  }

  // ── Autorizaciones de Precio en Vivo ─────────────────────────
  solicitarAjuste(item: CartItem): void {
    this.ajusteItemSel.set(item);
    this.precioSolicitadoInput.set(item.precio);
    this.motivoAjusteInput.set('Discrepancia en etiqueta física');
    this.ajusteModalAbierto.set(true);
  }

  cerrarAjusteModal(): void {
    this.ajusteModalAbierto.set(false);
    this.ajusteItemSel.set(null);
  }

  enviarSolicitudAjuste(): void {
    const item = this.ajusteItemSel();
    if (!item || this.enviandoSolicitud()) return;

    this.enviandoSolicitud.set(true);
    const keys = this.ventaKeys();
    const body = {
      cajaID: CAJA_ID,
      usuarioCajero: this.auth.currentUser()?.username || 'CAJERO',
      articuloID: item.articulo,
      articuloDescripcion: item.descripcion,
      precioSistema: item.precio,
      precioSolicitado: Number(this.precioSolicitadoInput()) || item.precio,
      motivo: this.motivoAjusteInput().trim() || 'Ajuste de precio en caja',
      idFactura: keys?.idFactura ?? 0,
      prefijo: keys?.prefijo ?? '',
      factura: keys?.factura ?? '',
      sucursal: keys?.sucursal ?? '',
      puntoVenta: keys?.puntoVenta ?? '',
      tipoFactura: 'FAC'
    };

    this.http.post<{ solicitudID: number }>(`${environment.apiUrl}/promociones/solicitar-ajuste`, body)
      .pipe(finalize(() => this.enviandoSolicitud.set(false)))
      .subscribe({
        next: (res) => {
          this.cart.update((items) =>
            items.map((i) => i.articulo === item.articulo ? { ...i, enAprobacion: true, solicitudId: res.solicitudID } : i)
          );
          this.messageService.add({
            severity: 'success',
            summary: 'Solicitud Enviada',
            detail: 'Solicitud enviada al manager vía SignalR. Esperando respuesta...',
            life: 5000
          });
          this.cerrarAjusteModal();
        },
        error: (err) => {
          const msg = this.sanearMensaje(err);
          this.messageService.add({
            severity: 'error',
            summary: 'Error de Ajuste de Precio',
            detail: msg,
            life: 7000
          });
        }
      });
  }

  // ── Catálogo & Promociones ───────────────────────────────────────────────
  cargar(): void {
    this.loading.set(true);
    this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
    this.objectUrls = [];
    this.requestedImg.clear();
    this.imagenes.set({});

    // Cargar promociones activas
    this.http.get<any[]>(`${environment.apiUrl}/GestionPrecios/promociones`).subscribe({
      next: (rows) => {
        const map: Record<string, { tipo: string; valor: number }> = {};
        (rows || []).forEach((p) => {
          if (p.activo && (p.estado === 'Activa' || p.estado === 'Activo') && p.articulo) {
            map[p.articulo.trim().toUpperCase()] = {
              tipo: p.tipoDescuento || 'P',
              valor: Number(p.valorDescuento) || 0
            };
          }
        });
        this.promociones.set(map);
      },
      error: () => this.promociones.set({})
    });

    this.facturacionService.getArticulosPorBodega(this.bodega)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (rows) => {
          this.articulos.set(rows ?? []);
          const grupos = this.grupos();
          if (grupos.length && !this.grupoActivo()) this.grupoActivo.set(grupos[0]);
        },
        error: () => this.articulos.set([])
      });
  }

  getPromo(articulo: string) {
    const key = (articulo || '').trim().toUpperCase();
    return this.promociones()[key] || null;
  }

  getPrecioFinal(articulo: string, precioBase: number | string): number {
    const base = this.toNumber(precioBase);
    const promo = this.getPromo(articulo);
    if (!promo || promo.valor <= 0) return base;
    if (promo.tipo === 'P') {
      return Math.max(0, this.redondear(base * (1 - promo.valor / 100)));
    }
    return Math.max(0, this.redondear(base - promo.valor));
  }

  getPromoBadgeText(articulo: string): string | null {
    const promo = this.getPromo(articulo);
    if (!promo || promo.valor <= 0) return null;
    return promo.tipo === 'P' ? `${promo.valor}% OFF` : `-$${promo.valor.toFixed(2)}`;
  }

  getPrecioBase(articulo: string, itemPrecio: number): number {
    const art = this.articulos().find((a) => (a.ARTICULO ?? '').trim().toUpperCase() === (articulo ?? '').trim().toUpperCase());
    if (art && art.ULTIMO_PRECIO != null) {
      return this.toNumber(art.ULTIMO_PRECIO);
    }
    return itemPrecio;
  }

  seleccionarGrupo(grupo: string): void { this.grupoActivo.set(grupo); this.visibleCount.set(PAGE_SIZE); }
  onFiltro(valor: string): void { this.filtro.set(valor); this.visibleCount.set(PAGE_SIZE); }
  onGridScroll(el: HTMLElement): void {
    if (!this.hayMas()) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) this.visibleCount.update((n) => n + PAGE_SIZE);
  }
  imagenUrl(codigo: string): string | null { return this.imagenes()[codigo] ?? null; }
  private cargarImagen(a: ArticuloPorBodegaDto): void {
    const codigo = (a.ARTICULO ?? '').trim();
    if (!codigo || !a.TIENE_IMAGEN || this.requestedImg.has(codigo)) return;
    this.requestedImg.add(codigo);
    this.articulosService.getArticuloImagen(codigo).subscribe({
      next: (blob) => {
        if (!blob || blob.size === 0) return;
        const url = URL.createObjectURL(blob);
        this.objectUrls.push(url);
        this.imagenes.update((cur) => ({ ...cur, [codigo]: url }));
      },
      error: () => { /* sin imagen */ }
    });
  }

  // ── Cliente ───────────────────────────────────────────────────────────────
  private cargarClientes(): void {
    this.facturacionService.getPerfilClientes().subscribe({
      next: (rows) => this.clientes.set(rows ?? []),
      error: () => this.clientes.set([])
    });
  }
  abrirClientePicker(): void { this.clienteBusqueda.set(''); this.clientePickerAbierto.set(true); }
  cerrarClientePicker(): void { this.clientePickerAbierto.set(false); }

  // Cambiar cliente => si ya hay borrador, guardar encabezado y recargar detalle:
  // el motor reprice (mayoreo/preferencial) y el carrito muestra los precios actualizados.
  seleccionarCliente(c: PerfilClienteDto | null): void {
    this.clienteSel.set(c);
    this.clientePickerAbierto.set(false);
    const keys = this.ventaKeys();
    if (keys && this.cart().length) {
      const efectivo = this.clienteEfectivo();
      this.encolar(() => this.posVenta.guardarEncabezado(keys, efectivo).pipe(switchMap(() => this.sync$(keys))));
    }
  }

  // ── Venta Fraccionada / Peso o Precio Cero ─────────────────────────────────
  esUnidadFraccionada(unidad?: string): boolean {
    const u = (unidad ?? '').trim().toUpperCase();
    return UNIDADES_FRACCIONADAS.includes(u);
  }

  esPrecioCero(precio?: unknown): boolean {
    return this.toNumber(precio) <= 0;
  }

  abrirModalCantidad(a: ArticuloPorBodegaDto): void {
    this.articuloCantSel.set(a);
    const p = this.toNumber(a.ULTIMO_PRECIO);
    this.inputPrecioModal.set(p > 0 ? p : 0);
    this.inputCantidadModal.set(1);
    this.modalCantidadVisible.set(true);
  }

  cerrarModalCantidad(): void {
    this.modalCantidadVisible.set(false);
    this.articuloCantSel.set(null);
  }

  setCantPreset(val: number): void {
    this.inputCantidadModal.set(val);
  }

  confirmarAgregarConCantidad(): void {
    const a = this.articuloCantSel();
    const cant = this.inputCantidadModal();
    const precioCustom = this.inputPrecioModal();
    this.cerrarModalCantidad();
    if (a && cant > 0) {
      this.ejecutarAgregar(a, cant, precioCustom > 0 ? precioCustom : undefined);
    }
  }

  // ── Carrito (persist-as-you-go) ─────────────────────────────────────────────
  agregar(a: ArticuloPorBodegaDto): void {
    const precioBase = this.toNumber(a.ULTIMO_PRECIO);
    if (this.esUnidadFraccionada(a.UNIDAD_MEDIDA) || precioBase <= 0) {
      this.abrirModalCantidad(a);
      return;
    }
    this.ejecutarAgregar(a, 1);
  }

  ejecutarAgregar(a: ArticuloPorBodegaDto, cantidad: number, precioCustom?: number): void {
    const codigo = (a.ARTICULO ?? '').trim();
    if (!codigo) return;
    this.loadExistencia(codigo);
    // Precio NETO que se PERSISTE: precio manual si se ingresó; si no, el precio de catálogo con la
    // promoción ya aplicada. Así el total del servidor (factura/DTE/pagos) coincide con lo que ve el
    // cajero — la promo deja de ser solo un cálculo de pantalla.
    const precioNeto = precioCustom != null && precioCustom > 0
      ? precioCustom
      : this.getPrecioFinal(codigo, this.toNumber(a.ULTIMO_PRECIO));

    this.encolar(() =>
      this.ensureBorrador$().pipe(
        switchMap((keys) => {
          const existente = this.cart().find((i) => i.articulo === codigo);
          if (existente) {
            const cantNueva = this.redondear(existente.cantidad + cantidad);
            const precioLinea = precioCustom != null && precioCustom > 0 ? precioCustom : existente.precio;
            const l: PosLineaVenta = { articulo: codigo, descripcion: existente.descripcion, unidad: existente.unidad, precio: precioLinea, cantidad: cantNueva, linea: existente.linea };
            return this.posVenta.actualizarCantidad(keys, l).pipe(switchMap(() => this.sync$(keys)));
          }
          const nueva: PosLineaVenta = { articulo: codigo, descripcion: (a.DESCRIPCION ?? '').trim(), unidad: (a.UNIDAD_MEDIDA ?? '').trim(), precio: precioNeto, cantidad: cantidad };
          return this.posVenta.agregarLinea(keys, nueva).pipe(switchMap(() => this.sync$(keys)));
        })
      )
    );
  }

  cambiarCantidad(item: CartItem, valor: number | string): void {
    const cantidad = this.toNumber(valor);
    const keys = this.ventaKeys();
    if (!keys) return;
    const l: PosLineaVenta = { articulo: item.articulo, descripcion: item.descripcion, unidad: item.unidad, precio: item.precio, cantidad, linea: item.linea };
    this.encolar(() =>
      (cantidad > 0 ? this.posVenta.actualizarCantidad(keys, l) : this.posVenta.eliminarLinea(keys, l))
        .pipe(switchMap(() => this.sync$(keys)))
    );
  }

  quitar(item: CartItem): void {
    const keys = this.ventaKeys();
    if (!keys) return;
    const l: PosLineaVenta = { articulo: item.articulo, descripcion: item.descripcion, unidad: item.unidad, precio: item.precio, cantidad: item.cantidad, linea: item.linea };
    this.encolar(() => this.posVenta.eliminarLinea(keys, l).pipe(switchMap(() => this.sync$(keys))));
  }

  // Fase B: el botón Vaciar pide confirmación antes de eliminar el borrador.
  solicitarCancelar(): void {
    if (!this.cart().length || this.procesando()) return;
    this.confirmCancelar.set(true);
  }
  cerrarConfirmCancelar(): void { this.confirmCancelar.set(false); }

  // Cancelar/Vaciar: elimina el BORRADOR (guarda de seguridad en el servicio: no borra emitidos).
  vaciar(): void {
    this.confirmCancelar.set(false);
    const keys = this.ventaKeys();
    if (!keys) { this.cart.set([]); return; }
    if (this.procesando()) return;
    this.procesando.set(true);
    this.mensaje.set(null);
    this.posVenta.eliminarBorrador(keys)
      .pipe(finalize(() => this.procesando.set(false)))
      .subscribe({
        next: () => { this.facturacionService.clearFacturasGeneralCache(); this.resetVenta(); this.mensaje.set({ tipo: 'ok', texto: 'Venta cancelada.' }); },
        error: (err) => this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) })
      });
  }

  // ── Existencias ─────────────────────────────────────────────────────────────
  private loadExistencia(articulo: string): void {
    const cod = (articulo ?? '').trim();
    if (!cod) return;
    this.posVenta.getExistencia(cod).subscribe({
      next: (ex) => this.existencias.update((cur) => ({ ...cur, [cod]: ex })),
      error: () => { /* sin conexión: no marca (el SP sigue siendo el guardia al aplicar) */ }
    });
  }

  existenciaDe(articulo: string): number | null {
    const cod = (articulo ?? '').trim();
    return cod in this.existencias() ? this.existencias()[cod] : null;
  }

  // Insuficiente solo si el tipo mueve inventario y la existencia conocida no cubre la cantidad.
  lineaInsuficiente(item: CartItem): boolean {
    if (!TIPOS_INVENTARIO.includes((item.tipoArticulo || '').toUpperCase())) return false;
    const ex = this.existenciaDe(item.articulo);
    return ex !== null && ex < item.cantidad;
  }

  tileSinExistencia(a: ArticuloPorBodegaDto): boolean {
    if (!TIPOS_INVENTARIO.includes((a.TIPO_ARTICULO || '').toUpperCase())) return false;
    const ex = this.existenciaDe((a.ARTICULO ?? '').trim());
    return ex !== null && ex <= 0;
  }

  // Re-consulta en línea la existencia de todas las líneas del carrito (el stock pudo alimentarse).
  verificarExistencias(): void {
    const arts = Array.from(new Set(this.cart().map((i) => i.articulo).filter(Boolean)));
    if (!arts.length || this.verificandoExistencias()) return;
    this.verificandoExistencias.set(true);
    this.mensaje.set(null);
    forkJoin(arts.map((a) => this.posVenta.getExistencia(a)))
      .pipe(finalize(() => this.verificandoExistencias.set(false)))
      .subscribe({
        next: (vals) => {
          const mapa = { ...this.existencias() };
          arts.forEach((a, i) => (mapa[a] = vals[i]));
          this.existencias.set(mapa);
          this.articuloConError.set('');
          const faltan = this.hayFaltantes();
          this.mensaje.set(faltan
            ? { tipo: 'error', texto: 'Aún hay artículos sin existencia suficiente. Solicite ayuda y reintente.' }
            : { tipo: 'ok', texto: 'Existencias verificadas. Ya puede cobrar.' });
        },
        error: (err) => this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) })
      });
  }

  // ── Cobro ───────────────────────────────────────────────────────────────────
  cobrar(): void { this.abrirCobro(); }

  abrirCobro(): void {
    if (!this.ventaKeys() || !this.cart().length || this.procesando()) return;
    // A2: no cobrar con operaciones de línea aún pendientes en la cola (evita carrera detalle/aplicación).
    if (this.guardando()) { this.mensaje.set({ tipo: 'error', texto: 'Espere un momento: hay cambios de la venta guardándose.' }); return; }
    const total = this.totalFactura();
    // Reintento: conserva el desglose previo; primera vez: efectivo por el total.
    const previos = this.pagosPrevios;
    this.pagos.set(previos?.length
      ? previos.map((p) => ({ ...p }))
      : [{ codigo: COD_EFECTIVO, descripcion: this.descFormaPago(COD_EFECTIVO), monto: total, recibido: total, esEfectivo: true }]);
    this.masFormasAbierto.set(false);
    this.mensaje.set(null);
    this.cobroAbierto.set(true);
    this.seleccionarCampo(0, 'recibido'); // listo para teclear el "Recibido" de la 1ª línea
  }
  cerrarCobro(): void { this.cobroAbierto.set(false); this.campoActivo.set(null); }

  toggleTeclado(): void { this.tecladoVisible.update((v) => !v); }

  private descFormaPago(codigo: string): string {
    return (this.formasPago().find((f) => String(f.Codigo ?? '').trim() === codigo)?.Descripcion ?? '').trim() ||
      (codigo === COD_EFECTIVO ? 'Billetes y monedas' : codigo);
  }

  agregarPago(f: FormaPagoDto): void {
    const codigo = String(f.Codigo ?? '').trim();
    if (!codigo) return;
    const restante = Math.max(0, this.pendienteCobro());
    const esEfectivo = codigo === COD_EFECTIVO;
    this.pagos.update((cur) => [...cur, { codigo, descripcion: (f.Descripcion ?? '').trim() || codigo, monto: restante, recibido: restante, esEfectivo }]);
    this.masFormasAbierto.set(false);
    this.seleccionarCampo(this.pagos().length - 1, 'recibido');
  }
  quitarPago(i: number): void {
    this.pagos.update((cur) => cur.filter((_, idx) => idx !== i));
    const a = this.campoActivo();
    if (!a) return;
    if (a.index === i) this.campoActivo.set(null);
    else if (a.index > i) this.campoActivo.set({ index: a.index - 1, campo: a.campo });
  }

  // Saldo disponible para ESTA línea (total menos lo aplicado por las demás) = tope de "Aplicado".
  private restanteExcluyendo(i: number): number {
    const otros = this.pagos().reduce((acc, p, idx) => acc + (idx === i ? 0 : (Number(p.monto) || 0)), 0);
    return this.redondear(Math.max(0, this.totalFactura() - otros));
  }

  /**
   * "Recibido" = lo que entrega el cliente. Por defecto se duplica en "Aplicado" (topado al saldo
   * restante). El excedente sobre lo aplicado queda como vuelto.
   */
  setPagoRecibido(i: number, v: number | string): void {
    const recibido = this.redondear(this.toNumber(v));
    const aplicado = this.redondear(Math.min(recibido, this.restanteExcluyendo(i)));
    this.pagos.update((cur) => cur.map((p, idx) => (idx === i ? { ...p, recibido, monto: aplicado } : p)));
  }

  /**
   * "Aplicado" editable (pago parcializado: recibe más de lo que aplica y paga el resto con otra
   * forma). Se topa al saldo restante — nunca se aplica más que el total. No reduce el recibido.
   */
  setPagoAplicado(i: number, v: number | string): void {
    const aplicado = this.redondear(Math.min(this.redondear(this.toNumber(v)), this.restanteExcluyendo(i)));
    this.pagos.update((cur) => cur.map((p, idx) => {
      if (idx !== i) return p;
      // No-efectivo: recibido acompaña al aplicado (sin vuelto). Efectivo: recibido no baja.
      const recibido = p.esEfectivo ? Math.max(Number(p.recibido) || 0, aplicado) : aplicado;
      return { ...p, monto: aplicado, recibido: this.redondear(recibido) };
    }));
  }

  // Atajo: una sola línea de efectivo por el total exacto.
  efectivoExacto(): void {
    const total = this.totalFactura();
    this.pagos.set([{ codigo: COD_EFECTIVO, descripcion: this.descFormaPago(COD_EFECTIVO), monto: total, recibido: total, esEfectivo: true }]);
    this.seleccionarCampo(0, 'recibido');
  }

  // ── Teclado numérico ─────────────────────────────────────────────────────────
  private esFormaComun(f: FormaPagoDto): boolean {
    const c = String(f.Codigo ?? '').trim();
    const d = String(f.Descripcion ?? '').toUpperCase();
    return c === COD_EFECTIVO || d.includes('EFECTIVO') || d.includes('BILLETES') || d.includes('TARJETA');
  }

  esCampoActivo(i: number, campo: 'recibido' | 'monto'): boolean {
    const a = this.campoActivo();
    return !!a && a.index === i && a.campo === campo;
  }

  seleccionarCampo(i: number, campo: 'recibido' | 'monto'): void {
    const p = this.pagos()[i];
    if (!p) return;
    this.campoActivo.set({ index: i, campo });
    this.buffer.set(this.numeroABuffer(campo === 'recibido' ? p.recibido : p.monto));
    this.overwrite = true; // el primer dígito reemplaza
  }

  // Valor en vivo (buffer) si el campo está activo; si no, el número formateado.
  textoCampo(i: number, campo: 'recibido' | 'monto'): string {
    const p = this.pagos()[i];
    if (!p) return '0';
    if (this.esCampoActivo(i, campo)) return this.buffer() === '' ? '0' : this.buffer();
    return this.numeroABuffer(campo === 'recibido' ? p.recibido : p.monto);
  }

  tecla(d: string): void {
    const a = this.campoActivo();
    if (!a) return;
    let buf = this.overwrite ? '' : this.buffer();
    if (buf.includes('.')) {
      const dec = buf.split('.')[1] ?? '';
      if (dec.length >= 2) return; // máximo 2 decimales
    }
    if (buf.replace('.', '').length >= 9) return; // límite defensivo
    buf = buf === '0' && d !== '.' ? d : buf + d;
    // "Aplicado" nunca puede superar el saldo restante: se topa el propio buffer (no solo el valor).
    if (a.campo === 'monto') {
      const cap = this.restanteExcluyendo(a.index);
      if (this.toNumber(buf) > cap) buf = this.numeroABuffer(cap);
    }
    this.buffer.set(buf);
    this.overwrite = false;
    this.commitBuffer();
  }

  teclaPunto(): void {
    if (this.campoActivo() === null) return;
    let buf = this.overwrite ? '' : this.buffer();
    if (!buf.includes('.')) buf = (buf === '' ? '0' : buf) + '.';
    this.buffer.set(buf);
    this.overwrite = false;
    this.commitBuffer();
  }

  teclaBorrar(): void {
    if (this.campoActivo() === null) return;
    this.overwrite = false;
    this.buffer.update((b) => b.slice(0, -1));
    this.commitBuffer();
  }

  teclaLimpiar(): void {
    if (this.campoActivo() === null) return;
    this.overwrite = false;
    this.buffer.set('');
    this.commitBuffer();
  }

  private commitBuffer(): void {
    const a = this.campoActivo();
    if (!a) return;
    const valor = this.buffer() === '' ? 0 : this.toNumber(this.buffer());
    if (a.campo === 'recibido') this.setPagoRecibido(a.index, valor);
    else this.setPagoAplicado(a.index, valor);
  }

  private numeroABuffer(v: number): string {
    const n = Number(v) || 0;
    return Number.isInteger(n) ? String(n) : String(this.redondear(n));
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(ev: KeyboardEvent): void {
    if (!this.cobroAbierto()) return;
    const k = ev.key;
    if (k >= '0' && k <= '9') { this.tecla(k); ev.preventDefault(); }
    else if (k === '.' || k === ',') { this.teclaPunto(); ev.preventDefault(); }
    else if (k === 'Backspace') { this.teclaBorrar(); ev.preventDefault(); }
    else if (k === 'Delete') { this.teclaLimpiar(); ev.preventDefault(); }
    else if (k === 'Enter') { if (this.cobroValido()) { this.confirmarCobro(); ev.preventDefault(); } }
    else if (k === 'Escape') { this.cerrarCobro(); ev.preventDefault(); }
  }

  confirmarCobro(): void {
    const keys = this.ventaKeys();
    if (!keys || !this.cobroValido() || this.procesando()) return;
    // A2: si aún hay operaciones de línea en la cola, esperar (el total podría no estar persistido).
    if (this.guardando()) { this.mensaje.set({ tipo: 'error', texto: 'Espere un momento: hay cambios de la venta guardándose.' }); return; }
    const pagos: PosPago[] = this.pagos()
      .filter((p) => (Number(p.monto) || 0) > 0)
      .map((p) => ({ codigo: p.codigo, descripcion: p.descripcion, monto: this.redondear(p.monto) }));
    if (!pagos.length) { this.mensaje.set({ tipo: 'error', texto: 'Registre al menos una forma de pago.' }); return; }

    this.pagosPrevios = this.pagos().map((p) => ({ ...p })); // preserva para posible reintento
    this.procesando.set(true);
    this.mensaje.set(null);
    this.cobroAbierto.set(false);
    const cliente = this.clienteEfectivo();
    this.posVenta.finalizar(keys, cliente, pagos)
      .pipe(finalize(() => this.procesando.set(false)))
      .subscribe({
        next: (res) => {
          this.imprimirTicket(res).then((impreso) => {
            if (!impreso) {
              this.messageService.add({ severity: 'warn', summary: 'Impresión bloqueada', detail: 'El navegador bloqueó la ventana del ticket. Habilite las ventanas emergentes y reimprima desde el historial.', life: 9000 });
            }
          });
          // El historial (facturasGeneral) está cacheado; invalidar para que la venta recién hecha aparezca.
          this.facturacionService.clearFacturasGeneralCache();
          this.resetVenta();

          if (res.emitido) {
            this.mensaje.set({ tipo: 'ok', texto: 'Factura emitida e impresa.' });
          } else {
            // C2: quedó aplicada y pagada, pero el DTE NO se transmitió a Hacienda. No es un éxito limpio.
            this.mensaje.set({ tipo: 'error', texto: 'Venta cobrada y aplicada, pero el DTE NO se transmitió a Hacienda. Emítalo desde Facturación (documento pendiente de emisión).' });
            this.messageService.add({ severity: 'warn', summary: 'DTE no transmitido', detail: 'La venta se registró y cobró, pero el DTE no se envió. Reintente la emisión desde Facturación.', life: 12000 });
          }
        },
        error: (err) => {
          // Pagos ya registrados; el documento queda En Elaboración pendiente de aplicar/emitir.
          const texto = this.errorTexto(err);
          this.marcarArticuloError(texto);
          this.refrescarExistenciasError();
          this.mensaje.set({ tipo: 'error', texto });
        }
      });
  }

  private marcarArticuloError(msg: string): void {
    const m = /([A-Za-z0-9]+)-[A-Za-z0-9]+\s*-\s*EXISTENCIA/i.exec(msg ?? '');
    this.articuloConError.set(m ? m[1].trim() : '');
  }
  // Refresca en línea la existencia de las líneas del carrito tras un faltante al aplicar.
  private refrescarExistenciasError(): void {
    for (const a of Array.from(new Set(this.cart().map((i) => i.articulo).filter(Boolean)))) this.loadExistencia(a);
  }

  // ── Interno ─────────────────────────────────────────────────────────────────
  private ensureBorrador$(): Observable<VentaKeys> {
    const keys = this.ventaKeys();
    if (keys) return of(keys);
    return this.posVenta.crearBorrador(this.clienteEfectivo()).pipe(tap((k) => this.ventaKeys.set(k)));
  }

  private sync$(keys: VentaKeys): Observable<unknown> {
    return this.posVenta.cargarDetalle(keys).pipe(tap((detalle) => this.cart.set(this.mapDetalle(detalle))));
  }

  private mapDetalle(detalle: FacturaDetalleDto[]): CartItem[] {
    const aprobados = this.preciosAprobados();
    const previo = this.cart();
    return (detalle ?? []).map((d) => {
      const articulo = String(d.ARTICULO ?? '').trim();
      const linea = this.toNumber(d.LINEA);
      const artCode = articulo.toUpperCase();
      // Preserva el estado local (aprobación en curso) que el detalle del servidor no conoce.
      const anterior = previo.find((p) => p.linea === linea && p.articulo === articulo)
        ?? previo.find((p) => p.articulo === articulo);
      const precioApproved = artCode in aprobados ? aprobados[artCode] : this.toNumber(d.PRECIO_UNITARIO);
      return {
        articulo,
        descripcion: String(d.DESCRIPCION ?? '').trim(),
        unidad: String(d.UNIDAD_MEDIDA ?? '').trim(),
        tipoArticulo: String(d.TIPO_ARTICULO ?? '').trim().toUpperCase(),
        precio: precioApproved,
        cantidad: this.toNumber(d.CANTIDAD),
        linea,
        enAprobacion: anterior?.enAprobacion,
        solicitudId: anterior?.solicitudId
      };
    });
  }

  // Nº de operaciones en vuelo en la cola. `guardando` solo vuelve a false cuando NO queda ninguna
  // (con un simple booleano parpadeaba a false entre ops encoladas, abriendo una ventana de carrera).
  private pendientesCola = 0;
  private encolar(fn: () => Observable<unknown>): void {
    this.pendientesCola++;
    this.guardando.set(true);
    this.cola$.next(() => fn().pipe(finalize(() => {
      this.pendientesCola = Math.max(0, this.pendientesCola - 1);
      if (this.pendientesCola === 0) this.guardando.set(false);
    })));
  }

  private onOpError(err: unknown): void {
    this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) });
    // Re-sincroniza para reflejar el estado real del servidor tras un fallo.
    const keys = this.ventaKeys();
    if (keys) this.posVenta.cargarDetalle(keys).subscribe({ next: (d) => this.cart.set(this.mapDetalle(d)), error: () => {} });
  }

  private resetVenta(): void {
    this.ventaKeys.set(null);
    this.cart.set([]);
    this.preciosAprobados.set({});
    this.clienteSel.set(null);
    this.pagos.set([]);
    this.pagosPrevios = null;
    this.articuloConError.set('');
    this.cobroAbierto.set(false);
    this.campoActivo.set(null);
    this.masFormasAbierto.set(false);
  }

  private imprimirTicket(res: PosVentaResultado): Promise<boolean> {
    return this.armarEImprimir(
      (res.cliente?.NOMBRE ?? '').trim() || 'Consumidor Final',
      this.fechaISO(),
      res.detalle ?? [],
      res.emitido ? { ambiente: res.ambiente, codGeneracion: res.keys.codGeneracion, numeroControl: res.numeroControl, selloRecepcion: res.selloRecepcion, fechaEmi: this.fechaISO() } : undefined
    );
  }

  private armarEImprimir(
    clienteNombre: string,
    fecha: string,
    detalle: FacturaDetalleDto[],
    dte?: { ambiente: string; codGeneracion: string; numeroControl: string; selloRecepcion: string; fechaEmi: string }
  ): Promise<boolean> {
    const empresa = this.auth.currentUser()?.selectedEmpresa;
    const logoRaw = String(empresa?.logo ?? '').trim();
    let logoSrc = logoRaw ? (logoRaw.startsWith('http') ? logoRaw : `data:image/png;base64,${logoRaw}`) : '';
    // Fallback coherente con el resto de la app (main-layout): urlServicio/urlApi + BackgroundLogo.png.
    if (!logoSrc) {
      const emp = empresa as { urlServicio?: string; urlApi?: string } | undefined;
      const base = String(emp?.urlServicio ?? emp?.urlApi ?? '').trim();
      if (base) logoSrc = `${base.endsWith('/') ? base : base + '/'}BackgroundLogo.png`;
    }

    const lineas = (detalle ?? []).map((dl) => {
      const cantidad = this.toNumber(dl.CANTIDAD);
      const precio = this.toNumber(dl.PRECIO_UNITARIO);
      return { cantidad, unidad: String(dl.UNIDAD_MEDIDA ?? '').trim(), descripcion: String(dl.DESCRIPCION ?? '').trim(), precio, total: this.redondear(cantidad * precio) };
    });
    const total = lineas.reduce((a, l) => a + l.total, 0);

    return this.posTicket.imprimir({
      nombreEmpresa: String(empresa?.nombreComercial || empresa?.nombre || 'EMPRESA'),
      logoSrc, clienteNombre, fecha, lineas, total, dte
    });
  }

  // ── Fase C: historial del turno ─────────────────────────────────────────────
  abrirHistorial(): void {
    this.historialAbierto.set(true);
    this.cargarHistorial();
  }
  cerrarHistorial(): void { this.historialAbierto.set(false); }

  cargarHistorial(): void {
    const hoy = this.fechaISO();
    this.historialCargando.set(true);
    this.facturacionService.getFacturasGeneral(hoy, hoy)
      .pipe(finalize(() => this.historialCargando.set(false)))
      .subscribe({
        next: (rows) => this.historial.set((rows ?? []).filter((f) => (f.Tipo_Factura ?? '').trim().toUpperCase() === 'FAC')),
        error: () => this.historial.set([])
      });
  }

  historialEmitido(f: FacturaGeneralDto): boolean { return !!String(f.SelloRecepcion ?? '').trim(); }

  // Clave estable por documento (CodGeneracion viene vacío en este listado).
  facturaKey(f: FacturaGeneralDto): string {
    return [f.Prefijo, f.Factura, f.SUCURSAL, f.PUNTO_VENTA].map((v) => String(v ?? '').trim()).join('|');
  }

  reimprimir(f: FacturaGeneralDto): void {
    const key = this.facturaKey(f);
    if (this.reimprimiendo()) return;
    this.reimprimiendo.set(key);

    const prefijo = String(f.Prefijo ?? ''), factura = String(f.Factura ?? '');
    const sucursal = String(f.SUCURSAL ?? ''), puntoVenta = String(f.PUNTO_VENTA ?? '');
    const emitido = this.historialEmitido(f);
    const idEmpresa = this.auth.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;

    // El listado no trae CodGeneracion; para documentos emitidos (ambiente 1) se lee el
    // encabezado, que sí lo trae junto con NoControl/Sello, para armar el bloque QR/DTE.
    forkJoin({
      detalle: this.facturacionService.getFacturaDetalle(prefijo, factura, sucursal, puntoVenta, 'FAC'),
      enc: emitido
        ? this.facturacionService.getFacturaEncabezado(prefijo, factura, sucursal, puntoVenta, idEmpresa)
        : of(null)
    })
      .pipe(finalize(() => this.reimprimiendo.set('')))
      .subscribe({
        next: ({ detalle, enc }) => {
          const fecha = (f.FECHA ?? '').trim() || this.fechaISO();
          let dte: { ambiente: string; codGeneracion: string; numeroControl: string; selloRecepcion: string; fechaEmi: string } | undefined;
          if (emitido) {
            const codGeneracion = String(enc?.CodGeneracion ?? '').trim() || String(f.CodGeneracion ?? '').trim();
            dte = {
              ambiente: this.posVenta.ambiente,
              codGeneracion,
              numeroControl: String(enc?.NoControl ?? f.NoControl ?? '').trim(),
              selloRecepcion: String(enc?.SelloRecepcion ?? f.SelloRecepcion ?? '').trim(),
              fechaEmi: fecha
            };
          }
          this.armarEImprimir((f.FACTURAR_A ?? '').trim() || 'Consumidor Final', fecha, detalle ?? [], dte).then((impreso) => {
            if (!impreso) this.messageService.add({ severity: 'warn', summary: 'Impresión bloqueada', detail: 'El navegador bloqueó la ventana del ticket. Habilite las ventanas emergentes.', life: 8000 });
          });
        },
        error: (err) => this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) })
      });
  }

  historialTotal(f: FacturaGeneralDto): number { return this.toNumber(f.TOTAL); }
  trackFactura = (_: number, f: FacturaGeneralDto) => this.facturaKey(f);

  subtotalLinea(item: CartItem): number {
    // item.precio ya es el precio NETO persistido (promo/ajuste aplicados al agregar); no se re-descuenta.
    return this.redondear(item.precio * item.cantidad);
  }
  formatMoney(v: number): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v ?? 0); }
  trackArticulo = (_: number, a: ArticuloPorBodegaDto) => a.ARTICULO;
  trackItem = (_: number, i: CartItem) => i.articulo;
  trackCliente = (_: number, c: PerfilClienteDto) => c.CLIENTE;

  sanearMensaje(err: unknown): string {
    const raw = this.errorTexto(err);
    if (!raw) return 'Ocurrió un error al procesar la operación.';
    if (raw.includes('SqlException') || raw.includes('at Microsoft.Data') || raw.includes('HEADERS ======')) {
      const match = raw.match(/SqlException\s*\([^)]*\)\s*:\s*([^\r\n]+)/i);
      if (match?.[1]) {
        return match[1].split('at Microsoft')[0].trim();
      }
      const firstLine = raw.split('\n')[0].replace(/at Microsoft.*/, '').trim();
      return firstLine || 'Error de base de datos. Consulte al administrador.';
    }
    return raw;
  }

  private errorTexto(err: unknown): string {
    if (typeof err === 'string' && err.trim()) return err.trim();
    const e = err as { error?: unknown; message?: string };
    if (typeof e?.error === 'string' && e.error.trim()) return e.error.trim();
    const inner = (e?.error ?? {}) as Record<string, unknown>;
    return String(inner['message'] ?? e?.message ?? 'No se pudo procesar la operación.').trim();
  }
  private fechaISO(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  private toNumber(v: unknown): number {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  private redondear(v: number): number { return Math.round((v + Number.EPSILON) * 100) / 100; }
}
