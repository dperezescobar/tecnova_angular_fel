import { ChangeDetectionStrategy, Component, HostBinding, HostListener, OnDestroy, OnInit, computed, effect, inject, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subject, forkJoin, of } from 'rxjs';
import { catchError, concatMap, finalize, map, switchMap, tap } from 'rxjs/operators';
import { FacturacionService } from '../services/facturacion';
import { ArticulosService } from '../../articulos/services/articulos';
import { ArticuloPorBodegaDto, FacturaDetalleDto, FacturaGeneralDto, FacturaTotalesDto, FormaPagoDto, PerfilClienteDto, SucursalPuntoVendedorDto } from '../../../core/models/facturacion.models';
import { AuthService } from '../../../core/services/auth';
import { HttpClient } from '@angular/common/http';
import { PosSignalRService } from '../../../core/services/pos-signalr.service';
import { environment } from '../../../../environments/environment';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PosVentaService, PosVentaResultado, VentaKeys, PosLineaVenta, PosPago } from './pos-venta.service';
import { PosTicketService } from './pos-ticket.service';
import { PosHibridoConfigService } from './pos-hibrido-config.service';
import { PosHibridoConfigDto, PosRubroConfigDto, PosUsuarioRubroDto } from '../../../core/models/facturacion.models';
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
  descuento?: number;
  tipoDescuento?: string;
  cantidad: number;
  linea: number; // LINEA en el servidor (0 si aún no persistida)
  enAprobacion?: boolean;
  solicitudId?: number;
  grupo?: string; // GRUPO_INVENTARIO_1 (para decidir FACTURA_DIRECTA vs RECIBO, ver PosHibridoConfig)
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
  providers: [MessageService, PosVentaService],
  templateUrl: './pos-hibrido.html',
  styleUrls: ['./pos-hibrido.scss']
})
export class PosHibridoComponent implements OnInit, OnDestroy {
  private facturacionService = inject(FacturacionService);
  private articulosService = inject(ArticulosService);
  private auth = inject(AuthService);
  private posVenta = inject(PosVentaService);
  private posTicket = inject(PosTicketService);
  private posHibridoConfig = inject(PosHibridoConfigService);
  private http = inject(HttpClient);
  private messageService = inject(MessageService);
  public signalRService = inject(PosSignalRService);

  // Modal Ajuste de Precio en Vivo
  ajusteModalAbierto = signal(false);
  ajusteItemSel = signal<CartItem | null>(null);
  precioSolicitadoInput = signal<number>(0);
  motivoAjusteInput = signal<string>('');
  enviandoSolicitud = signal(false);

  // Aprobación local con PIN (manager presente en la terminal, sin pasar por SignalR)
  managersCaja = signal<{ usuario: string; nombre: string }[]>([]);
  managerPinSel = signal<string>('');
  pinLocalInput = signal<string>('');
  aprobandoLocal = signal(false);

  // Modal Ingreso de Cantidad / Peso Fraccionado o Precio Cero
  modalCantidadVisible = signal(false);
  articuloCantSel = signal<ArticuloPorBodegaDto | null>(null);
  inputCantidadModal = signal<number>(1);
  inputPrecioModal = signal<number>(0);

  // Edición de cantidad/peso de una línea ya en el carrito (vs. agregar artículo nuevo).
  modoEdicionCantidad = signal(false);
  private itemEditandoCantidad: CartItem | null = null;

  // Teclado numérico en pantalla para el modal de Cantidad / Peso (independiente del de Cobro).
  tecladoCantidadVisible = signal(true);
  private bufferCant = signal<string>('');
  private cantOverwrite = true;

  // Listener de foco para re-enfocar el input si el modal sigue abierto
  // cuando el usuario vuelve a la ventana del navegador tras cerrar el popup de impresión.
  private _cantFocusListener: (() => void) | null = null;

  private _focusCantInput(): void {
    const el = document.querySelector<HTMLInputElement>('.pos-cant-dialog .pos-modal-cant-strong');
    if (el) { el.focus(); el.select(); }
  }

  onModalCantShow(): void {
    // Limpiar listener previo si quedó alguno
    this._limpiarCantFocusListener();

    // Intento inmediato (funciona cuando la ventana ya tiene el foco)
    setTimeout(() => this._focusCantInput(), 80);

    // Fallback: cuando el navegador recupere el foco del OS (tras cerrar popup de impresión),
    // re-enfocar el input si el modal sigue abierto.
    const handler = () => {
      if (this.modalCantidadVisible()) {
        setTimeout(() => this._focusCantInput(), 50);
      }
      this._limpiarCantFocusListener();
    };
    this._cantFocusListener = handler;
    window.addEventListener('focus', handler);

    // Seguridad: eliminar el listener luego de 30 s para no dejar basura
    setTimeout(() => this._limpiarCantFocusListener(), 30_000);
  }

