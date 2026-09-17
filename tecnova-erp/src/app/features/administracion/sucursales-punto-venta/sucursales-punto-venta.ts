import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TabsModule } from 'primeng/tabs';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';

import { SucursalesPuntoVentaService } from '../services/sucursales-punto-venta';
import { UsuariosAdminService } from '../services/usuarios-admin';
import { AuthService } from '../../../core/services/auth';
import {
  BodegaCatalogo,
  CondicionPago,
  PuntoVentaListado,
  Sucursal,
  Vendedor,
  VendedorPuntoVenta
} from '../../../core/models/sucursales-punto-venta.models';
import { UsuarioListado } from '../../../core/models/usuarios-admin.models';

@Component({
  selector: 'app-sucursales-punto-venta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    CardModule,
    SelectModule,
    ProgressSpinnerModule,
    MessageModule,
    ToastModule,
    ConfirmDialogModule,
    TabsModule,
    TooltipModule
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './sucursales-punto-venta.html',
  styleUrls: ['./sucursales-punto-venta.scss']
})
export class SucursalesPuntoVentaComponent {
  private service = inject(SucursalesPuntoVentaService);
  private usuariosService = inject(UsuariosAdminService);
  private authService = inject(AuthService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private fb = inject(FormBuilder);

  private readonly idSistema = 2;

  activeTab = signal<'sucursales' | 'puntos-venta'>('sucursales');

  // ===== Sucursales =====
  sucursales = signal<Sucursal[]>([]);
  loadingSucursales = signal(false);
  filterSucursales = signal('');
  showSucursalForm = signal(false);
  isEditSucursal = signal(false);
  savingSucursal = signal(false);
  errorSucursal = signal('');

  sucursalForm = this.fb.group({
    sucursal: ['', [Validators.required, Validators.maxLength(10)]],
    descripcion: ['', [Validators.required, Validators.maxLength(50)]],
    direccion: ['', [Validators.maxLength(150)]],
    telefono: ['', [Validators.maxLength(10)]],
    responsable: ['', [Validators.maxLength(50)]],
    codigoMH: ['', [Validators.maxLength(10)]]
  });

  filteredSucursales = computed(() => {
    const term = this.filterSucursales().trim().toLowerCase();
    const lista = this.sucursales();
    if (!term) return lista;
    return lista.filter((s) => s.sucursal.toLowerCase().includes(term) || s.descripcion.toLowerCase().includes(term));
  });

  sucursalOptions = computed(() => this.sucursales().map((s) => ({ label: `${s.sucursal} - ${s.descripcion}`, value: s.sucursal })));

  // ===== Puntos de venta =====
  puntosVenta = signal<PuntoVentaListado[]>([]);
  loadingPV = signal(false);
  filterPV = signal('');
  condicionesPago = signal<CondicionPago[]>([]);
  bodegas = signal<BodegaCatalogo[]>([]);
  savingBodegaPV = signal<string | null>(null);
  showPVForm = signal(false);
  isEditPV = signal(false);
  editingPV = signal<{ sucursal: string; puntoVenta: string } | null>(null);
  savingPV = signal(false);
  errorPV = signal('');

  pvForm = this.fb.group({
    puntoVenta: ['', [Validators.required, Validators.maxLength(10)]],
    sucursal: ['', [Validators.required]],
    descripcion: ['', [Validators.required, Validators.maxLength(60)]],
    codigoMH: ['', [Validators.maxLength(10)]],
    condicionPago: ['']
  });

  filteredPuntosVenta = computed(() => {
    const term = this.filterPV().trim().toLowerCase();
    const lista = this.puntosVenta();
    if (!term) return lista;
    return lista.filter(
      (p) =>
        p.puntoVenta.toLowerCase().includes(term) ||
        p.descripcion.toLowerCase().includes(term) ||
        p.sucursalDescripcion.toLowerCase().includes(term)
    );
  });

  condicionPagoOptions = computed(() => this.condicionesPago().map((c) => ({ label: c.descripcion, value: c.condicionPago })));
  bodegaOptions = computed(() => this.bodegas().map((b) => ({ label: `${b.bodega} - ${b.descripcion}`, value: b.bodega })));

  // ===== Usuarios/Vendedores asignados (solo al editar un punto de venta existente) =====
  usuariosAsignados = signal<string[]>([]);
  vendedoresAsignados = signal<VendedorPuntoVenta[]>([]);
  usuariosCatalogo = signal<UsuarioListado[]>([]);
  vendedoresCatalogo = signal<Vendedor[]>([]);
  usuarioSeleccionado = signal<string | null>(null);
  vendedorSeleccionado = signal<string | null>(null);
  loadingAsignaciones = signal(false);
  savingAsignacionUsuario = signal(false);
  savingAsignacionVendedor = signal(false);

  usuariosDisponibles = computed(() => {
    const asignados = new Set(this.usuariosAsignados());
    return this.usuariosCatalogo()
      .filter((u) => !asignados.has(u.usuario))
      .map((u) => ({ label: `${u.usuario} - ${u.nombre}`, value: u.usuario }));
  });

  vendedoresDisponibles = computed(() => {
    const asignados = new Set(this.vendedoresAsignados().map((v) => v.vendedor));
    return this.vendedoresCatalogo()
      .filter((v) => !asignados.has(v.vendedor))
      .map((v) => ({ label: `${v.vendedor} - ${v.nombre}`, value: v.vendedor }));
  });

  constructor() {
    this.loadSucursales();
    this.loadPuntosVenta();
    this.service.getCondicionesPago().subscribe({ next: (c) => this.condicionesPago.set(c ?? []) });
    this.service.getBodegasCatalogo().subscribe({ next: (b) => this.bodegas.set(b ?? []) });
  }

  onTabChange(value: string | number | undefined) {
    if (value === 'sucursales' || value === 'puntos-venta') {
      this.activeTab.set(value);
    }
  }

  // ===== Sucursales =====

  loadSucursales() {
    this.loadingSucursales.set(true);
    this.errorSucursal.set('');
    this.service
      .getSucursales()
      .pipe(finalize(() => this.loadingSucursales.set(false)))
      .subscribe({
        next: (lista) => this.sucursales.set(lista ?? []),
        error: () => this.errorSucursal.set('No se pudo cargar el listado de sucursales.')
      });
  }

  openCreateSucursal() {
    this.isEditSucursal.set(false);
    this.showSucursalForm.set(true);
    this.errorSucursal.set('');
    this.sucursalForm.reset({ sucursal: '', descripcion: '', direccion: '', telefono: '', responsable: '', codigoMH: '' });
    this.sucursalForm.controls.sucursal.enable();
  }

  openEditSucursal(sucursal: Sucursal) {
    this.isEditSucursal.set(true);
    this.showSucursalForm.set(true);
    this.errorSucursal.set('');
    this.sucursalForm.reset({ ...sucursal });
    this.sucursalForm.controls.sucursal.disable();
  }

  closeSucursalForm() {
    this.showSucursalForm.set(false);
    this.sucursalForm.controls.sucursal.enable();
  }

  guardarSucursal() {
    if (this.sucursalForm.invalid) {
      this.sucursalForm.markAllAsTouched();
      return;
    }

    const value = this.sucursalForm.getRawValue();
    this.savingSucursal.set(true);
    this.errorSucursal.set('');

    const payload = {
      sucursal: value.sucursal ?? '',
      descripcion: value.descripcion ?? '',
      direccion: value.direccion ?? '',
      telefono: value.telefono ?? '',
      responsable: value.responsable ?? '',
      codigoMH: value.codigoMH ?? ''
    };

    const request$ = this.isEditSucursal()
      ? this.service.editarSucursal(payload.sucursal, payload)
      : this.service.crearSucursal(payload);

    request$.pipe(finalize(() => this.savingSucursal.set(false))).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Sucursal guardada', detail: payload.sucursal });
        this.closeSucursalForm();
        this.loadSucursales();
      },
      error: (err) => this.errorSucursal.set(err?.error?.message ?? 'No se pudo guardar la sucursal.')
    });
  }

  solicitarEliminarSucursal(sucursal: Sucursal) {
    this.confirmationService.confirm({
      header: 'Eliminar sucursal',
      message: `¿Desea eliminar la sucursal ${sucursal.sucursal}? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.service.eliminarSucursal(sucursal.sucursal).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Sucursal eliminada', detail: sucursal.sucursal });
            this.loadSucursales();
          },
          error: (err) =>
            this.messageService.add({
              severity: 'error',
              summary: 'No se pudo eliminar',
              detail: err?.error?.message ?? 'Ocurrió un error al eliminar la sucursal.'
            })
        });
      }
    });
  }

  // ===== Puntos de venta =====

  loadPuntosVenta() {
    this.loadingPV.set(true);
    this.errorPV.set('');
    this.service
      .getPuntosVenta()
      .pipe(finalize(() => this.loadingPV.set(false)))
      .subscribe({
        next: (lista) => this.puntosVenta.set(lista ?? []),
        error: () => this.errorPV.set('No se pudo cargar el listado de puntos de venta.')
      });
  }

  openCreatePV() {
    this.isEditPV.set(false);
    this.editingPV.set(null);
    this.showPVForm.set(true);
    this.errorPV.set('');
    this.usuariosAsignados.set([]);
    this.vendedoresAsignados.set([]);
    this.pvForm.reset({ puntoVenta: '', sucursal: '', descripcion: '', codigoMH: '', condicionPago: '' });
    this.pvForm.controls.puntoVenta.enable();
    this.pvForm.controls.sucursal.enable();
  }

  openEditPV(pv: PuntoVentaListado) {
    this.isEditPV.set(true);
    this.editingPV.set({ sucursal: pv.sucursal, puntoVenta: pv.puntoVenta });
    this.showPVForm.set(true);
    this.errorPV.set('');
    this.pvForm.reset({
      puntoVenta: pv.puntoVenta,
      sucursal: pv.sucursal,
      descripcion: pv.descripcion,
      codigoMH: pv.codigoMH,
      condicionPago: pv.condicionPago
    });
    this.pvForm.controls.puntoVenta.disable();
    this.pvForm.controls.sucursal.disable();
    this.cargarAsignaciones(pv.sucursal, pv.puntoVenta);
  }

  closePVForm() {
    this.showPVForm.set(false);
    this.pvForm.controls.puntoVenta.enable();
    this.pvForm.controls.sucursal.enable();
  }

  guardarPV() {
    if (this.pvForm.invalid) {
      this.pvForm.markAllAsTouched();
      return;
    }

    const value = this.pvForm.getRawValue();
    const payload = {
      puntoVenta: value.puntoVenta ?? '',
      sucursal: value.sucursal ?? '',
      descripcion: value.descripcion ?? '',
      codigoMH: value.codigoMH ?? '',
      condicionPago: value.condicionPago ?? ''
    };

    this.savingPV.set(true);
    this.errorPV.set('');

    if (this.isEditPV()) {
      this.service
        .editarPuntoVenta(payload.sucursal, payload.puntoVenta, payload)
        .pipe(finalize(() => this.savingPV.set(false)))
        .subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Punto de venta actualizado', detail: payload.puntoVenta });
            this.closePVForm();
            this.loadPuntosVenta();
          },
          error: (err) => this.errorPV.set(err?.error?.message ?? 'No se pudo actualizar el punto de venta.')
        });
      return;
    }

    this.service
      .crearPuntoVenta(payload)
      .pipe(finalize(() => this.savingPV.set(false)))
      .subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Punto de venta creado', detail: payload.puntoVenta });
          this.loadPuntosVenta();
          // Continúa en modo edición para permitir asignar usuarios/vendedores de una vez
          this.isEditPV.set(true);
          this.editingPV.set({ sucursal: payload.sucursal, puntoVenta: payload.puntoVenta });
          this.pvForm.controls.puntoVenta.disable();
          this.pvForm.controls.sucursal.disable();
          this.cargarAsignaciones(payload.sucursal, payload.puntoVenta);
        },
        error: (err) => this.errorPV.set(err?.error?.message ?? 'No se pudo crear el punto de venta.')
      });
  }

  solicitarEliminarPV(pv: PuntoVentaListado) {
    this.confirmationService.confirm({
      header: 'Eliminar punto de venta',
      message: `¿Desea eliminar el punto de venta ${pv.puntoVenta}? No podrá eliminarse si tiene facturas asociadas.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.service.eliminarPuntoVenta(pv.sucursal, pv.puntoVenta).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Punto de venta eliminado', detail: pv.puntoVenta });
            this.loadPuntosVenta();
          },
          error: (err) =>
            this.messageService.add({
              severity: 'error',
              summary: 'No se pudo eliminar',
              detail: err?.error?.message ?? 'Ocurrió un error al eliminar el punto de venta.'
            })
        });
      }
    });
  }

  actualizarBodegaPV(pv: PuntoVentaListado, bodega: string) {
    if (!bodega || bodega === pv.bodegaAsignada) return;

    const key = `${pv.sucursal}|${pv.puntoVenta}`;
    this.savingBodegaPV.set(key);
    this.service
      .actualizarBodegaPuntoVenta(pv.sucursal, pv.puntoVenta, bodega)
      .pipe(finalize(() => this.savingBodegaPV.set(null)))
      .subscribe({
        next: () => {
          this.puntosVenta.update((lista) =>
            lista.map((item) => (item.sucursal === pv.sucursal && item.puntoVenta === pv.puntoVenta ? { ...item, bodegaAsignada: bodega } : item))
          );
          this.messageService.add({ severity: 'success', summary: 'Bodega asignada', detail: `${pv.puntoVenta} -> ${bodega}` });
        },
        error: (err) => {
          // El select ya refleja visualmente la selección del usuario aunque el guardado falló;
          // se recarga desde el servidor para que el combo vuelva al valor real (PrimeNG no revierte
          // su ngModel solo con un cambio de referencia local).
          this.loadPuntosVenta();
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo asignar la bodega',
            detail: err?.error?.message ?? 'Ocurrió un error al asignar la bodega.'
          });
        }
      });
  }

  // ===== Usuarios/Vendedores asignados =====

  private cargarAsignaciones(sucursal: string, puntoVenta: string) {
    this.loadingAsignaciones.set(true);

    this.service.getUsuariosPuntoVenta(sucursal, puntoVenta).subscribe({
      next: (lista) => this.usuariosAsignados.set(lista ?? []),
      error: () => this.usuariosAsignados.set([])
    });

    this.service.getVendedoresPuntoVenta(sucursal, puntoVenta).subscribe({
      next: (lista) => this.vendedoresAsignados.set(lista ?? []),
      error: () => this.vendedoresAsignados.set([])
    });

    if (this.usuariosCatalogo().length === 0) {
      const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
      if (idEmpresa) {
        this.usuariosService.getListado(idEmpresa, this.idSistema).subscribe({
          next: (lista) => this.usuariosCatalogo.set(lista ?? [])
        });
      }
    }

    if (this.vendedoresCatalogo().length === 0) {
      this.service.getVendedoresCatalogo().subscribe({
        next: (lista) => this.vendedoresCatalogo.set(lista ?? [])
      });
    }

    this.loadingAsignaciones.set(false);
  }

  agregarUsuario() {
    const pv = this.editingPV();
    const usuario = this.usuarioSeleccionado();
    if (!pv || !usuario) return;

    this.savingAsignacionUsuario.set(true);
    this.service
      .asignarUsuarioPuntoVenta(pv.sucursal, pv.puntoVenta, usuario)
      .pipe(finalize(() => this.savingAsignacionUsuario.set(false)))
      .subscribe({
        next: () => {
          this.usuarioSeleccionado.set(null);
          this.cargarAsignaciones(pv.sucursal, pv.puntoVenta);
        },
        error: (err) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo asignar',
            detail: err?.error?.message ?? 'Ocurrió un error al asignar el usuario.'
          })
      });
  }

  quitarUsuario(usuario: string) {
    const pv = this.editingPV();
    if (!pv) return;

    this.service.quitarUsuarioPuntoVenta(pv.sucursal, pv.puntoVenta, usuario).subscribe({
      next: () => this.cargarAsignaciones(pv.sucursal, pv.puntoVenta),
      error: (err) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo quitar',
          detail: err?.error?.message ?? 'Ocurrió un error al quitar el usuario.'
        })
    });
  }

  agregarVendedor() {
    const pv = this.editingPV();
    const vendedor = this.vendedorSeleccionado();
    if (!pv || !vendedor) return;

    this.savingAsignacionVendedor.set(true);
    this.service
      .asignarVendedorPuntoVenta(pv.sucursal, pv.puntoVenta, vendedor)
      .pipe(finalize(() => this.savingAsignacionVendedor.set(false)))
      .subscribe({
        next: () => {
          this.vendedorSeleccionado.set(null);
          this.cargarAsignaciones(pv.sucursal, pv.puntoVenta);
        },
        error: (err) =>
          this.messageService.add({
            severity: 'error',
            summary: 'No se pudo asignar',
            detail: err?.error?.message ?? 'Ocurrió un error al asignar el vendedor.'
          })
      });
  }

  quitarVendedor(vendedor: string) {
    const pv = this.editingPV();
    if (!pv) return;

    this.service.quitarVendedorPuntoVenta(pv.sucursal, pv.puntoVenta, vendedor).subscribe({
      next: () => this.cargarAsignaciones(pv.sucursal, pv.puntoVenta),
      error: (err) =>
        this.messageService.add({
          severity: 'error',
          summary: 'No se pudo quitar',
          detail: err?.error?.message ?? 'Ocurrió un error al quitar el vendedor.'
        })
    });
  }
}
