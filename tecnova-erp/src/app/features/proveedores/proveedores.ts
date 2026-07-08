import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { distinctUntilChanged, finalize } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { TabsModule } from 'primeng/tabs';

import { ProveedoresService } from './services/proveedores';
import {
  CatalogOptionDTO,
  ProveedorDetalleDTO,
  ProveedorListadoDTO,
  ProveedorUpdateDTO,
  RetencionDTO,
  TipoRetencionDTO,
} from '../../core/models/proveedores.models';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-proveedores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    CardModule,
    SelectModule,
    AutoCompleteModule,
    ProgressSpinnerModule,
    MessageModule,
    TagModule,
    TabsModule,
  ],
  templateUrl: './proveedores.html',
  styleUrls: ['./proveedores.scss'],
})
export class ProveedoresComponent {
  private proveedoresService = inject(ProveedoresService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);

  proveedores = signal<ProveedorListadoDTO[]>([]);
  loading = signal(false);
  saving = signal(false);
  errorMessage = signal('');
  filterText = signal('');

  showForm = signal(false);
  isEditMode = signal(false);
  loadingFormData = signal(false);
  activeFormTab = signal('general');

  paisesOptions = signal<CatalogOptionDTO[]>([]);
  departamentosOptions = signal<CatalogOptionDTO[]>([]);
  municipiosOptions = signal<CatalogOptionDTO[]>([]);
  girosOptions = signal<CatalogOptionDTO[]>([]);
  giroSuggestions = signal<CatalogOptionDTO[]>([]);
  condicionesPagoOptions = signal<CatalogOptionDTO[]>([]);
  tipoRetencionOptions = signal<TipoRetencionDTO[]>([]);

  retenciones = signal<RetencionDTO[]>([]);
  loadingRetenciones = signal(false);
  savingRetencion = signal(false);
  selectedTipoRetencion = signal<string>('');

  proveedorOrigen = signal<string>('L');

  readonly origenOptions = [
    { label: 'Local', value: 'L' },
    { label: 'Exterior', value: 'E' },
  ];

  readonly activeOptions = [
    { label: 'Activo', value: true },
    { label: 'Inactivo', value: false },
  ];

  readonly tipoPersonaOptions = [
    { label: '1 - Persona Natural', value: '1' },
    { label: '2 - Persona Jurídica', value: '2' },
  ];

  formTitle = computed(() => (this.isEditMode() ? 'Editar Proveedor' : 'Registrar Proveedor'));
  isExterior = computed(() => this.proveedorOrigen() === 'E');
  canAddRetenciones = computed(() => this.proveedorForm.controls.TipoMtto.value === 'C');

  proveedorForm = this.fb.group({
    PROVEEDOR: ['', Validators.required],
    ORIGEN: ['L', Validators.required],
    NOMBRE: ['', Validators.required],
    ALIAS: ['', Validators.required],
    ACTIVO: this.fb.control(true, { nonNullable: true }),
    EMAIL: [''],
    TELEFONO: ['', Validators.required],
    IDPAIS: this.fb.control('201', { validators: [Validators.required], nonNullable: true }),
    IDDEPARTAMENTO: this.fb.control('', { validators: [Validators.required], nonNullable: true }),
    IDMUNICIPIO: this.fb.control('', { validators: [Validators.required], nonNullable: true }),
    DIRECCION: ['', Validators.required],
    NIT: [''],
    DUI: [''],
    NRC: [''],
    IDGIRO: this.fb.control<CatalogOptionDTO | null>(null),
    ACTIVIDAD: [''],
    CONDICION_PAGO: ['', Validators.required],
    TIPOPERSONA: this.fb.control('1', { nonNullable: true }),
    OBSERVACION: [''],
    TipoMtto: this.fb.control<'A' | 'C'>('A', { nonNullable: true }),
  });

  constructor() {
    this.proveedorForm.addValidators((ctrl) => {
      if (ctrl.get('ORIGEN')?.value !== 'L') return null;
      const nit = String(ctrl.get('NIT')?.value ?? '').trim();
      const dui = String(ctrl.get('DUI')?.value ?? '').trim();
      return nit || dui ? null : { nitOrDuiRequired: true };
    });
    this.registerFormListeners();
    this.loadFormCatalogs();
    this.loadProveedores();
  }