  private _limpiarCantFocusListener(): void {
    if (this._cantFocusListener) {
      window.removeEventListener('focus', this._cantFocusListener);
      this._cantFocusListener = null;
    }
  }

  // Promociones Activas
  promociones = signal<Record<string, { tipo: string; valor: number }>>({});

  // POS Híbrido - Fase 2 (opt-in). Sin PosHibridoConfig.Activo=1, todo se comporta como hoy.
  private posHibConfig = signal<PosHibridoConfigDto>({ idEmpresa: 0, activo: false });
  private posHibRubros = signal<PosRubroConfigDto[]>([]);
  private posHibUsuarioRubros = signal<PosUsuarioRubroDto[]>([]);

  @Input() set bodega(value: string) {
    const b = (value || 'BOD01').trim();
    if (this._bodega() !== b) {
      this._bodega.set(b);
      this.posVenta.setBodega(b);
      this.cargar();
    }
  }
  get bodega(): string {
    return this._bodega();
  }
  private _bodega = signal<string>('BOD01');
  puntoVentaActual = signal<string>('');
  sucursalActual = signal<string>('');
  puntosVentaDisponibles = signal<SucursalPuntoVendedorDto[]>([]);
  @Input() @HostBinding('class.embedded') embedded = false;

  loading = signal(false);
  procesando = signal(false);        // cobro/cancelación en curso
  guardando = signal(false);         // op de línea/cliente en curso
  ventaCompletada = signal(false);   // venta recién emitida (muestra botón Nueva venta)
  mensaje = signal<{ tipo: 'error' | 'ok'; texto: string } | null>(null);

  nuevaVenta(): void {
    this.ventaCompletada.set(false);
    this.resetVenta();
    this.mensaje.set(null);
    this.vueltoUltimaVenta.set(null);
  }

  cerrarVueltoModal(): void {
    this.vueltoUltimaVenta.set(null);
  }

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

  // Restringe el catálogo a los rubros permitidos del usuario (solo si la empresa activó el POS
  // Híbrido Fase 2 y el usuario tiene filas explícitas en PosUsuarioRubro; si no, ve todo = hoy).
  private articulosVisibles = computed<ArticuloPorBodegaDto[]>(() => {
    const base = this.articulos();
    if (!this.posHibConfig().activo) return base;
    const misRubros = this.posHibUsuarioRubros();
    if (!misRubros.length) return base;
    const permitidos = new Set(misRubros.filter((r) => r.permitido).map((r) => r.grupoInventario1));
    return base.filter((a) => permitidos.has((a.GRUPO_COD ?? '').trim()));
  });

  grupos = computed<string[]>(() => {
    const set = new Set<string>();
    for (const a of this.articulosVisibles()) set.add((a.GRUPO_DESC ?? '').trim() || GRUPO_SIN);
    return Array.from(set).sort((x, y) => x.localeCompare(y));
  });
  private filtrados = computed<ArticuloPorBodegaDto[]>(() => {
    const grupo = this.grupoActivo();
    const q = this.filtro().trim().toLowerCase();
    return this.articulosVisibles().filter((a) => {
      const g = (a.GRUPO_DESC ?? '').trim() || GRUPO_SIN;
      if (grupo && g !== grupo) return false;
      if (!q) return true;
      return (a.DESCRIPCION ?? '').toLowerCase().includes(q) || (a.ARTICULO ?? '').toLowerCase().includes(q);
    });
  });
  totalFiltrados = computed(() => this.filtrados().length);
  visibles = computed<ArticuloPorBodegaDto[]>(() => this.filtrados().slice(0, this.visibleCount()));
  hayMas = computed(() => this.visibleCount() < this.filtrados().length);

  dbTotales = signal<FacturaTotalesDto | null>(null);

  totalUnidades = computed(() => this.cart().reduce((acc, i) => acc + i.cantidad, 0));

  // Subtotal bruto (antes de descuentos, IVA incluido). Coherente en ambas rutas: bruto = total + descuento.
  subtotalBrutoTotal = computed(() => {
    const db = this.dbTotales();
    if (db !== null) {
      return this.redondear(this.toNumber(db.TOTAL_FACTURA) + this.descuentoOfertaTotal());
    }
    return this.redondear(this.cart().reduce((acc, i) => acc + this.subtotalLinea(i), 0));
  });

  // Descuento por PROMOCIÓN/OFERTA = descuentos POR ARTÍCULO (DETALLE_FACTURA.Descuento, aplicados
  // server-side vía Inventario.ArticuloDescuento en Update_DetalleFactura). NO usa DescuentoAdicional:
  // ese campo es exclusivo para un descuento GLOBAL de la factura (p.ej. 10% sobre toda la compra),
  // que el POS no maneja hoy y por eso siempre viaja en 0 (se incluye por si a futuro existiera).
  descuentoOfertaTotal = computed(() => {
    const db = this.dbTotales();
    if (db !== null) {
      return this.redondear(this.toNumber(db.DESCUENTO) + this.toNumber(db.DescuentoAdicional));
    }
    // Sin persistir aún (línea no persistida): estimación local basada en promociones vigentes.
    return this.redondear(this.cart().reduce((acc, i) => acc + this.getDescuentoLinea(i), 0));
  });

