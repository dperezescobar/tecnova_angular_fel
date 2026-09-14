import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { EuroAuthService } from '../../core/euro-auth.service';
import { FacturacionBridgeService } from '../../core/facturacion-bridge.service';
import {
  EuroSoccerService,
  Cancha,
  ReservacionCancha,
  Balon,
  PrestamoBalon,
  CrearReservacionReq,
  RegistrarPrestamoReq,
  DevolucionBalonReq,
  CobroReservacionReq,
  ArticuloInventario,
  MovimientoInventarioReq,
  DetalleMovimientoReq
} from './eurosoccer.service';
import { PosHibridoComponent } from '@app/features/facturacion/pos-hibrido/pos-hibrido';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, DialogModule, TooltipModule, ConfirmDialogModule, ToastModule, PosHibridoComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit {
  authService = inject(EuroAuthService);
  private euroService = inject(EuroSoccerService);
  private router = inject(Router);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private facturacionBridge = inject(FacturacionBridgeService);

  activeTab = signal<'dashboard' | 'canchas' | 'balones' | 'torneos' | 'escuela' | 'cafeteria' | 'tienda' | 'admin' | 'inventario'>('canchas');
  adminSubTab = signal<'canchas' | 'balones'>('canchas');
  selectedDate = signal<string>(new Date().toISOString().substring(0, 10));
  mobileSidebarOpen = signal<boolean>(false);
  currentDateDisplay = signal<string>('');
  currentTimeDisplay = signal<string>('');
  private clockTimer: any;

  loading = signal<boolean>(false);
  saving = signal<boolean>(false);

  // Estados de Administración (CRUD)
  displayCanchaModal = false;
  displayBalonModal = false;

  canchaEnEdicion: Partial<Cancha> = {
    idCancha: 0,
    nombre: '',
    tipo: 'Futbol 5',
    precioDia: 15.00,
    precioNoche: 20.00,
    horaInicioNoche: '18:00:00',
    estado: 'Disponible',
    activo: true
  };

  balonEnEdicion: Partial<Balon> = {
    idBalon: 0,
    codigo: '',
    marca: '',
    numero: '#5',
    estadoFisico: 'Excelente',
    estadoPrestamo: 'Disponible',
    activo: true
  };

  canchas = signal<Cancha[]>([]);
  reservaciones = signal<ReservacionCancha[]>([]);
  balones = signal<Balon[]>([]);
  prestamosActivos = signal<PrestamoBalon[]>([]);

  balonesDisponibles = computed(() => this.balones().filter(b => b.estadoPrestamo === 'Disponible'));
  balonesDisponiblesCount = computed(() => this.balonesDisponibles().length);

  displayNuevaReservaModal = false;
  displayNuevoPrestamoModal = false;
  displayDevolucionModal = false;
  displayCobroModal = false;

  nuevaReserva: CrearReservacionReq = {
    idCancha: 1,
    fecha: '',
    horaInicio: '18:00',
    horaFin: '19:00',
    clienteNombre: '',
    clienteTelefono: '',
    montoTotal: 20.00,
    montoAnticipo: 0.00,
    notas: ''
  };

  nuevoPrestamo: RegistrarPrestamoReq = {
    idBalon: 0,
    responsable: '',
    documentoIdentidad: '',
    observacionesSalida: ''
  };

  prestamoSeleccionado: PrestamoBalon | null = null;
  devolucionData: DevolucionBalonReq = {
    idPrestamo: 0,
    estadoFisicoRetorno: 'Excelente',
    observacionesEntrega: ''
  };

  reservaEnCobro: ReservacionCancha | null = null;
  cobroData: CobroReservacionReq = {
    idReservacion: 0,
    montoPago: 0,
    formaPago: 'Efectivo',
    referenciaPago: ''
  };

  ngOnInit(): void {
    this.updateClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);

    this.authService.ensureEmpresaSession().subscribe({
      next: () => {
        this.cargarCanchas();
        this.cargarReservaciones();
        this.cargarBalones();
        this.cargarPrestamos();
        this.cargarInventarioEuro();
      },
      error: () => {
        this.cargarCanchas();
        this.cargarReservaciones();
        this.cargarBalones();
        this.cargarPrestamos();
        this.cargarInventarioEuro();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }
  }

  toggleMobileSidebar(): void {
    this.mobileSidebarOpen.update(v => !v);
  }

  setFilterDate(offsetDays: number): void {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const dateStr = d.toISOString().substring(0, 10);
    this.selectedDate.set(dateStr);
    this.cargarReservaciones();
  }

  private updateClock(): void {
    const now = new Date();
    const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
    this.currentDateDisplay.set(now.toLocaleDateString('es-ES', options));
    this.currentTimeDisplay.set(now.toLocaleTimeString('es-ES'));
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  cargarCanchas(): void {
    this.euroService.getCanchas().subscribe({
      next: (data) => {
        this.canchas.set(data);
        if (data.length > 0 && this.nuevaReserva.idCancha === 1) {
          this.nuevaReserva.idCancha = data[0].idCancha;
        }
      },
      error: (err) => console.error('Error cargando canchas', err)
    });
  }

  cargarReservaciones(): void {
    this.loading.set(true);
    this.euroService.getReservaciones(this.selectedDate()).subscribe({
      next: (data) => {
        this.reservaciones.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error cargando reservas', err);
        this.loading.set(false);
      }
    });
  }

  cargarBalones(): void {
    this.euroService.getBalones().subscribe({
      next: (data) => this.balones.set(data),
      error: (err) => console.error('Error cargando balones', err)
    });
  }

  cargarPrestamos(): void {
    this.euroService.getPrestamosActivos().subscribe({
      next: (data) => this.prestamosActivos.set(data),
      error: (err) => console.error('Error cargando préstamos', err)
    });
  }

  onDateChange(newDate: string): void {
    if (newDate) {
      this.selectedDate.set(newDate);
      this.cargarReservaciones();
    }
  }

  openNuevaReservaModal(): void {
    this.nuevaReserva.fecha = this.selectedDate();
    this.nuevaReserva.horaInicio = '18:00';
    this.nuevaReserva.horaFin = '19:00';
    this.nuevaReserva.clienteNombre = '';
    this.nuevaReserva.clienteTelefono = '';
    this.recalcularMontoReserva();
    this.displayNuevaReservaModal = true;
  }

  recalcularMontoReserva(): void {
    // Vista previa: el monto real y definitivo siempre lo calcula el backend en CrearReservacion.
    const cancha = this.canchas().find(c => c.idCancha === this.nuevaReserva.idCancha);
    if (!cancha) return;

    const startH = parseInt(this.nuevaReserva.horaInicio.split(':')[0] || '18', 10);
    const endH = parseInt(this.nuevaReserva.horaFin.split(':')[0] || '19', 10);
    const horas = Math.max(1, endH - startH);

    const horaNocheH = parseInt((cancha.horaInicioNoche || '18:00:00').split(':')[0], 10);
    const tarifa = startH >= horaNocheH ? cancha.precioNoche : cancha.precioDia;
    this.nuevaReserva.montoTotal = tarifa * horas;
  }

  guardarReserva(): void {
    if (!this.nuevaReserva.clienteNombre.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Falta información', detail: 'Por favor ingrese el nombre del cliente.' });
      return;
    }

    this.saving.set(true);
    this.nuevaReserva.fecha = this.selectedDate();
    this.euroService.crearReservacion(this.nuevaReserva).subscribe({
      next: () => {
        this.saving.set(false);
        this.displayNuevaReservaModal = false;
        this.messageService.add({ severity: 'success', summary: 'Reserva creada', detail: 'La reservación se registró correctamente.' });
        this.cargarReservaciones();
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || 'Error al guardar la reservación.' });
      }
    });
  }

  cancelarReserva(id: number): void {
    this.confirmationService.confirm({
      message: '¿Está seguro de cancelar esta reservación?',
      header: 'Confirmar cancelación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, cancelar',
      rejectLabel: 'Volver',
      accept: () => {
        this.euroService.cancelarReservacion(id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Reserva cancelada', detail: 'La reservación fue cancelada.' });
            this.cargarReservaciones();
          },
          error: (err) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || 'Error al cancelar la reservación.' })
        });
      }
    });
  }

  abrirModalCobro(res: ReservacionCancha): void {
    this.reservaEnCobro = res;
    this.cobroData = {
      idReservacion: res.idReservacion,
      montoPago: Math.max(0, res.saldoPendiente),
      formaPago: 'Efectivo',
      referenciaPago: ''
    };
    this.displayCobroModal = true;
  }

  guardarCobro(): void {
    if (!this.cobroData.montoPago || this.cobroData.montoPago <= 0) {
      this.messageService.add({ severity: 'warn', summary: 'Falta información', detail: 'El monto del pago debe ser mayor a cero.' });
      return;
    }
    if (!this.reservaEnCobro) return;

    const reserva = this.reservaEnCobro;
    const descripcion = `Reserva ${reserva.nombreCancha} ${reserva.fecha.substring(0, 10)} ${reserva.horaInicio.substring(0, 5)}-${reserva.horaFin.substring(0, 5)}`;

    this.saving.set(true);
    // 1) Recibo contable primero (Facturacion.FACTURA, EsRecibo=1). Si falla, no se toca la reserva:
    // así nunca queda un cobro "aplicado" en Deportes sin su respaldo en factura diaria.
    this.facturacionBridge.crearRecibo({
      clienteNombre: reserva.clienteNombre,
      descripcion,
      monto: this.cobroData.montoPago,
      formaPago: this.cobroData.formaPago,
      referenciaPago: this.cobroData.referenciaPago
    }).subscribe({
      next: ({ idFactura }) => {
        this.euroService.cobrarReservacion({ ...this.cobroData, idFactura }).subscribe({
          next: () => {
            this.saving.set(false);
            this.displayCobroModal = false;
            this.reservaEnCobro = null;
            this.messageService.add({ severity: 'success', summary: 'Cobro registrado', detail: 'El pago se aplicó a la reservación y se generó el recibo.' });
            this.cargarReservaciones();
          },
          error: (err) => {
            this.saving.set(false);
            this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || 'El recibo se creó pero no se pudo aplicar el cobro a la reserva. Contacte a administración.' });
          }
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || err.message || 'Error al generar el recibo contable.' });
      }
    });
  }

  openNuevoPrestamoModal(): void {
    const disp = this.balonesDisponibles();
    this.nuevoPrestamo = {
      idBalon: disp.length > 0 ? disp[0].idBalon : 0,
      responsable: '',
      documentoIdentidad: '',
      observacionesSalida: ''
    };
    this.displayNuevoPrestamoModal = true;
  }

  guardarPrestamo(): void {
    if (!this.nuevoPrestamo.responsable.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Falta información', detail: 'Por favor indique el responsable del préstamo.' });
      return;
    }

    this.saving.set(true);
    this.euroService.registrarPrestamo(this.nuevoPrestamo).subscribe({
      next: () => {
        this.saving.set(false);
        this.displayNuevoPrestamoModal = false;
        this.messageService.add({ severity: 'success', summary: 'Préstamo registrado', detail: 'El balón fue entregado correctamente.' });
        this.cargarBalones();
        this.cargarPrestamos();
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || 'Error al registrar el préstamo.' });
      }
    });
  }

  openDevolucionModal(p: PrestamoBalon): void {
    this.prestamoSeleccionado = p;
    this.devolucionData = {
      idPrestamo: p.idPrestamo,
      estadoFisicoRetorno: 'Excelente',
      observacionesEntrega: ''
    };
    this.displayDevolucionModal = true;
  }

  confirmarDevolucion(): void {
    this.saving.set(true);
    this.euroService.devolverBalon(this.devolucionData).subscribe({
      next: () => {
        this.saving.set(false);
        this.displayDevolucionModal = false;
        this.prestamoSeleccionado = null;
        this.messageService.add({ severity: 'success', summary: 'Balón recibido', detail: 'La devolución se registró correctamente.' });
        this.cargarBalones();
        this.cargarPrestamos();
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || 'Error al procesar devolución.' });
      }
    });
  }

  // ==========================================
  // MÉTODOS CRUD ADMINISTRACIÓN
  // ==========================================
  abrirModalNuevaCancha(): void {
    this.canchaEnEdicion = {
      idCancha: 0,
      nombre: '',
      tipo: 'Futbol 5',
      precioDia: 15.00,
      precioNoche: 20.00,
      horaInicioNoche: '18:00:00',
      estado: 'Disponible',
      activo: true
    };
    this.displayCanchaModal = true;
  }

  abrirModalEditarCancha(c: Cancha): void {
    this.canchaEnEdicion = { ...c };
    this.displayCanchaModal = true;
  }

  guardarCancha(): void {
    if (!this.canchaEnEdicion.nombre?.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Falta información', detail: 'Por favor ingrese el nombre de la cancha.' });
      return;
    }
    this.saving.set(true);
    this.euroService.guardarCancha(this.canchaEnEdicion).subscribe({
      next: () => {
        this.saving.set(false);
        this.displayCanchaModal = false;
        this.messageService.add({ severity: 'success', summary: 'Cancha guardada', detail: 'Los cambios se guardaron correctamente.' });
        this.cargarCanchas();
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || 'Error al guardar cancha.' });
      }
    });
  }

  eliminarCancha(id: number): void {
    this.confirmationService.confirm({
      message: '¿Está seguro de desactivar esta cancha?',
      header: 'Confirmar desactivación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, desactivar',
      rejectLabel: 'Volver',
      accept: () => {
        this.euroService.eliminarCancha(id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Cancha desactivada', detail: 'La cancha fue desactivada.' });
            this.cargarCanchas();
          },
          error: (err) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || 'Error al eliminar cancha.' })
        });
      }
    });
  }

  abrirModalNuevoBalon(): void {
    this.balonEnEdicion = {
      idBalon: 0,
      codigo: '',
      marca: '',
      numero: '#5',
      estadoFisico: 'Excelente',
      estadoPrestamo: 'Disponible',
      activo: true
    };
    this.displayBalonModal = true;
  }

  abrirModalEditarBalon(b: Balon): void {
    this.balonEnEdicion = { ...b };
    this.displayBalonModal = true;
  }

  guardarBalon(): void {
    if (!this.balonEnEdicion.codigo?.trim() || !this.balonEnEdicion.marca?.trim()) {
      this.messageService.add({ severity: 'warn', summary: 'Falta información', detail: 'Por favor complete código y marca del balón.' });
      return;
    }
    this.saving.set(true);
    this.euroService.guardarBalon(this.balonEnEdicion).subscribe({
      next: () => {
        this.saving.set(false);
        this.displayBalonModal = false;
        this.messageService.add({ severity: 'success', summary: 'Balón guardado', detail: 'Los cambios se guardaron correctamente.' });
        this.cargarBalones();
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || 'Error al guardar balón.' });
      }
    });
  }

  eliminarBalon(id: number): void {
    this.confirmationService.confirm({
      message: '¿Está seguro de desactivar este balón del inventario?',
      header: 'Confirmar desactivación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, desactivar',
      rejectLabel: 'Volver',
      accept: () => {
        this.euroService.eliminarBalon(id).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Balón desactivado', detail: 'El balón fue desactivado.' });
            this.cargarBalones();
          },
          error: (err) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || 'Error al eliminar balón.' })
        });
      }
    });
  }

  // ==========================================
  // ESTADO DE INVENTARIO EUROSOCCER (BODEURO)
  // ==========================================
  inventarioEuro = signal<ArticuloInventario[]>([]);
  catalogoArticulos = signal<any[]>([]);
  loadingInventario = signal<boolean>(false);
  inventarioBusqueda = signal<string>('');

  articulosInventarioFiltrados = computed(() => {
    const q = this.inventarioBusqueda().trim().toLowerCase();
    const items = this.inventarioEuro();
    if (!q) return items;
    return items.filter(a =>
      (a.articulo && a.articulo.toLowerCase().includes(q)) ||
      (a.descripcion && a.descripcion.toLowerCase().includes(q))
    );
  });

  // Modal para operaciones de inventario
  displayMovimientoModal = false;
  tipoMovimiento = signal<'INGRESO' | 'SALIDA' | 'TRASLADO'>('INGRESO');
  movimientoData = {
    articulo: '',
    descripcion: '',
    cantidad: 1,
    precioUnitario: 0,
    comentario: '',
    bodegaOrigen: 'BODEURO',
    bodegaDestino: 'BODEURO'
  };

  articulosDisponiblesParaOperacion = computed(() => {
    if (this.tipoMovimiento() === 'INGRESO') {
      const general = this.catalogoArticulos();
      if (general.length > 0) {
        return general.map(g => {
          const cod = g.articulo || g.codigo || '';
          const desc = g.descripcion || g.nombre || '';
          const exist = this.inventarioEuro().find(e => e.articulo === cod);
          return {
            articulo: cod,
            descripcion: desc,
            precioUnitario: g.precioUnitario || g.ultimoPrecio || 0,
            saldo: exist?.saldo || 0
          };
        });
      }
      return this.inventarioEuro().map(e => ({
        articulo: e.articulo,
        descripcion: e.descripcion,
        precioUnitario: e.precioUnitario || 0,
        saldo: e.saldo
      }));
    } else {
      return this.inventarioEuro().map(e => ({
        articulo: e.articulo,
        descripcion: e.descripcion,
        precioUnitario: e.precioUnitario || 0,
        saldo: e.saldo
      }));
    }
  });

  cargarInventarioEuro(): void {
    this.loadingInventario.set(true);
    this.euroService.getExistenciasEuro().subscribe({
      next: (data) => {
        this.inventarioEuro.set(data || []);
        this.loadingInventario.set(false);
      },
      error: () => {
        this.inventarioEuro.set([]);
        this.loadingInventario.set(false);
      }
    });
    if (this.catalogoArticulos().length === 0) {
      this.euroService.getCatalogoGeneral().subscribe({
        next: (items) => this.catalogoArticulos.set(items || []),
        error: () => this.catalogoArticulos.set([])
      });
    }
  }

  abrirModalMovimiento(tipo: 'INGRESO' | 'SALIDA' | 'TRASLADO', item?: ArticuloInventario): void {
    this.tipoMovimiento.set(tipo);
    const articulos = this.articulosDisponiblesParaOperacion();
    const artInicial = item ? item.articulo : (articulos.length > 0 ? articulos[0].articulo : '');

    this.movimientoData = {
      articulo: artInicial,
      descripcion: item ? item.descripcion : '',
      cantidad: 1,
      precioUnitario: item ? (item.precioUnitario || 0) : 0,
      comentario: '',
      bodegaOrigen: 'BODEURO',
      bodegaDestino: tipo === 'TRASLADO' ? 'BOD01' : 'BODEURO'
    };

    if (artInicial) {
      this.onArticuloMovimientoChange(artInicial);
    }
    this.displayMovimientoModal = true;
  }

  onArticuloMovimientoChange(codigo: string): void {
    const exist = this.inventarioEuro().find(i => i.articulo === codigo);
    if (exist) {
      this.movimientoData.descripcion = exist.descripcion;
      this.movimientoData.precioUnitario = exist.precioUnitario || 0;
      return;
    }
    const cat = this.catalogoArticulos().find(c => (c.articulo || c.codigo) === codigo);
    if (cat) {
      this.movimientoData.descripcion = cat.descripcion || cat.nombre || '';
      this.movimientoData.precioUnitario = cat.precioUnitario || cat.ultimoPrecio || 0;
    }
  }

  ejecutarMovimientoInventario(): void {
    if (!this.movimientoData.articulo) {
      this.messageService.add({ severity: 'warn', summary: 'Inventario', detail: 'Debe seleccionar un producto.' });
      return;
    }
    if (!this.movimientoData.cantidad || this.movimientoData.cantidad <= 0) {
      this.messageService.add({ severity: 'warn', summary: 'Inventario', detail: 'La cantidad debe ser mayor a 0.' });
      return;
    }

    const tipo = this.tipoMovimiento();
    let trans = 'ENT';
    let mov = 'I';
    let corre = 'EN';
    let bodDestino = 'BODEURO';

    // Regla de negocio no negociable para EuroSoccer:
    // Origen SIEMPRE BODEURO
    const bodOrigen = 'BODEURO';

    if (tipo === 'SALIDA') {
      trans = 'SAL';
      mov = 'S';
      corre = 'SA';
      bodDestino = 'BODEURO';
    } else if (tipo === 'TRASLADO') {
      trans = 'TRAF';
      mov = 'T';
      corre = 'TR';
      bodDestino = 'BOD01'; // Solo puede remitir a la central BOD01
    }

    // Validar saldo para SALIDA o TRASLADO
    if (tipo === 'SALIDA' || tipo === 'TRASLADO') {
      const art = this.inventarioEuro().find(i => i.articulo === this.movimientoData.articulo);
      if (art && art.saldo < this.movimientoData.cantidad) {
        this.messageService.add({
          severity: 'error',
          summary: 'Stock insuficiente',
          detail: `Stock disponible en BODEURO: ${art.saldo}. Solicitado: ${this.movimientoData.cantidad}`
        });
        return;
      }
    }

    const username = this.authService.currentUser()?.username ?? 'euroadmin';
    const comentario = this.movimientoData.comentario?.trim() ||
      (tipo === 'INGRESO' ? 'Ingreso de mercadería EuroSoccer' :
       tipo === 'SALIDA' ? 'Salida/descargo EuroSoccer' :
       'Traslado de existencias EuroSoccer -> Bodega General');

    const reqMaestro: MovimientoInventarioReq = {
      documentoInv: 0,
      correlativoInv: corre,
      fecha: new Date().toISOString().substring(0, 10),
      comentario: comentario,
      bodega: bodOrigen,
      bodegaDestino: bodDestino,
      tipoTransInv: trans,
      tipoMov: mov,
      contabilizar: 0,
      tipoMtto: 'A',
      sucursal: 'SC0001',
      documentoSujetoDevolucion: false,
      existenciaFecDoc: 0,
      usuario: username
    };

    this.saving.set(true);
    this.euroService.guardarMovimiento(reqMaestro).subscribe({
      next: (resp) => {
        const docId = resp.documentoInv;
        const reqDetalle: DetalleMovimientoReq = {
          documentoInv: docId,
          articulo: this.movimientoData.articulo,
          cantidad: this.movimientoData.cantidad,
          precioUnitario: this.movimientoData.precioUnitario || 0,
          usuario: username
        };

        this.euroService.guardarDetalleMovimiento(reqDetalle).subscribe({
          next: () => {
            // Aplicar automáticamente para actualizar kardex y existencias
            this.euroService.aplicarMovimiento(docId).subscribe({
              next: () => {
                this.saving.set(false);
                this.displayMovimientoModal = false;
                this.messageService.add({
                  severity: 'success',
                  summary: 'Inventario Actualizado',
                  detail: `${tipo === 'INGRESO' ? 'Ingreso' : tipo === 'SALIDA' ? 'Salida' : 'Traslado a General'} #${docId} aplicado con éxito.`
                });
                this.cargarInventarioEuro();
              },
              error: (err) => {
                this.saving.set(false);
                this.displayMovimientoModal = false;
                this.messageService.add({
                  severity: 'warn',
                  summary: 'Documento Guardado',
                  detail: `Guardado como #${docId} en elaboración. Error al aplicar automático: ${err.error?.message || err.message}`
                });
                this.cargarInventarioEuro();
              }
            });
          },
          error: (err) => {
            this.saving.set(false);
            this.messageService.add({
              severity: 'error',
              summary: 'Error al agregar producto',
              detail: err.error?.message || 'Error al guardar el detalle del movimiento.'
            });
          }
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error al crear documento',
          detail: err.error?.message || 'Error al procesar el encabezado del inventario.'
        });
      }
    });
  }
}