  private registerFormListeners() {
    this.proveedorForm.controls.ORIGEN.valueChanges.pipe(distinctUntilChanged()).subscribe((origen) => {
      this.proveedorOrigen.set(origen ?? 'L');
      this.updateNitValidation(origen ?? 'L');
      if (this.proveedorForm.controls.TipoMtto.value === 'A') {
        this.generateCorrelativo(origen === 'E' ? 'Exterior' : 'Local');
      }
    });

    this.proveedorForm.controls.IDPAIS.valueChanges.pipe(distinctUntilChanged()).subscribe((idPais) => {
      const v = String(idPais ?? '').trim();
      if (!v) {
        this.departamentosOptions.set([]);
        this.municipiosOptions.set([]);
        this.proveedorForm.patchValue({ IDDEPARTAMENTO: '', IDMUNICIPIO: '' }, { emitEvent: false });
        return;
      }
      this.loadDepartamentos(v);
    });

    this.proveedorForm.controls.IDDEPARTAMENTO.valueChanges.pipe(distinctUntilChanged()).subscribe((idDepto) => {
      const idPais = String(this.proveedorForm.controls.IDPAIS.value ?? '').trim();
      const idDeptoV = String(idDepto ?? '').trim();
      if (!idPais || !idDeptoV) {
        this.municipiosOptions.set([]);
        this.proveedorForm.patchValue({ IDMUNICIPIO: '' }, { emitEvent: false });
        return;
      }
      this.loadMunicipios(idDeptoV, idPais);
    });
  }

  private updateNitValidation(_origen: string) {
    this.proveedorForm.updateValueAndValidity({ emitEvent: false });
  }

  private loadFormCatalogs() {
    this.loadingFormData.set(true);

    this.proveedoresService.getPaises().subscribe({
      next: (items) => {
        this.paisesOptions.set(items ?? []);
        const current = this.proveedorForm.controls.IDPAIS.value;
        const hasCurrent = (items ?? []).some((i) => String(i.value) === String(current));
        if (!hasCurrent) {
          const preferred = (items ?? []).find((i) => String(i.value) === '201') ?? (items ?? [])[0];
          if (preferred) this.proveedorForm.patchValue({ IDPAIS: String(preferred.value) });
        }
      },
      error: () => this.errorMessage.set('No se pudo cargar catálogo de países.'),
    });

    this.proveedoresService.getGiros().subscribe({
      next: (items) => {
        this.girosOptions.set(items ?? []);
        this.giroSuggestions.set([...(items ?? [])]);
      },
      error: () => this.errorMessage.set('No se pudo cargar catálogo de giros.'),
    });

    this.proveedoresService.getCondicionesPago().subscribe({
      next: (items) => this.condicionesPagoOptions.set(items ?? []),
      error: () => this.errorMessage.set('No se pudo cargar condiciones de pago.'),
    });

    this.proveedoresService
      .getTipoRetenciones()
      .pipe(finalize(() => this.loadingFormData.set(false)))
      .subscribe({
        next: (items) => this.tipoRetencionOptions.set(items ?? []),
        error: () => this.loadingFormData.set(false),
      });
  }

  private loadDepartamentos(idPais: string, selectedId?: string) {
    this.proveedoresService.getDepartamentos(idPais).subscribe({
      next: (items) => {
        this.departamentosOptions.set(items ?? []);
        if (selectedId) {
          this.proveedorForm.patchValue({ IDDEPARTAMENTO: selectedId }, { emitEvent: false });
          return;
        }
        const first = (items ?? [])[0];
        if (first) this.proveedorForm.patchValue({ IDDEPARTAMENTO: String(first.value) });
      },
      error: () => this.errorMessage.set('No se pudo cargar departamentos.'),
    });
  }

  private loadMunicipios(idDepto: string, idPais: string, selectedId?: string) {
    this.proveedoresService.getMunicipios(idDepto, idPais).subscribe({
      next: (items) => {
        this.municipiosOptions.set(items ?? []);
        if (selectedId) {
          this.proveedorForm.patchValue({ IDMUNICIPIO: selectedId }, { emitEvent: false });
          return;
        }
        const first = (items ?? [])[0];
        if (first) this.proveedorForm.patchValue({ IDMUNICIPIO: String(first.value) }, { emitEvent: false });
      },
      error: () => this.errorMessage.set('No se pudo cargar municipios.'),
    });
  }