  totalFactura = computed(() => {
    const db = this.dbTotales();
    const dbTotal = db ? this.toNumber(db.TOTAL_FACTURA) : 0;
    const computedTotal = this.redondear(Math.max(0, this.subtotalBrutoTotal() - this.descuentoOfertaTotal()));
    return dbTotal > 0 ? dbTotal : computedTotal;
  });

  getDescuentoLinea(item: CartItem): number {
    const promo = this.getPromo(item.articulo);
    if (!promo || promo.valor <= 0) return 0;
    const subtotalBruto = this.redondear(item.precio * item.cantidad);
    if (promo.tipo === 'P') {
      return this.redondear(subtotalBruto * (promo.valor / 100));
    }
    return this.redondear(promo.valor * item.cantidad);
  }

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

  // POS Híbrido - Fase 2: modo de documento para el carrito actual (ver PosHibridoConfigService).
  // 'FACTURA_DIRECTA' siempre que el feature esté apagado para la empresa (comportamiento de hoy).
  modoDocumentoCarrito = computed<'FACTURA_DIRECTA' | 'RECIBO'>(() => {
    const grupos = Array.from(new Set(this.cart().map((i) => (i.grupo ?? '').trim()).filter(Boolean)));
    return this.posHibridoConfig.resolverModo(this.posHibConfig(), this.posHibRubros(), grupos);
  });
  esVentaRecibo = computed(() => this.posHibConfig().activo && this.modoDocumentoCarrito() === 'RECIBO');

  preciosAprobados = signal<Record<string, number>>({});

  // Vuelto de la última venta cobrada: se captura antes de resetVenta() (que limpia pagos(), de donde
  // sale el cálculo) para que el cajero lo siga viendo aunque el panel de cobro ya se haya cerrado.
  vueltoUltimaVenta = signal<number | null>(null);

