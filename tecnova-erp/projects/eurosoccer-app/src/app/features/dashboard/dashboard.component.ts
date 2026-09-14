import { Component, OnInit, OnDestroy, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { switchMap, map } from 'rxjs';
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
import { PosTicketService } from '@app/features/facturacion/pos-hibrido/pos-ticket.service';
import { FacturacionService } from '@app/features/facturacion/services/facturacion';

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
  private ticketService = inject(PosTicketService);
  private facturacionService = inject(FacturacionService);

  activeTab = signal<'dashboard' | 'canchas' | 'balones' | 'torneos' | 'escuela' | 'cafeteria' | 'tienda' | 'admin' | 'inventario'>('canchas');
  adminSubTab = signal<'canchas' | 'balones'>('canchas');

  private static getTodayIso(d: Date = new Date()): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getLocalIsoDate(d: Date = new Date()): string {
    return DashboardComponent.getTodayIso(d);
  }

  selectedDate = signal<string>(DashboardComponent.getTodayIso());
  mobileSidebarOpen = signal<boolean>(false);
  currentDateDisplay = signal<string>('');
  currentTimeDisplay = signal<string>('');
  private clockTimer: any;
  private syncTimer: any;

  // Modo Oscuro / Claro
  isDarkMode = signal<boolean>(true);

  // Kiosk & Multi-Device Sync
  isRefreshing = signal<boolean>(false);
  ultimaSincronizacion = signal<string>('');

  loading = signal<boolean>(false);
  saving = signal<boolean>(false);

  // Horas del timeline deportivo
  horasDia = [
    '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
    '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
    '18:00', '19:00', '20:00', '21:00', '22:00'
  ];

  // Slots táctiles para reservar sin teclado
  duracionSeleccionada = signal<number>(1);
  turnosRapidos = [
    { label: '06:00 - 07:00', inicio: '06:00', fin: '07:00', tipo: 'dia' },
    { label: '07:00 - 08:00', inicio: '07:00', fin: '08:00', tipo: 'dia' },
    { label: '08:00 - 09:00', inicio: '08:00', fin: '09:00', tipo: 'dia' },
    { label: '09:00 - 10:00', inicio: '09:00', fin: '10:00', tipo: 'dia' },
    { label: '14:00 - 15:00', inicio: '14:00', fin: '15:00', tipo: 'dia' },
    { label: '15:00 - 16:00', inicio: '15:00', fin: '16:00', tipo: 'dia' },
    { label: '16:00 - 17:00', inicio: '16:00', fin: '17:00', tipo: 'dia' },
    { label: '17:00 - 18:00', inicio: '17:00', fin: '18:00', tipo: 'dia' },
    { label: '18:00 - 19:00', inicio: '18:00', fin: '19:00', tipo: 'noche' },
    { label: '19:00 - 20:00', inicio: '19:00', fin: '20:00', tipo: 'noche' },
    { label: '20:00 - 21:00', inicio: '20:00', fin: '21:00', tipo: 'noche' },
    { label: '21:00 - 22:00', inicio: '21:00', fin: '22:00', tipo: 'noche' },
    { label: '22:00 - 23:00', inicio: '22:00', fin: '23:00', tipo: 'noche' },
  ];

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

  // Reserva + cobro en un solo paso (cliente paga de contado al reservar)
  pagarAhora = false;
  formaPagoInmediato = 'Efectivo';
  referenciaPagoInmediato = '';

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

  reimprimiendoId = signal<number | null>(null);

  reservaEnCobro: ReservacionCancha | null = null;
  cobroData: CobroReservacionReq = {
    idReservacion: 0,
    montoPago: 0,
    formaPago: 'Efectivo',
    referenciaPago: ''
  };

  ngOnInit(): void {
    this.initTheme();
    this.updateClock();
    this.clockTimer = setInterval(() => this.updateClock(), 1000);

    // Auto-sync polling silencioso cada 12s para sincronizar reservas multi-dispositivo sin F5
    this.syncTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && !this.loading() && !this.displayNuevaReservaModal && !this.displayCobroModal && !this.displayMovimientoModal) {
        this.cargarReservacionesSilencioso();
      }
    }, 12000);

    this.authService.ensureEmpresaSession().subscribe({
      next: () => {
        this.refrescarTodoSilencioso();
        this.cargarInventarioEuro();
      },
      error: () => {
        this.refrescarTodoSilencioso();
        this.cargarInventarioEuro();
      }
    });
  }

  ngOnDestroy(): void {
    if (this.clockTimer) {
      clearInterval(this.clockTimer);
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
  }

  initTheme(): void {
    const savedTheme = localStorage.getItem('euro_theme');
    const isDark = savedTheme !== 'light';
    this.isDarkMode.set(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  toggleTheme(): void {
    const newDark = !this.isDarkMode();
    this.isDarkMode.set(newDark);
    if (newDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('euro_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('euro_theme', 'light');
    }
  }

  refrescarAgenda(): void {
    this.isRefreshing.set(true);
    this.cargarReservaciones();
    this.cargarCanchas();
    this.cargarBalones();
    this.cargarPrestamos();
    setTimeout(() => {
      this.isRefreshing.set(false);
      const now = new Date();
      this.ultimaSincronizacion.set(now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      this.messageService.add({ severity: 'info', summary: 'Sincronizado', detail: 'Agenda y canchas actualizadas.', life: 2000 });
    }, 500);
  }

  refrescarTodoSilencioso(): void {
    this.cargarCanchas();
    this.cargarReservacionesSilencioso();
    this.cargarBalones();
    this.cargarPrestamos();
  }

  cargarReservacionesSilencioso(): void {
    this.euroService.getReservaciones(this.selectedDate()).subscribe({
      next: (data) => {
        this.reservaciones.set(data);
        const now = new Date();
        this.ultimaSincronizacion.set(now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      },
      error: (err) => console.error('Error en sync silencioso de reservas', err)
    });
  }

  toggleMobileSidebar(): void {
    this.mobileSidebarOpen.update(v => !v);
  }

  setFilterDate(offsetDays: number): void {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const dateStr = this.getLocalIsoDate(d);
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

  getCanchaEstadoVivo(cancha: Cancha): {
    estado: 'DISPONIBLE' | 'EN_JUEGO' | 'MANTENIMIENTO';
    badgeLabel: string;
    badgeClass: string;
    reservaActual?: ReservacionCancha;
    tiempoRestanteMin?: number;
  } {
    if (cancha.estado === 'Mantenimiento') {
      return {
        estado: 'MANTENIMIENTO',
        badgeLabel: 'MANTENIMIENTO',
        badgeClass: 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
      };
    }

    const hoyStr = this.getLocalIsoDate();
    if (this.selectedDate() !== hoyStr) {
      return {
        estado: 'DISPONIBLE',
        badgeLabel: 'DISPONIBLE',
        badgeClass: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
      };
    }

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const activa = this.reservaciones().find(r => {
      if (r.idCancha !== cancha.idCancha || r.estado !== 'Reservado') return false;
      const [hIni, mIni] = (r.horaInicio || '00:00').split(':').map(Number);
      const [hFin, mFin] = (r.horaFin || '00:00').split(':').map(Number);
      const iniMin = hIni * 60 + (mIni || 0);
      const finMin = hFin * 60 + (mFin || 0);
      return currentMinutes >= iniMin && currentMinutes < finMin;
    });

    if (activa) {
      const [hFin, mFin] = (activa.horaFin || '00:00').split(':').map(Number);
      const finMin = hFin * 60 + (mFin || 0);
      const restante = Math.max(0, finMin - currentMinutes);
      return {
        estado: 'EN_JUEGO',
        badgeLabel: `EN JUEGO (${restante} min)`,
        badgeClass: 'bg-amber-500/20 text-amber-400 border border-amber-500/30 font-bold',
        reservaActual: activa,
        tiempoRestanteMin: restante
      };
    }

    return {
      estado: 'DISPONIBLE',
      badgeLabel: 'DISPONIBLE',
      badgeClass: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
    };
  }

  getReservaEnHora(idCancha: number, hora: string): ReservacionCancha | undefined {
    const slotHour = parseInt(hora.split(':')[0], 10);
    return this.reservaciones().find(r => {
      if (r.idCancha !== idCancha || r.estado !== 'Reservado') return false;
      const startH = parseInt((r.horaInicio || '00:00').split(':')[0], 10);
      const endH = parseInt((r.horaFin || '00:00').split(':')[0], 10);
      return slotHour >= startH && slotHour < endH;
    });
  }

  openNuevaReservaModal(): void {
    this.nuevaReserva.fecha = this.selectedDate();
    this.nuevaReserva.horaInicio = '18:00';
    this.duracionSeleccionada.set(1);
    this.nuevaReserva.horaFin = '19:00';
    this.nuevaReserva.clienteNombre = '';
    this.nuevaReserva.clienteTelefono = '';
    this.nuevaReserva.montoAnticipo = 0;
    this.nuevaReserva.notas = '';
    this.pagarAhora = false;
    this.formaPagoInmediato = 'Efectivo';
    this.referenciaPagoInmediato = '';
    this.recalcularMontoReserva();
    this.displayNuevaReservaModal = true;
  }

  openNuevaReservaConSlot(idCancha: number, horaInicio?: string): void {
    this.nuevaReserva.idCancha = idCancha;
    this.nuevaReserva.fecha = this.selectedDate();
    const hIni = horaInicio || '18:00';
    this.nuevaReserva.horaInicio = hIni;
    const startH = parseInt(hIni.split(':')[0], 10);
    this.nuevaReserva.horaFin = `${String(startH + this.duracionSeleccionada()).padStart(2, '0')}:00`;
    this.nuevaReserva.clienteNombre = '';
    this.nuevaReserva.clienteTelefono = '';
    this.nuevaReserva.montoAnticipo = 0;
    this.nuevaReserva.notas = '';
    this.pagarAhora = false;
    this.formaPagoInmediato = 'Efectivo';
    this.referenciaPagoInmediato = '';
    this.recalcularMontoReserva();
    this.displayNuevaReservaModal = true;
  }

  private horaAMinutos(hora: string): number {
    const [h, m] = (hora || '00:00').split(':').map(Number);
    return h * 60 + (m || 0);
  }

  /** Un turno pill queda marcado como ocupado si, con la duración elegida, su rango choca con
   * alguna reserva 'Reservado' existente para la misma cancha y fecha (ya cargadas en reservaciones()). */
  esSlotOcupado(horaInicioSlot: string): boolean {
    const idCancha = this.nuevaReserva.idCancha;
    const inicioMin = this.horaAMinutos(horaInicioSlot);
    const finMin = inicioMin + this.duracionSeleccionada() * 60;
    return this.reservaciones().some(r => {
      if (r.idCancha !== idCancha || r.estado !== 'Reservado') return false;
      const rIni = this.horaAMinutos(r.horaInicio);
      const rFin = this.horaAMinutos(r.horaFin);
      return inicioMin < rFin && rIni < finMin;
    });
  }

  horarioSeleccionadoOcupado(): boolean {
    return this.esSlotOcupado(this.nuevaReserva.horaInicio);
  }

  seleccionarTurnoSlot(inicio: string, fin: string): void {
    this.nuevaReserva.horaInicio = inicio;
    const startH = parseInt(inicio.split(':')[0], 10);
    const dur = this.duracionSeleccionada();
    const endH = startH + dur;
    this.nuevaReserva.horaFin = `${String(endH).padStart(2, '0')}:00`;
    this.recalcularMontoReserva();
  }

  setDuracion(dur: number): void {
    this.duracionSeleccionada.set(dur);
    const startH = parseInt((this.nuevaReserva.horaInicio || '18:00').split(':')[0], 10);
    const endH = startH + dur;
    this.nuevaReserva.horaFin = `${String(endH).padStart(2, '0')}:00`;
    this.recalcularMontoReserva();
  }

  setClienteRapido(nombre: string): void {
    this.nuevaReserva.clienteNombre = nombre;
  }

  setAnticipoPorcentaje(pct: number): void {
    this.nuevaReserva.montoAnticipo = Math.round((this.nuevaReserva.montoTotal * pct) * 100) / 100;
  }

  getTarifaVigenteInfo(): { tarifa: number; esNoche: boolean } {
    const cancha = this.canchas().find(c => c.idCancha === this.nuevaReserva.idCancha);
    if (!cancha) return { tarifa: 20, esNoche: false };
    const startH = parseInt((this.nuevaReserva.horaInicio || '18:00').split(':')[0], 10);
    const horaNocheH = parseInt((cancha.horaInicioNoche || '18:00:00').split(':')[0], 10);
    const esNoche = startH >= horaNocheH;
    return {
      tarifa: esNoche ? cancha.precioNoche : cancha.precioDia,
      esNoche
    };
  }

  getSaldoCalculado(): number {
    return Math.max(0, (this.nuevaReserva.montoTotal || 0) - (this.nuevaReserva.montoAnticipo || 0));
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
    const pagarAhora = this.pagarAhora;
    const cancha = this.canchas().find(c => c.idCancha === this.nuevaReserva.idCancha);
    const clienteNombre = this.nuevaReserva.clienteNombre;
    const { fecha, horaInicio, horaFin } = this.nuevaReserva;

    this.euroService.crearReservacion(this.nuevaReserva).subscribe({
      next: (resp) => {
        if (!pagarAhora) {
          this.saving.set(false);
          this.displayNuevaReservaModal = false;
          this.messageService.add({ severity: 'success', summary: 'Reserva creada', detail: 'La reservación se registró correctamente.' });
          this.cargarReservaciones();
          return;
        }

        const descripcion = `Reserva ${cancha?.nombre || ''} ${fecha} ${horaInicio}-${horaFin}`;
        this.crearReciboYCobrar({
          idReservacion: resp.idReservacion,
          clienteNombre,
          descripcion,
          montoPago: resp.montoTotal,
          formaPago: this.formaPagoInmediato,
          referenciaPago: this.referenciaPagoInmediato,
          toastExito: 'La reserva se registró y el cobro se aplicó completo.'
        }, () => {
          this.displayNuevaReservaModal = false;
          this.cargarReservaciones();
        });
      },
      error: (err) => {
        this.saving.set(false);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || 'Error al guardar la reservación.' });
      }
    });
  }

  /** Una reserva con cualquier pago aplicado (parcial o total) ya generó un recibo contable real en
   * Facturacion.FACTURA; cancelarla dejaría ese recibo huérfano. Nunca reversible desde esta pantalla. */
  tienePagoAplicado(res: ReservacionCancha): boolean {
    return (res.montoTotal - res.saldoPendiente) > 0.009 || !!res.idFacturaAnticipo || !!res.idFacturaLiquidacion;
  }

  cancelarReserva(res: ReservacionCancha): void {
    if (this.tienePagoAplicado(res)) {
      this.messageService.add({ severity: 'warn', summary: 'No se puede cancelar', detail: 'Esta reservación ya tiene un pago aplicado y su recibo generado. Contacte a administración si necesita reversarla.', life: 7000 });
      return;
    }
    this.confirmationService.confirm({
      message: '¿Está seguro de cancelar esta reservación?',
      header: 'Confirmar cancelación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, cancelar',
      rejectLabel: 'Volver',
      accept: () => {
        this.euroService.cancelarReservacion(res.idReservacion).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Reserva cancelada', detail: 'La reservación fue cancelada.' });
            this.cargarReservaciones();
          },
          error: (err) => this.messageService.add({ severity: 'error', summary: 'Error', detail: err.error?.message || 'Error al cancelar la reservación.' })
        });
      }
    });
  }

  /** Reimpresión exacta del recibo ya emitido: recupera Prefijo/Factura desde el idFactura persistido
   * en la reserva (GetFacturaKeysById) y reconstruye el ticket con las líneas reales (GetFacturaDetalle),
   * igual que el "reimprimir" de POS Híbrido — nunca desde datos locales que puedan haber quedado desfasados. */
  reimprimirRecibo(res: ReservacionCancha): void {
    const idFactura = res.idFacturaLiquidacion || res.idFacturaAnticipo;
    if (!idFactura) {
      this.messageService.add({ severity: 'warn', summary: 'Sin recibo', detail: 'Esta reservación aún no tiene un recibo generado.' });
      return;
    }
    if (this.reimprimiendoId() !== null) return;
    this.reimprimiendoId.set(idFactura);

    this.facturacionService.getFacturaKeysById(idFactura).pipe(
      switchMap((keys) => this.facturacionService
        .getFacturaDetalle(keys.Prefijo, keys.Factura, keys.Sucursal, keys.PuntoVenta, keys.TipoFactura || 'FAC')
        .pipe(map((detalle) => ({ keys, detalle }))))
    ).subscribe({
      next: ({ keys, detalle }) => {
        this.reimprimiendoId.set(null);
        const lineas = (detalle ?? []).map((dl) => {
          const cantidad = Number(dl.CANTIDAD) || 0;
          const precio = Number(dl.PRECIO_UNITARIO) || 0;
          return {
            cantidad,
            unidad: String(dl.UNIDAD_MEDIDA ?? '').trim(),
            descripcion: String(dl.DESCRIPCION ?? '').trim(),
            precio,
            total: Math.round(cantidad * precio * 100) / 100
          };
        });
        const total = lineas.reduce((a, l) => a + l.total, 0);
        this.ticketService.imprimir({
          nombreEmpresa: 'EuroSoccer Club',
          logoSrc: '',
          clienteNombre: keys.FacturarA || res.clienteNombre,
          fecha: keys.Fecha || res.fecha,
          lineas,
          subtotalBruto: total,
          descuentoTotal: 0,
          total,
          esRecibo: true
        }).then((impreso) => {
          if (!impreso) {
            this.messageService.add({ severity: 'warn', summary: 'Impresión bloqueada', detail: 'El navegador bloqueó la ventana del ticket. Habilite las ventanas emergentes para este sitio e intente de nuevo.', life: 9000 });
          }
        });
      },
      error: () => {
        this.reimprimiendoId.set(null);
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo recuperar el recibo para reimprimir.' });
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
    this.crearReciboYCobrar({
      idReservacion: this.cobroData.idReservacion,
      clienteNombre: reserva.clienteNombre,
      descripcion,
      montoPago: this.cobroData.montoPago,
      formaPago: this.cobroData.formaPago,
      referenciaPago: this.cobroData.referenciaPago,
      toastExito: 'El pago se aplicó a la reservación y se generó el recibo.'
    }, () => {
      this.displayCobroModal = false;
      this.reservaEnCobro = null;
      this.cargarReservaciones();
    });
  }

  /**
   * Recibo contable primero (Facturacion.FACTURA, EsRecibo=1) y solo si tiene éxito aplica el cobro
   * a la reserva: así nunca queda un cobro "aplicado" en Deportes sin su respaldo en factura diaria.
   * Compartido por el cobro manual (guardarCobro) y por "Cliente paga ahora" al crear la reserva.
   */
  private crearReciboYCobrar(
    datos: { idReservacion: number; clienteNombre: string; descripcion: string; montoPago: number; formaPago: string; referenciaPago?: string; toastExito: string },
    onSuccess: () => void
  ): void {
    this.facturacionBridge.crearRecibo({
      clienteNombre: datos.clienteNombre,
      descripcion: datos.descripcion,
      monto: datos.montoPago,
      formaPago: datos.formaPago,
      referenciaPago: datos.referenciaPago
    }).subscribe({
      next: ({ idFactura }) => {
        this.euroService.cobrarReservacion({
          idReservacion: datos.idReservacion,
          montoPago: datos.montoPago,
          formaPago: datos.formaPago,
          referenciaPago: datos.referenciaPago,
          idFactura
        }).subscribe({
          next: () => {
            this.saving.set(false);
            this.messageService.add({ severity: 'success', summary: 'Cobro registrado', detail: datos.toastExito });
            onSuccess();

            const reserva = this.reservaciones().find(r => r.idReservacion === datos.idReservacion) || this.reservaEnCobro;
            const cancha = reserva ? this.canchas().find(c => c.idCancha === reserva.idCancha) : undefined;
            const totalTurno = reserva?.montoTotal || datos.montoPago;
            const saldoRest = Math.max(0, totalTurno - (reserva ? ((reserva.montoAnticipo || 0) + datos.montoPago) : datos.montoPago));
            const startH = parseInt((reserva?.horaInicio || '18:00').split(':')[0], 10);
            const horaNocheH = parseInt((cancha?.horaInicioNoche || '18:00:00').split(':')[0], 10);
            const esNoche = startH >= horaNocheH;

            this.ticketService.imprimir({
              nombreEmpresa: 'EuroSoccer Club',
              logoSrc: '',
              clienteNombre: datos.clienteNombre,
              fecha: new Date().toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
              lineas: [{ cantidad: 1, unidad: 'UND', descripcion: datos.descripcion, precio: datos.montoPago, total: datos.montoPago }],
              subtotalBruto: datos.montoPago,
              descuentoTotal: 0,
              total: datos.montoPago,
              esRecibo: true,
              canchaNombre: cancha?.nombre || (reserva ? reserva.nombreCancha : 'Cancha Sintética'),
              canchaTipo: cancha?.tipo || 'Fútbol 5',
              canchaTurno: reserva ? `${reserva.horaInicio.substring(0, 5)} a ${reserva.horaFin.substring(0, 5)}` : undefined,
              canchaTarifaTipo: esNoche ? 'Tarifa Nocturna Iluminación LED' : 'Tarifa Diurna',
              montoTotalTurno: totalTurno,
              saldoPendiente: saldoRest,
              formaPago: datos.formaPago,
              cajeroNombre: this.authService.currentUser()?.username || 'EuroEmpleado',
              puntoVenta: 'P002'
            }).then((impreso) => {
              if (!impreso) {
                this.messageService.add({ severity: 'warn', summary: 'Impresión bloqueada', detail: 'El navegador bloqueó la ventana del ticket. Habilite las ventanas emergentes para este sitio e intente reimprimir.', life: 9000 });
              }
            });
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
          const cod = g.articulo || g.ARTICULO || g.codigo || '';
          const desc = g.descripcion || g.DESCRIPCION || g.nombre || '';
          const exist = this.inventarioEuro().find(e => e.articulo === cod);
          const precio = g.precioUnitario ?? g.ultimoPrecio ?? g.ULTIMO_PRECIO ?? 0;
          return {
            articulo: cod,
            descripcion: desc,
            precioUnitario: precio,
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
    const cat = this.catalogoArticulos().find(c => (c.articulo || c.ARTICULO || c.codigo) === codigo);
    if (cat) {
      this.movimientoData.descripcion = cat.descripcion || cat.DESCRIPCION || cat.nombre || '';
      this.movimientoData.precioUnitario = cat.precioUnitario ?? cat.ultimoPrecio ?? cat.ULTIMO_PRECIO ?? 0;
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
      fecha: this.getLocalIsoDate(),
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