  private generateCorrelativo(origen: 'Local' | 'Exterior') {
    this.proveedoresService.getCorrelativo(origen).subscribe({
      next: (r) => this.proveedorForm.patchValue({ PROVEEDOR: r?.correlativo ?? '' }, { emitEvent: false }),
      error: () => this.errorMessage.set('No se pudo generar correlativo.'),
    });
  }

  private applyProveedorDetalle(detalle: ProveedorDetalleDTO) {
    const pais = detalle.IDPAIS > 0 ? String(detalle.IDPAIS) : '';
    const departamento = String(detalle.IDDEPARTAMENTO ?? '').trim();
    const municipio = String(detalle.IDMUNICIPIO ?? '').trim();
    const giroSelected = this.girosOptions().find((i) => String(i.value) === String(detalle.IDGIRO)) ?? null;

    this.proveedorOrigen.set(detalle.ORIGEN ?? 'L');
    this.updateNitValidation(detalle.ORIGEN ?? 'L');

    this.proveedorForm.patchValue(
      {
        PROVEEDOR: detalle.PROVEEDOR,
        ORIGEN: detalle.ORIGEN,
        NOMBRE: detalle.NOMBRE,
        ALIAS: detalle.ALIAS,
        ACTIVO: detalle.ACTIVO,
        EMAIL: detalle.EMAIL,
        TELEFONO: detalle.TELEFONO,
        IDPAIS: pais,
        IDDEPARTAMENTO: departamento,
        IDMUNICIPIO: municipio,
        DIRECCION: detalle.DIRECCION,
        NIT: detalle.NIT,
        DUI: detalle.DUI,
        NRC: detalle.NRC,
        IDGIRO: giroSelected,
        ACTIVIDAD: detalle.ACTIVIDAD,
        CONDICION_PAGO: detalle.CONDICION_PAGO,
        TIPOPERSONA: String(detalle.TIPOPERSONA ?? 1),
        OBSERVACION: detalle.OBSERVACION,
        TipoMtto: 'C',
      },
      { emitEvent: false }
    );

    if (pais) this.loadDepartamentos(pais, departamento);
    if (pais && departamento) this.loadMunicipios(departamento, pais, municipio);
  }