  constructor() {
    this.posVenta.setBodega(this.bodega);
    if (this.embedded) {
      this.cargar();
    }
    this.cargarClientes();

    this.posVenta.getFormasPago().subscribe({
      next: (rows) => this.formasPago.set(rows ?? []),
      error: () => this.formasPago.set([])
    });

    // POS Híbrido - Fase 2: config opt-in. Cualquier falla de red deja los defaults (feature off).
    this.posHibridoConfig.getConfig().subscribe({ next: (c) => this.posHibConfig.set(c) });
    this.posHibridoConfig.getRubroConfig().subscribe({ next: (r) => this.posHibRubros.set(r ?? []) });
    const usuarioActual = String(this.auth.currentUser()?.username ?? '').trim();
    if (usuarioActual) {
      this.posHibridoConfig.getUsuarioRubro(usuarioActual).subscribe({ next: (r) => this.posHibUsuarioRubros.set(r ?? []) });
      if (!this.embedded) {
        this.facturacionService.getSucursalPuntoVendedor(usuarioActual).subscribe({
          next: (rows) => {
            const list = rows ?? [];
            this.puntosVentaDisponibles.set(list);
            if (list.length > 0) {
              this.seleccionarPuntoVenta(list[0]);
            } else {
              this.cargar();
            }
          },
          error: () => this.cargar()
        });
      }
    } else if (!this.embedded) {
      this.cargar();
    }
    effect(() => { for (const a of this.visibles()) this.cargarImagen(a); });

    effect(() => {
      const res = this.signalRService.respuestaAjusteSignal();
      if (!res) return;

      // La respuesta solo aplica a una línea de ESTE carrito: por solicitud, con respaldo por artículo
      // "en revisión" (la entrega ya está aislada por caja+empresa, así que el respaldo es seguro).
      const resArt = String(res.articuloID ?? '').trim().toUpperCase();
      const target = this.cart().find((i) => i.solicitudId === res.solicitudID)
        ?? this.cart().find((i) => i.enAprobacion === true && String(i.articulo ?? '').trim().toUpperCase() === resArt);
      if (!target) return;

      const artCode = String(target.articulo ?? '').trim().toUpperCase();
      const coincide = (i: CartItem) =>
        i.solicitudId === res.solicitudID
        || (i.enAprobacion === true && String(i.articulo ?? '').trim().toUpperCase() === artCode);

      if (res.aprobado) {
        this.preciosAprobados.update((m) => ({ ...m, [artCode]: res.precioFinal }));
      }

      let itemAprobado: CartItem | null = null;
      this.cart.update((items) =>
        items.map((item) => {
          if (!coincide(item)) return item;
          if (res.aprobado) {
            itemAprobado = { ...item, precio: res.precioFinal, enAprobacion: false, solicitudId: undefined };
            return itemAprobado;
          }
          return { ...item, enAprobacion: false, solicitudId: undefined };
        })
      );

      if (res.aprobado) {
        const keys = this.ventaKeys();
        if (keys) {
          this.encolar(() => this.sync$(keys));
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

  ngOnInit(): void {
    // El hub de autorizaciones (aprobación de ajuste de precio en vivo) es exclusivo del flujo de
    // caja de tecnova-erp. Embebido (EuroSoccer, [embedded]=true) no se necesita y además autentica
    // con el AuthService equivocado para esa sesión -- se omite para no generar el intento de
    // negociación/CORS fallido en consola. `embedded` recién está resuelto aquí, no en el constructor
    // (los @Input() se asignan después de construir la instancia).
    if (!this.embedded) {
      this.signalRService.iniciarConexion(CAJA_ID, false);
    }
  }

  ngOnDestroy(): void {
    this._limpiarCantFocusListener();
    this.objectUrls.forEach((u) => URL.revokeObjectURL(u));
    this.cola$.complete();
    if (!this.embedded) {
      this.signalRService.detenerConexion();
    }
  }

  // ── Autorizaciones de Precio en Vivo ─────────────────────────
  solicitarAjuste(item: CartItem): void {
    this.ajusteItemSel.set(item);
    this.precioSolicitadoInput.set(item.precio);
    this.motivoAjusteInput.set('Discrepancia en etiqueta física');
    this.managerPinSel.set('');
    this.pinLocalInput.set('');
    this.ajusteModalAbierto.set(true);
    this.cargarManagersCaja();
  }

  cerrarAjusteModal(): void {
    this.ajusteModalAbierto.set(false);
    this.ajusteItemSel.set(null);
    this.managerPinSel.set('');
    this.pinLocalInput.set('');
  }

  cargarManagersCaja(): void {
    this.http.get<{ usuario: string; nombre: string }[]>(`${environment.apiUrl}/promociones/managers-caja`)
      .subscribe({
        next: (rows) => this.managersCaja.set(rows ?? []),
        error: () => this.managersCaja.set([])
      });
  }

  // Manager presente en la terminal: aprueba con su PIN en una sola llamada, sin pasar por SignalR/PENDIENTE.
  aprobarPrecioLocal(): void {
    const item = this.ajusteItemSel();
    if (!item || this.aprobandoLocal()) return;

    const manager = this.managerPinSel();
    const pin = this.pinLocalInput().trim();
    if (!manager || !/^\d{4,6}$/.test(pin)) {
      this.messageService.add({ severity: 'error', summary: 'PIN de autorización', detail: 'Seleccione un manager e ingrese su PIN.' });
      return;
    }

    this.aprobandoLocal.set(true);
    const keys = this.ventaKeys();
    const precioFinal = Number(this.precioSolicitadoInput()) || item.precio;
    const body = {
      cajaID: CAJA_ID,
      usuarioManager: manager,
      pin,
      articuloID: item.articulo,
      articuloDescripcion: item.descripcion,
      precioSistema: item.precio,
      precioSolicitado: precioFinal,
      motivo: this.motivoAjusteInput().trim() || 'Ajuste de precio en caja',
      idFactura: keys?.idFactura ?? 0,
      prefijo: keys?.prefijo ?? '',
      factura: keys?.factura ?? '',
      sucursal: keys?.sucursal ?? '',
      puntoVenta: keys?.puntoVenta ?? '',
      tipoFactura: 'FAC'
    };

    this.http.post<{ precioFinal: number; usuarioAprobo: string }>(`${environment.apiUrl}/promociones/aprobar-precio-local`, body)
      .pipe(finalize(() => this.aprobandoLocal.set(false)))
      .subscribe({
        next: (res) => {
          const artCode = String(item.articulo ?? '').trim().toUpperCase();
          this.preciosAprobados.update((m) => ({ ...m, [artCode]: res.precioFinal }));

          this.cart.update((items) =>
            items.map((i) => {
              if (i.articulo !== item.articulo) return i;
              return { ...i, precio: res.precioFinal, enAprobacion: false, solicitudId: undefined };
            })
          );

          if (keys) {
            this.encolar(() => this.sync$(keys));
          }

          this.messageService.add({
            severity: 'success',
            summary: 'Ajuste Aprobado',
            detail: `Ajuste APROBADO por ${res.usuarioAprobo}: $${res.precioFinal.toFixed(2)}`,
            life: 6000
          });
          this.cerrarAjusteModal();
        },
        error: (err) => {
          const msg = this.sanearMensaje(err);
          this.messageService.add({ severity: 'error', summary: 'PIN de autorización', detail: msg, life: 7000 });
        }
      });
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
            detail: 'Solicitud enviada al manager. Esperando respuesta...',
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

  seleccionarPuntoVenta(sp: SucursalPuntoVendedorDto): void {
    const pv = (sp.PUNTO_VENTA ?? '').trim();
    const sc = (sp.Sucursal ?? '').trim();
    this.puntoVentaActual.set(pv);
    this.sucursalActual.set(sc);

    // La bodega asignada a cada punto de venta es dato administrable (Facturacion.PUNTO_VENTA.BODEGA_ASIGNADA,
    // ver "Sucursales y puntos de venta"). Mientras un tenant no la tenga configurada (columna en rollout),
    // se conserva la heurística anterior (P002/EUROSOCCER -> BODEURO) para no romper el catálogo de EuroSoccer
    // durante la transición; una vez asignada, el dato administrado siempre gana.
    const pvUpper = pv.toUpperCase();
    const pvDesc = (sp.NombrePV ?? '').trim().toUpperCase();
    const fallbackHeuristico = pvUpper === 'P002' || pvDesc.includes('EUROSOCCER') ? 'BODEURO' : 'BOD01';
    const bodegaAsignada = (sp.BodegaAsignada ?? '').trim().toUpperCase() || fallbackHeuristico;
    this._bodega.set(bodegaAsignada);
    this.posVenta.setBodega(bodegaAsignada);

    this.grupoActivo.set('');
    this.cargar();
  }

  onCambiarPuntoVenta(pvCodigo: string): void {
    const target = this.puntosVentaDisponibles().find(
      (p) => (p.PUNTO_VENTA ?? '').trim().toUpperCase() === String(pvCodigo ?? '').trim().toUpperCase()
    );
    if (target) {
      this.seleccionarPuntoVenta(target);
    }
  }

  // ── Catálogo & Promociones ───────────────────────────────────────────────
  cargar(): void {
    this.facturacionService.invalidateCacheByPrefix('catalogo:articulos');
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

    this.facturacionService.getArticulosPorBodega(this.bodega, this.puntoVentaActual(), this.sucursalActual())
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

  seleccionarCliente(c: PerfilClienteDto | null): void {
    this.clienteSel.set(c);
    this.clientePickerAbierto.set(false);
    const keys = this.ventaKeys();
    if (keys && this.cart().length) {
      const efectivo = this.clienteEfectivo();
      // Sin descuento en cabecera: las promociones son POR ARTÍCULO y las aplica el servidor
      // (ArticuloDescuento en Update_DetalleFactura). Enviarlas también aquí las duplicaría.
      // DescuentoAdicional queda reservado para un descuento GLOBAL manual (no implementado en POS).
      this.encolar(() => this.posVenta.guardarEncabezado(keys, efectivo, 0).pipe(switchMap(() => this.sync$(keys))));
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
    if (this.ventaCompletada()) {
      this.nuevaVenta();
    }
    this.modoEdicionCantidad.set(false);
    this.itemEditandoCantidad = null;
    this.articuloCantSel.set(a);
    const codigo = (a.ARTICULO ?? '').trim();
    const artCode = codigo.toUpperCase();
    const precioAprobado = this.preciosAprobados()[artCode];
    const base = precioAprobado != null && precioAprobado > 0 ? precioAprobado : this.toNumber(a.ULTIMO_PRECIO);
    const promoPrecio = precioAprobado != null && precioAprobado > 0 ? precioAprobado : this.getPrecioFinal(codigo, base);
    this.inputPrecioModal.set(promoPrecio > 0 ? promoPrecio : 0);
    this.inputCantidadModal.set(1);
    this.seedBufferCant(1);
    this.modalCantidadVisible.set(true);
  }

  // Editar la cantidad/peso de una línea que ya está en el carrito (botón "-" en unidades fraccionadas).
  abrirModalPesoParaEditar(item: CartItem): void {
    this.modoEdicionCantidad.set(true);
    this.itemEditandoCantidad = item;
    this.articuloCantSel.set({
      ARTICULO: item.articulo,
      DESCRIPCION: item.descripcion,
      TIPO_ARTICULO: item.tipoArticulo,
      ULTIMO_PRECIO: item.precio,
      TIENE_IMAGEN: false,
      PRECIO_MAYOREO: 0,
      cantidadmayoreo: 0,
      UNIDAD_MEDIDA: item.unidad
    });
    this.inputPrecioModal.set(0);
    this.inputCantidadModal.set(item.cantidad);
    this.seedBufferCant(item.cantidad);
    this.modalCantidadVisible.set(true);
  }

  cerrarModalCantidad(): void {
    this._limpiarCantFocusListener();
    this.modalCantidadVisible.set(false);
    this.articuloCantSel.set(null);
    this.modoEdicionCantidad.set(false);
    this.itemEditandoCantidad = null;
  }

  setCantPreset(val: number): void {
    this.inputCantidadModal.set(val);
    this.seedBufferCant(val);
  }

  confirmarAgregarConCantidad(): void {
    const cant = this.inputCantidadModal();

    if (this.modoEdicionCantidad()) {
      const item = this.itemEditandoCantidad;
      this.cerrarModalCantidad();
      if (item) this.cambiarCantidad(item, cant);
      return;
    }

    const a = this.articuloCantSel();
    // Solo enviar precioCustom si el artículo NO tiene precio de catálogo (esPrecioCero),
    // para evitar sobrescribir la promoción activa con el precio base.
    const precioCustom = this.esPrecioCero(a?.ULTIMO_PRECIO) ? this.inputPrecioModal() : undefined;
    this.cerrarModalCantidad();
    if (a && cant > 0) {
      this.ejecutarAgregar(a, cant, precioCustom && precioCustom > 0 ? precioCustom : undefined);
    }
  }

  // ── Teclado numérico en pantalla del modal de Cantidad / Peso ──────────────
  toggleTecladoCant(): void { this.tecladoCantidadVisible.update((v) => !v); }

  private seedBufferCant(valorInicial: number): void {
    this.bufferCant.set(valorInicial > 0 ? this.numeroABuffer(valorInicial) : '');
    this.cantOverwrite = true;
  }

  textoCant(): string {
    return this.bufferCant() === '' ? '0' : this.bufferCant();
  }

  // El input manual y el teclado en pantalla comparten el mismo signal; al escribir a mano
  // se resincroniza el buffer para que el teclado continúe (no reemplace) desde ese valor.
  onCantInputChange(valor: number): void {
    this.inputCantidadModal.set(valor);
    this.bufferCant.set(valor > 0 ? this.numeroABuffer(valor) : '');
    this.cantOverwrite = false;
  }

  teclaCant(d: string): void {
    let buf = this.cantOverwrite ? '' : this.bufferCant();
    if (buf.includes('.')) {
      const dec = buf.split('.')[1] ?? '';
      if (dec.length >= 2) return; // máximo 2 decimales
    }
    if (buf.replace('.', '').length >= 7) return; // límite defensivo
    buf = buf === '0' && d !== '.' ? d : buf + d;
    this.bufferCant.set(buf);
    this.cantOverwrite = false;
    this.inputCantidadModal.set(this.toNumber(buf));
  }

  teclaPuntoCant(): void {
    let buf = this.cantOverwrite ? '' : this.bufferCant();
    if (!buf.includes('.')) buf = (buf === '' ? '0' : buf) + '.';
    this.bufferCant.set(buf);
    this.cantOverwrite = false;
    this.inputCantidadModal.set(this.toNumber(buf));
  }

  teclaBorrarCant(): void {
    this.cantOverwrite = false;
    this.bufferCant.update((b) => b.slice(0, -1));
    this.inputCantidadModal.set(this.bufferCant() === '' ? 0 : this.toNumber(this.bufferCant()));
  }

  teclaLimpiarCant(): void {
    this.cantOverwrite = false;
    this.bufferCant.set('');
    this.inputCantidadModal.set(0);
  }

  // ── Carrito (persist-as-you-go) ─────────────────────────────────────────────
  agregar(a: ArticuloPorBodegaDto): void {
    if (this.ventaCompletada()) {
      this.nuevaVenta();
    }
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
    const artCode = codigo.toUpperCase();
    const precioAprobado = this.preciosAprobados()[artCode];
    // MODELO B: En la línea del detalle se persiste el precio base de catálogo (o el precio manual libre/aprobado).
    // El descuento acumulado por promociones se calcula a nivel global y se envía en DescuentoAdicional de la cabecera.
    const precioBase = precioCustom != null && precioCustom > 0
      ? precioCustom
      : (precioAprobado != null && precioAprobado > 0 ? precioAprobado : this.toNumber(a.ULTIMO_PRECIO));

    this.encolar(() =>
      this.ensureBorrador$().pipe(
        switchMap((keys) => {
          const existente = this.cart().find((i) => i.articulo === codigo);
          if (existente) {
            const cantNueva = this.redondear(existente.cantidad + cantidad);
            const precioLinea = precioCustom != null && precioCustom > 0
              ? precioCustom
              : (precioAprobado != null && precioAprobado > 0 ? precioAprobado : existente.precio);
            const l: PosLineaVenta = { articulo: codigo, descripcion: existente.descripcion, unidad: existente.unidad, precio: precioLinea, cantidad: cantNueva, linea: existente.linea };
            return this.posVenta.actualizarCantidad(keys, l).pipe(switchMap(() => this.sync$(keys)));
          }
          const nueva: PosLineaVenta = { articulo: codigo, descripcion: (a.DESCRIPCION ?? '').trim(), unidad: (a.UNIDAD_MEDIDA ?? '').trim(), precio: precioBase, cantidad: cantidad };
          return this.posVenta.agregarLinea(keys, nueva).pipe(switchMap(() => this.sync$(keys)));
        })
      )
    );
  }

  // Botón "-" de la línea: unidad entera → resta 1; unidad fraccionada (peso) → abre el modal para reingresar el peso exacto.
  disminuirCantidad(item: CartItem): void {
    if (item.enAprobacion) return;
    if (this.esUnidadFraccionada(item.unidad)) {
      this.abrirModalPesoParaEditar(item);
      return;
    }
    this.cambiarCantidad(item, Math.max(0, this.redondear(item.cantidad - 1)));
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
    if (!(cod in this.existencias())) return null;
    // El sistema puede quedar con existencia negativa (ventas sin reposición); no se muestra así al cajero.
    return Math.max(0, this.existencias()[cod]);
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
    const modo = this.modoDocumentoCarrito();
    this.posVenta.finalizar(keys, cliente, pagos, modo)
      .pipe(finalize(() => this.procesando.set(false)))
      .subscribe({
        next: (res) => {
          // Se lee ANTES de resetVenta() (que limpia pagos(), fuente del cálculo).
          const vueltoFinal = this.vuelto();
          this.vueltoUltimaVenta.set(vueltoFinal > 0.009 ? vueltoFinal : null);

          this.imprimirTicket(res, vueltoFinal, modo === 'RECIBO').then((impreso) => {
            if (!impreso) {
              this.messageService.add({ severity: 'warn', summary: 'Impresión bloqueada', detail: 'El navegador bloqueó la ventana del ticket. Habilite las ventanas emergentes y reimprima desde el historial.', life: 9000 });
            }
          });
          // El historial (facturasGeneral) está cacheado; invalidar para que la venta recién hecha aparezca.
          this.facturacionService.clearFacturasGeneralCache();
          this.resetVenta();
          this.ventaCompletada.set(true);

          if (res.emitido) {
            this.mensaje.set({ tipo: 'ok', texto: 'Factura emitida e impresa.' });
          } else if (modo === 'RECIBO') {
            // Esperado: los rubros de este ticket están configurados como recibo. No es un error;
            // el admin lo incluirá luego en una factura consolidada (Cierre de Recibos).
            this.mensaje.set({ tipo: 'ok', texto: 'Recibo registrado y cobrado. Pendiente de facturar (Cierre de Recibos).' });
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

  private cargarPromociones(): Observable<Record<string, { tipo: string; valor: number }>> {
    return this.http.get<any[]>(`${environment.apiUrl}/GestionPrecios/promociones`).pipe(
      map((rows) => {
        const map: Record<string, { tipo: string; valor: number }> = {};
        (rows || []).forEach((p) => {
          if (p.activo && (p.estado === 'Activa' || p.estado === 'Activo') && p.articulo) {
            map[p.articulo.trim().toUpperCase()] = { tipo: p.tipoDescuento || 'P', valor: Number(p.valorDescuento) || 0 };
          }
        });
        return map;
      }),
      catchError(() => of(this.promociones()))   // si falla, conserva las actuales
    );
  }

  private sync$(keys: VentaKeys): Observable<unknown> {
    return forkJoin({
      detalle: this.posVenta.cargarDetalle(keys),
      totales: keys.idFactura ? this.posVenta.cargarTotales(keys.idFactura) : of(null),
      promos:  this.cargarPromociones()         // refresca promos en cada sync para capturar cambios del admin
    }).pipe(
      tap(({ detalle, totales, promos }) => {
        this.promociones.set(promos);            // actualiza primero, antes del cart (influye en badges)
        this.cart.set(this.mapDetalle(detalle));
        if (totales) {
          this.dbTotales.set(totales);
        }
      })
    );
  }

  private mapDetalle(detalle: FacturaDetalleDto[]): CartItem[] {
    const aprobados = this.preciosAprobados();
    const previo = this.cart();
    // Catálogo COMPLETO (no articulosVisibles, que puede estar recortado por permisos de usuario):
    // clasificar el rubro de una línea ya vendida no debe depender de qué ve el cajero hoy.
    const catalogo = this.articulos();
    return (detalle ?? []).map((d) => {
      const articulo = String(d.ARTICULO ?? '').trim();
      const linea = this.toNumber(d.LINEA);
      const artCode = articulo.toUpperCase();
      // Preserva el estado local (aprobación en curso) que el detalle del servidor no conoce.
      const anterior = previo.find((p) => p.linea === linea && p.articulo === articulo)
        ?? previo.find((p) => p.articulo === articulo);
      const precioApproved = artCode in aprobados ? aprobados[artCode] : this.toNumber(d.PRECIO_UNITARIO);
      const grupo = catalogo.find((a) => (a.ARTICULO ?? '').trim().toUpperCase() === artCode)?.GRUPO_COD?.trim() || anterior?.grupo;
      return {
        articulo,
        descripcion: String(d.DESCRIPCION ?? '').trim(),
        unidad: String(d.UNIDAD_MEDIDA ?? '').trim(),
        tipoArticulo: anterior?.tipoArticulo ?? '',
        precio: precioApproved,
        precioOriginal: anterior?.precioOriginal,
        tienePromocion: anterior?.tienePromocion,
        descuento: this.toNumber(d.Descuento),
        tipoDescuento: String(d.TipoDescuento ?? '').trim(),
        cantidad: this.toNumber(d.CANTIDAD),
        linea,
        enAprobacion: anterior?.enAprobacion,
        solicitudId: anterior?.solicitudId,
        grupo
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
    this.dbTotales.set(null);
    this.preciosAprobados.set({});
    this.clienteSel.set(null);
    this.pagos.set([]);
    this.pagosPrevios = null;
    this.articuloConError.set('');
    this.cobroAbierto.set(false);
    this.campoActivo.set(null);
    this.masFormasAbierto.set(false);
  }

  private imprimirTicket(res: PosVentaResultado, vuelto?: number, esRecibo: boolean = false): Promise<boolean> {
    return this.armarEImprimir(
      (res.cliente?.NOMBRE ?? '').trim() || 'Consumidor Final',
      this.fechaISO(),
      res.detalle ?? [],
      res.emitido ? { ambiente: res.ambiente, codGeneracion: res.keys.codGeneracion, numeroControl: res.numeroControl, selloRecepcion: res.selloRecepcion, fechaEmi: this.fechaISO() } : undefined,
      vuelto,
      esRecibo
    );
  }

  private armarEImprimir(
    clienteNombre: string,
    fecha: string,
    detalle: FacturaDetalleDto[],
    dte?: { ambiente: string; codGeneracion: string; numeroControl: string; selloRecepcion: string; fechaEmi: string },
    vuelto?: number,
    esRecibo: boolean = false
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
      const descuento = this.toNumber(dl.Descuento);
      const bruto = cantidad * precio;
      const total = this.redondear(bruto - descuento);
      return {
        cantidad, unidad: String(dl.UNIDAD_MEDIDA ?? '').trim(), descripcion: String(dl.DESCRIPCION ?? '').trim(),
        precio, total,
        descuento: descuento > 0 ? this.redondear(descuento) : undefined,
        tipoDescuento: String(dl.TipoDescuento ?? '').trim() || undefined
      };
    });
    const subtotalBruto = lineas.reduce((a, l) => a + (l.total + (l.descuento ?? 0)), 0);
    const descuentoTotal = lineas.reduce((a, l) => a + (l.descuento ?? 0), 0);
    const total = lineas.reduce((a, l) => a + l.total, 0);

    return this.posTicket.imprimir({
      nombreEmpresa: String(empresa?.nombreComercial || empresa?.nombre || 'EMPRESA'),
      logoSrc, clienteNombre, fecha, lineas,
      subtotalBruto: this.redondear(subtotalBruto), descuentoTotal: this.redondear(descuentoTotal), total: this.redondear(total),
      vuelto: vuelto && vuelto > 0.009 ? this.redondear(vuelto) : undefined,
      dte, esRecibo
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

  // CodGeneracion completo: Prefijo+Factura son las dos mitades del GUID armado en crearBorrador
  // (Factura por sí solo es solo la segunda mitad, no sirve como código de generación visible).
  codigoGeneracion(f: FacturaGeneralDto): string {
    return `${String(f.Prefijo ?? '').trim()}${String(f.Factura ?? '').trim()}`;
  }

  // Clave estable por documento (CodGeneracion viene vacío en este listado).
  facturaKey(f: FacturaGeneralDto): string {
    return [f.Prefijo, f.Factura, f.CODIGOSUCURSAL, f.PUNTO_VENTA].map((v) => String(v ?? '').trim()).join('|');
  }

  reimprimir(f: FacturaGeneralDto): void {
    const key = this.facturaKey(f);
    if (this.reimprimiendo()) return;
    this.reimprimiendo.set(key);

    const prefijo = String(f.Prefijo ?? ''), factura = String(f.Factura ?? '');
    // OJO: vwFacturasGeneral.SUCURSAL trae el vendedor (ej. "OFICINA"), no el codigo de sucursal;
    // el codigo real esta en CODIGOSUCURSAL. Usar SUCURSAL aqui hace que GetFacturaDetalle no
    // encuentre lineas (SUCURSAL no matchea) y la reimpresion salga vacia.
    const sucursal = String(f.CODIGOSUCURSAL ?? ''), puntoVenta = String(f.PUNTO_VENTA ?? '');
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
    // item.precio es el precio BASE (mayoreo/normal); el descuento por oferta se guarda aparte
    // en item.descuento (Opcion A, servidor). Se resta aqui para reflejar el neto real.
    return this.redondear((item.precio * item.cantidad) - (item.descuento ?? 0));
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