  private toNumber(v: string | number | null | undefined): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  private resolveGiroValue(raw: unknown): string {
    if (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>)) {
      return String((raw as Record<string, unknown>)['value'] ?? '');
    }
    if (typeof raw === 'number') return String(raw);
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (!t) return '';
      const byLabel = this.girosOptions().find((i) => i.label.trim().toLowerCase() === t.toLowerCase());
      return byLabel ? String(byLabel.value) : t;
    }
    return '';
  }

  onGiroComplete(query: string | undefined | null) {
    const term = String(query ?? '').trim().toLowerCase();
    if (!term) {
      this.giroSuggestions.set([...this.girosOptions()]);
      return;
    }
    this.giroSuggestions.set(this.girosOptions().filter((i) => i.label.toLowerCase().includes(term)));
  }

  onFilterChange(value: string) {
    this.filterText.set(value);
  }

  loadProveedores() {
    this.loading.set(true);
    this.errorMessage.set('');

    this.proveedoresService
      .getListadoProveedores(this.filterText().trim())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (list) => this.proveedores.set(list ?? []),
        error: () => this.errorMessage.set('No se pudo cargar el listado de proveedores.'),
      });
  }

  openCreateForm() {
    this.isEditMode.set(false);
    this.showForm.set(true);
    this.errorMessage.set('');
    this.activeFormTab.set('general');
    this.retenciones.set([]);

    const defaultPais = this.paisesOptions().find((i) => String(i.value) === '201') ?? this.paisesOptions()[0];
    const defaultCondicion = this.condicionesPagoOptions()[0];
    const defaultGiro = this.girosOptions()[0] ?? null;

    this.proveedorForm.reset({
      PROVEEDOR: '',
      ORIGEN: 'L',
      NOMBRE: '',
      ALIAS: '',
      ACTIVO: true,
      EMAIL: '',
      TELEFONO: '',
      IDPAIS: defaultPais ? String(defaultPais.value) : '201',
      IDDEPARTAMENTO: '',
      IDMUNICIPIO: '',
      DIRECCION: '',
      NIT: '',
      DUI: '',
      NRC: '',
      IDGIRO: defaultGiro,
      ACTIVIDAD: '',
      CONDICION_PAGO: defaultCondicion?.value ? String(defaultCondicion.value) : '',
      TIPOPERSONA: '1',
      OBSERVACION: '',
      TipoMtto: 'A',
    });

    this.proveedorOrigen.set('L');
    this.updateNitValidation('L');
    this.departamentosOptions.set([]);
    this.municipiosOptions.set([]);
    this.giroSuggestions.set([...this.girosOptions()]);
    this.selectedTipoRetencion.set('');

    const selectedPais = this.proveedorForm.controls.IDPAIS.value;
    if (selectedPais) this.loadDepartamentos(selectedPais);
    this.generateCorrelativo('Local');
  }

  openEditForm(proveedor: ProveedorListadoDTO) {
    this.isEditMode.set(true);
    this.showForm.set(true);
    this.errorMessage.set('');
    this.activeFormTab.set('general');
    this.selectedTipoRetencion.set('');

    this.loadingFormData.set(true);
    this.proveedoresService
      .getProveedorByCodigo(proveedor.PROVEEDOR)
      .pipe(finalize(() => this.loadingFormData.set(false)))
      .subscribe({
        next: (detalle) => {
          this.applyProveedorDetalle(detalle);
          this.loadRetenciones(proveedor.PROVEEDOR);
        },
        error: () => this.errorMessage.set('No se pudo cargar el detalle del proveedor.'),
      });
  }

  closeForm() {
    this.showForm.set(false);
    this.isEditMode.set(false);
    this.loadingFormData.set(false);
    this.retenciones.set([]);
  }

  saveProveedor() {
    if (this.proveedorForm.invalid) {
      this.proveedorForm.markAllAsTouched();

      const fieldNames: Record<string, string> = {
        PROVEEDOR: 'Código Proveedor',
        NOMBRE: 'Nombre / Razón Social',
        ALIAS: 'Nombre Comercial',
        TELEFONO: 'Teléfono',
        IDDEPARTAMENTO: 'Departamento',
        IDMUNICIPIO: 'Municipio',
        DIRECCION: 'Dirección',
        CONDICION_PAGO: 'Condición de Pago',
      };

      const missing = Object.entries(fieldNames)
        .filter(([key]) => this.proveedorForm.get(key)?.invalid)
        .map(([, label]) => label);

      if (this.proveedorForm.hasError('nitOrDuiRequired')) {
        missing.push('NIT o DUI (al menos uno)');
      }

      this.errorMessage.set(`Campos requeridos sin completar: ${missing.join(', ')}.`);

      const generalFields = ['PROVEEDOR', 'NOMBRE', 'ALIAS', 'TELEFONO', 'IDDEPARTAMENTO', 'IDMUNICIPIO', 'DIRECCION'];
      if (generalFields.some(f => this.proveedorForm.get(f)?.invalid)) {
        this.activeFormTab.set('general');
      } else if (this.proveedorForm.get('CONDICION_PAGO')?.invalid || this.proveedorForm.hasError('nitOrDuiRequired')) {
        this.activeFormTab.set('actividad');
      }
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    const value = this.proveedorForm.getRawValue();
    const username = this.authService.currentUser()?.username ?? 'WEB';
    const tipoMtto = value.TipoMtto ?? (this.isEditMode() ? 'C' : 'A');

    const payload: ProveedorUpdateDTO = {
      PROVEEDOR: value.PROVEEDOR ?? '',
      NOMBRE: value.NOMBRE ?? '',
      ALIAS: value.ALIAS ?? '',
      ORIGEN: (value.ORIGEN === 'E' ? 'E' : 'L') as 'L' | 'E',
      DIRECCION: value.DIRECCION ?? '',
      IDPAIS: this.toNumber(value.IDPAIS),
      IDDEPARTAMENTO: String(value.IDDEPARTAMENTO ?? ''),
      IDMUNICIPIO: String(value.IDMUNICIPIO ?? ''),
      TELEFONO: value.TELEFONO ?? '',
      NIT: value.NIT ?? '',
      NRC: value.NRC ?? '',
      CONDICION_PAGO: value.CONDICION_PAGO ?? '',
      ACTIVO: !!value.ACTIVO,
      USUARIO: username,
      EMAIL: value.EMAIL ?? '',
      MODIFICADO: tipoMtto === 'C' ? 1 : 0,
      DUI: value.DUI ?? '',
      IDGIRO: this.resolveGiroValue(value.IDGIRO),
      TIPOPERSONA: this.toNumber(value.TIPOPERSONA),
      OBSERVACION: value.OBSERVACION ?? '',
      ACTIVIDAD: value.ACTIVIDAD ?? '',
    };

    this.proveedoresService
      .updateProveedor(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          if (tipoMtto === 'A') {
            this.isEditMode.set(true);
            this.proveedorForm.patchValue({ TipoMtto: 'C' }, { emitEvent: false });
            this.loadProveedores();
            return;
          }
          this.closeForm();
          this.loadProveedores();
        },
        error: () => this.errorMessage.set('No se pudo guardar el proveedor. Verifica los datos.'),
      });
  }

  deleteProveedor(proveedor: ProveedorListadoDTO) {
    const confirmed = window.confirm(`¿Desea eliminar el proveedor ${proveedor.PROVEEDOR}?`);
    if (!confirmed) return;

    this.loading.set(true);
    this.errorMessage.set('');

    this.proveedoresService
      .deleteProveedor(proveedor.PROVEEDOR)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.loadProveedores(),
        error: (err: HttpErrorResponse) => {
          this.errorMessage.set(err.status === 404 ? 'Proveedor no encontrado.' : 'No se pudo eliminar el proveedor.');
        },
      });
  }

  loadRetenciones(codigo: string) {
    this.loadingRetenciones.set(true);
    this.proveedoresService
      .getRetencionesProveedor(codigo)
      .pipe(finalize(() => this.loadingRetenciones.set(false)))
      .subscribe({
        next: (list) => this.retenciones.set(list ?? []),
        error: () => this.errorMessage.set('No se pudo cargar retenciones.'),
      });
  }

  addRetencion() {
    const tipoRetencion = this.selectedTipoRetencion();
    const proveedor = this.proveedorForm.controls.PROVEEDOR.value ?? '';
    if (!tipoRetencion || !proveedor) return;

    this.savingRetencion.set(true);
    this.errorMessage.set('');

    this.proveedoresService
      .addRetencionProveedor({
        PROVEEDOR: proveedor,
        RETENCION: tipoRetencion,
        USUARIO: this.authService.currentUser()?.username ?? 'WEB',
      })
      .pipe(finalize(() => this.savingRetencion.set(false)))
      .subscribe({
        next: () => {
          this.selectedTipoRetencion.set('');
          this.loadRetenciones(proveedor);
        },
        error: () => this.errorMessage.set('No se pudo agregar la retención.'),
      });
  }

  deleteRetencion(retencion: RetencionDTO) {
    const proveedor = this.proveedorForm.controls.PROVEEDOR.value ?? '';
    if (!proveedor) return;

    this.savingRetencion.set(true);
    this.errorMessage.set('');

    this.proveedoresService
      .deleteRetencionProveedor(proveedor, retencion.RETENCION)
      .pipe(finalize(() => this.savingRetencion.set(false)))
      .subscribe({
        next: () => this.loadRetenciones(proveedor),
        error: () => this.errorMessage.set('No se pudo eliminar la retención.'),
      });
  }

  get selectedTipoRetencionModel(): string {
    return this.selectedTipoRetencion();
  }
  set selectedTipoRetencionModel(v: string) {
    this.selectedTipoRetencion.set(v ?? '');
  }

  modoMttoTexto(): string {
    return this.proveedorForm.controls.TipoMtto.value === 'C' ? 'Edición' : 'Alta';
  }

  accionGuardarTexto(): string {
    return this.proveedorForm.controls.TipoMtto.value === 'C' ? 'Actualizar' : 'Guardar';
  }
}
