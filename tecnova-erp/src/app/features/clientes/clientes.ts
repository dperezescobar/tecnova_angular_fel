import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, catchError, distinctUntilChanged, finalize, of, retry, switchMap, tap, timeout } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ClientesService } from './services/clientes';
import {
  CatalogOptionDTO,
  ClienteDetalleDTO,
  ClienteListadoDTO,
  TipoClienteDTO,
  ClienteUpdateDTO
} from '../../core/models/clientes.models';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-clientes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    CardModule,
    SelectModule,
    AutoCompleteModule,
    ProgressSpinnerModule,
    MessageModule,
    CheckboxModule,
    InputNumberModule,
    TagModule,
    ToggleSwitchModule
  ],
  templateUrl: './clientes.html',
  styleUrls: ['./clientes.scss']
})
export class ClientesComponent {
  private clientesService = inject(ClientesService);
  private authService = inject(AuthService);
  private fb = inject(FormBuilder);

  clientes = signal<ClienteListadoDTO[]>([]);
  loading = signal(false);
  saving = signal(false);
  errorMessage = signal('');
  filterText = signal('');

  showForm = signal(false);
  isEditMode = signal(false);
  loadingFormData = signal(false);

  readonly activeOptions = [
    { label: 'Activo', value: true },
    { label: 'Inactivo', value: false }
  ];

  tipoClienteOptions = signal<TipoClienteDTO[]>([]);
  paisesOptions = signal<CatalogOptionDTO[]>([]);
  departamentosOptions = signal<CatalogOptionDTO[]>([]);
  municipiosOptions = signal<CatalogOptionDTO[]>([]);
  cargandoMunicipios = signal(false);
  girosOptions = signal<CatalogOptionDTO[]>([]);
  condicionesPagoOptions = signal<CatalogOptionDTO[]>([]);
  giroSuggestions = signal<CatalogOptionDTO[]>([]);

  readonly tipoPersonaOptions = [
    { label: '1 - Persona Natural', value: '1' },
    { label: '2 - Persona Jurídica', value: '2' }
  ];

  formTitle = computed(() => (this.isEditMode() ? 'Editar Cliente' : 'Registrar Cliente'));

  clienteForm = this.fb.group({
    CLIENTE: ['', [Validators.required]],
    TIPO_CLIENTE: ['', [Validators.required]],
    NOMBRE: ['', [Validators.required]],
    ALIAS: [''],
    NIT: [''],
    DUI: [''],
    NRC: [''],
    IDPAIS: this.fb.control('201', { validators: [Validators.required], nonNullable: true }),
    IDDEPARTAMENTO: this.fb.control('', { validators: [Validators.required], nonNullable: true }),
    IDMUNICIPIO: this.fb.control('', { validators: [Validators.required], nonNullable: true }),
    CONDICION_PAGO: ['', [Validators.required]],
    IDGIRO: this.fb.control<CatalogOptionDTO | null>(null),
    ACTIVO: this.fb.control(true, { nonNullable: true }),
    DIRECCION: [''],
    TELEFONO: [''],
    EMAIL: [''],
    TIPOPERSONA: this.fb.control('1', { nonNullable: true }),
    OBSERVACION: [''],
    TipoMtto: this.fb.control<'A' | 'C'>('A', { nonNullable: true }),
    CLIENTE_PREFERENCIAL: [false], // Checkbox, valor booleano
  CANTIDAD_MINIMA: [{ value: null as number | null, disabled: true }, [Validators.min(1)]], // Input, solo habilitado si es preferencial
  });

  private route = inject(ActivatedRoute);

  constructor() {
    this.registerFormListeners();
    this.loadFormCatalogs();
    this.loadClientes();

    this.route.queryParams.subscribe((params) => {
      const editCode = String(params['edit'] || params['cliente'] || params['filtro'] || '').trim();
      if (editCode) {
        this.filterText.set(editCode);
        this.clientesService.getClienteByCodigo(editCode).subscribe({
          next: (detalle) => {
            if (detalle) {
              this.isEditMode.set(true);
              this.syncEditLocks();
              this.showForm.set(true);
              this.applyClienteDetalle(detalle);
            }
          }
        });
      }
    });

    // clientes.ts - Alrededor de la línea 106
this.clienteForm.get('CLIENTE_PREFERENCIAL')?.valueChanges.subscribe((preferencial: boolean | null) => {
  const cantidadMinimaCtrl = this.clienteForm.get('CANTIDAD_MINIMA');
  
  // Convertimos a booleano real (null será false)
  const isPreferencial = !!preferencial; 

  if (isPreferencial) {
    cantidadMinimaCtrl?.enable();
    if (!cantidadMinimaCtrl?.value) {
      cantidadMinimaCtrl?.setValue(1);
    }
  } else {
    cantidadMinimaCtrl?.disable();
    cantidadMinimaCtrl?.setValue(null);
  }
});
  }

  private syncEditLocks() {
    if (this.isEditMode()) {
      this.clienteForm.controls.TIPO_CLIENTE.disable({ emitEvent: false });
      return;
    }

    this.clienteForm.controls.TIPO_CLIENTE.enable({ emitEvent: false });
  }

  modoMttoTexto(): string {
    return this.clienteForm.controls.TipoMtto.value === 'C' ? 'Edición' : 'Alta';
  }

  accionGuardarTexto(): string {
    return this.clienteForm.controls.TipoMtto.value === 'C' ? 'Actualizar' : 'Guardar';
  }

  private registerFormListeners() {
    this.clienteForm.controls.TIPO_CLIENTE.valueChanges.pipe(distinctUntilChanged()).subscribe((tipoCliente) => {
      if (!tipoCliente || this.isEditMode()) return;
      this.generateCorrelativo(tipoCliente);
    });

    this.clienteForm.controls.IDPAIS.valueChanges.pipe(distinctUntilChanged()).subscribe((idPais) => {
      const idPaisValue = String(idPais ?? '').trim();
      if (!idPaisValue) {
        this.departamentosOptions.set([]);
        this.municipiosOptions.set([]);
        this.clienteForm.patchValue({ IDDEPARTAMENTO: '', IDMUNICIPIO: '' }, { emitEvent: false });
        return;
      }

      this.loadDepartamentos(idPaisValue);
    });

    // Cascada resiliente: switchMap cancela la petición anterior (evita respuestas fuera de orden)
    // y se limpian municipios + IDMUNICIPIO ANTES de cargar, para no dejar la lista del departamento
    // anterior si la red falla (era el bug reportado: "no refrescó, dejó los anteriores").
    this.clienteForm.controls.IDDEPARTAMENTO.valueChanges.pipe(
      distinctUntilChanged(),
      tap(() => {
        this.municipiosOptions.set([]);
        this.clienteForm.patchValue({ IDMUNICIPIO: '' }, { emitEvent: false });
      }),
      switchMap((idDepto) => {
        const idPaisValue = String(this.clienteForm.controls.IDPAIS.value ?? '').trim();
        const idDeptoValue = String(idDepto ?? '').trim();
        if (!idPaisValue || !idDeptoValue) return of<CatalogOptionDTO[]>([]);
        return this.fetchMunicipios$(idDeptoValue, idPaisValue);
      })
    ).subscribe((items) => {
      this.municipiosOptions.set(items ?? []);
      const first = (items ?? [])[0];
      if (first) this.clienteForm.patchValue({ IDMUNICIPIO: String(first.value) }, { emitEvent: false });
    });
  }

  // Carga de municipios tolerante a red inestable: timeout + reintentos; ante fallo NO deja la
  // lista vieja (retorna []) y avisa. Reutilizada por la cascada y por la edición.
  private fetchMunicipios$(idDepto: string, idPais: string): Observable<CatalogOptionDTO[]> {
    this.cargandoMunicipios.set(true);
    this.errorMessage.set('');
    return this.clientesService.getMunicipios(idDepto, idPais).pipe(
      timeout(12000),
      retry({ count: 2, delay: 800 }),
      catchError(() => {
        this.errorMessage.set('No se pudieron cargar los municipios (conexión inestable). Vuelva a seleccionar el departamento.');
        return of<CatalogOptionDTO[]>([]);
      }),
      finalize(() => this.cargandoMunicipios.set(false))
    );
  }

  private loadFormCatalogs() {
    this.loadingFormData.set(true);

    this.clientesService.getTipoClientes().subscribe({
      next: (tipos) => {
        this.tipoClienteOptions.set(tipos ?? []);
      },
      error: () => this.errorMessage.set('No se pudo cargar catálogo de Tipo de Cliente.')
    });

    this.clientesService.getPaises().subscribe({
      next: (items) => {
        this.paisesOptions.set(items ?? []);

        const currentPais = this.clienteForm.controls.IDPAIS.value;
        const hasCurrent = (items ?? []).some((item) => String(item.value) === String(currentPais));
        if (!hasCurrent) {
          const preferredPais = (items ?? []).find((item) => String(item.value) === '201');
          const fallbackPais = preferredPais ?? (items ?? [])[0];
          if (fallbackPais) {
            this.clienteForm.patchValue({ IDPAIS: String(fallbackPais.value) });
          }
        }
      },
      error: () => this.errorMessage.set('No se pudo cargar catálogo de países.')
    });

    this.clientesService.getGiros().subscribe({
      next: (items) => {
        this.girosOptions.set(items ?? []);
        this.giroSuggestions.set([...(items ?? [])]);

        const currentGiro = this.clienteForm.controls.IDGIRO.value;
        if (!currentGiro && (items ?? []).length > 0) {
          this.clienteForm.patchValue({ IDGIRO: items[0] }, { emitEvent: false });
        }
      },
      error: () => this.errorMessage.set('No se pudo cargar catálogo de giros.')
    });

    this.clientesService
      .getCondicionesPago()
      .pipe(finalize(() => this.loadingFormData.set(false)))
      .subscribe({
        next: (items) => this.condicionesPagoOptions.set(items ?? []),
        error: () => this.errorMessage.set('No se pudo cargar catálogo de condiciones de pago.')
      });
  }

  private loadDepartamentos(idPais: string, selectedId?: string) {
    this.clientesService.getDepartamentos(idPais).subscribe({
      next: (items) => {
        this.departamentosOptions.set(items ?? []);
        if (selectedId) {
          this.clienteForm.patchValue({ IDDEPARTAMENTO: selectedId }, { emitEvent: false });
          return;
        }

        const firstDepartamento = (items ?? [])[0];
        if (firstDepartamento) {
          this.clienteForm.patchValue({ IDDEPARTAMENTO: String(firstDepartamento.value) });
        }
      },
      error: () => this.errorMessage.set('No se pudo cargar departamentos.')
    });
  }

  private loadMunicipios(idDepto: string, idPais: string, selectedId?: string) {
    this.fetchMunicipios$(idDepto, idPais).subscribe((items) => {
      this.municipiosOptions.set(items ?? []);
      if (selectedId) {
        this.clienteForm.patchValue({ IDMUNICIPIO: selectedId }, { emitEvent: false });
        return;
      }
      const firstMunicipio = (items ?? [])[0];
      if (firstMunicipio) {
        this.clienteForm.patchValue({ IDMUNICIPIO: String(firstMunicipio.value) }, { emitEvent: false });
      }
    });
  }

  private generateCorrelativo(tipoCliente: string) {
    this.clientesService.getCorrelativoByTipoCliente(tipoCliente).subscribe({
      next: (response) => this.clienteForm.patchValue({ CLIENTE: response?.correlativo ?? '' }, { emitEvent: false }),
      error: () => this.errorMessage.set('No se pudo generar correlativo automático.')
    });
  }

  private toOrigen(tipoCliente: string): 'L' | 'E' {
    const value = tipoCliente.trim().toUpperCase();
    if (value === 'PE' || value.startsWith('E')) {
      return 'E';
    }

    return 'L';
  }

  private applyClienteDetalle(detalle: ClienteDetalleDTO) {
    const pais = detalle.IDPAIS > 0 ? String(detalle.IDPAIS) : '';
    const departamento = String(detalle.IDDEPARTAMENTO ?? '').trim();
    const municipio = String(detalle.IDMUNICIPIO ?? '').trim();

    const giroSelected = this.girosOptions().find((item) => String(item.value) === String(detalle.idGiro)) ?? null;

    this.clienteForm.patchValue(
      {
        CLIENTE: detalle.CLIENTE,
        TIPO_CLIENTE: detalle.TIPO_CLIENTE,
        NOMBRE: detalle.NOMBRE,
        ALIAS: detalle.ALIAS,
        NIT: detalle.NIT,
        DUI: detalle.DUI,
        NRC: detalle.REGISTRO_COMERCIO,
        IDPAIS: pais,
        IDDEPARTAMENTO: departamento,
        IDMUNICIPIO: municipio,
        CONDICION_PAGO: detalle.CONDICION_PAGO,
        IDGIRO: giroSelected,
        ACTIVO: detalle.ACTIVO,
        DIRECCION: detalle.DIRECCION,
        TELEFONO: detalle.TELEFONO,
        EMAIL: detalle.CORREO_ELECTRONICO,
        TIPOPERSONA: String(detalle.TipoPersona === 2 ? 2 : 1),
        OBSERVACION: detalle.OBSERVACION_CLIE,
        TipoMtto: 'C',
        CLIENTE_PREFERENCIAL: detalle.CLIENTE_PREFERENCIAL,
      CANTIDAD_MINIMA: detalle.CANTIDAD_MINIMA
      },
      { emitEvent: false }
    );

    if (pais) {
      this.loadDepartamentos(pais, departamento);
    }

    if (pais && departamento) {
      this.loadMunicipios(departamento, pais, municipio);
    }
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private resolveGiroValue(rawValue: unknown): string {
    if (rawValue && typeof rawValue === 'object' && 'value' in (rawValue as Record<string, unknown>)) {
      return String((rawValue as Record<string, unknown>)['value'] ?? '');
    }

    if (typeof rawValue === 'number') {
      return String(rawValue);
    }

    if (typeof rawValue === 'string') {
      const text = rawValue.trim();
      if (!text) return '';

      const byLabel = this.girosOptions().find((item) => item.label.trim().toLowerCase() === text.toLowerCase());
      if (byLabel) {
        return String(byLabel.value);
      }

      return text;
    }

    return '';
  }

  onGiroComplete(query: string | undefined | null) {
    const term = String(query ?? '').trim().toLowerCase();
    if (!term) {
      this.giroSuggestions.set([...this.girosOptions()]);
      return;
    }

    this.giroSuggestions.set(this.girosOptions().filter((item) => item.label.toLowerCase().includes(term)));
  }

  onFilterChange(value: string) {
    this.filterText.set(value);
  }

  loadClientes() {
    this.loading.set(true);
    this.errorMessage.set('');

    this.clientesService
      .getListadoClientes(this.filterText().trim())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (list) => this.clientes.set(list ?? []),
        error: () => this.errorMessage.set('No se pudo cargar el listado de clientes.')
      });
  }

  openCreateForm() {
    this.isEditMode.set(false);
    this.showForm.set(true);
    this.errorMessage.set('');

    const preferredPais = this.paisesOptions().find((item) => String(item.value) === '201');
    const defaultPais = preferredPais ?? this.paisesOptions()[0];
    const defaultTipo = this.tipoClienteOptions()[0];
    const defaultCondicion = this.condicionesPagoOptions()[0];
    const defaultGiro = this.girosOptions()[0] ?? null;

    this.clienteForm.reset({
      CLIENTE: '',
      TIPO_CLIENTE: defaultTipo?.TIPO_CLIENTE ?? '',
      NOMBRE: '',
      ALIAS: '',
      NIT: '',
      DUI: '',
      NRC: '',
      IDPAIS: defaultPais ? String(defaultPais.value) : '201',
      IDDEPARTAMENTO: '',
      IDMUNICIPIO: '',
      CONDICION_PAGO: defaultCondicion?.value ? String(defaultCondicion.value) : '',
      IDGIRO: defaultGiro,
      ACTIVO: true,
      DIRECCION: '',
      TELEFONO: '',
      EMAIL: '',
      TIPOPERSONA: '1',
      OBSERVACION: '',
      TipoMtto: 'A'
    });

    this.departamentosOptions.set([]);
    this.municipiosOptions.set([]);
    this.giroSuggestions.set([...this.girosOptions()]);

    const selectedPais = this.clienteForm.controls.IDPAIS.value;
    if (selectedPais) {
      this.loadDepartamentos(selectedPais);
    }

    const tipoCliente = this.clienteForm.controls.TIPO_CLIENTE.value;
    if (tipoCliente) {
      this.generateCorrelativo(tipoCliente);
    }

    this.syncEditLocks();
  }

  openEditForm(cliente: ClienteListadoDTO) {
    this.isEditMode.set(true);
    this.syncEditLocks();
    this.showForm.set(true);
    this.errorMessage.set('');

    this.loadingFormData.set(true);
    this.clientesService
      .getClienteByCodigo(cliente.CLIENTE)
      .pipe(finalize(() => this.loadingFormData.set(false)))
      .subscribe({
        next: (detalle) => this.applyClienteDetalle(detalle),
        error: () => this.errorMessage.set('No se pudo cargar el detalle del cliente para edición.')
      });
  }

  closeForm() {
    this.showForm.set(false);
    this.isEditMode.set(false);
    this.loadingFormData.set(false);
    this.syncEditLocks();
  }

  saveCliente() {
    if (this.clienteForm.invalid) {
      this.clienteForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    const value = this.clienteForm.getRawValue();
    const username = this.authService.currentUser()?.username ?? 'WEB';
    // Recorta espacios: el autorelleno de Chrome deja un espacio final que el backend rechaza
    // (p. ej. ValidarCorreo devuelve 'Rechazado' con un correo que termina en espacio → 500).
    const s = (v: unknown) => String(v ?? '').trim();
    const tipoCliente = s(value.TIPO_CLIENTE);
    const tipoMtto = value.TipoMtto ?? (this.isEditMode() ? 'C' : 'A');

    const payload: ClienteUpdateDTO = {
      CLIENTE: s(value.CLIENTE),
      NOMBRE: s(value.NOMBRE),
      ALIAS: s(value.ALIAS),
      ORIGEN: this.toOrigen(tipoCliente),
      DIRECCION: s(value.DIRECCION),
      IDPAIS: this.toNumber(value.IDPAIS),
      IDDEPARTAMENTO: s(value.IDDEPARTAMENTO),
      IDMUNICIPIO: s(value.IDMUNICIPIO),
      TELEFONO: s(value.TELEFONO),
      NIT: s(value.NIT),
      ACTIVIDAD: '',
      NRC: s(value.NRC),
      CONDICION_PAGO: s(value.CONDICION_PAGO),
      ACTIVO: !!value.ACTIVO,
      USUARIO: username,
      EMAIL: s(value.EMAIL),
      MODIFICADO: tipoMtto === 'C' ? 1 : 0,
      DUI: s(value.DUI),
      IDGIRO: this.resolveGiroValue(value.IDGIRO),
      TIPOPERSONA: this.toNumber(value.TIPOPERSONA),
      OBSERVACION: s(value.OBSERVACION),
      TipoMtto: tipoMtto,
      tipoCliente: tipoCliente,
      CLIENTE_PREFERENCIAL: value.CLIENTE_PREFERENCIAL ?? false,
      CANTIDAD_MINIMA: value.CANTIDAD_MINIMA ?? 0,
    };

    this.clientesService
      .updateCliente(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          if (tipoMtto === 'A') {
            this.isEditMode.set(true);
            this.clienteForm.patchValue({ TipoMtto: 'C' }, { emitEvent: false });
            this.loadClientes();
            return;
          }

          this.closeForm();
          this.loadClientes();
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage.set(this.extractSaveError(error));
        }
      });
  }

  // Muestra el detalle REAL del backend en vez del genérico "verifica los datos requeridos"
  // (que ocultaba la causa: sesión de empresa inválida, error del SP, o 0 filas afectadas).
  private extractSaveError(error: HttpErrorResponse): string {
    if (error?.status === 401) {
      return 'Tu sesión de empresa no es válida. Cierra sesión e ingresa de nuevo, luego reintenta.';
    }
    const raw = error?.error;
    const backend = (typeof raw === 'string'
      ? raw
      : String((raw as { message?: string; Message?: string })?.message ?? (raw as { Message?: string })?.Message ?? '')
    ).trim();
    return backend || 'No se pudo guardar el cliente. Verifica los datos requeridos.';
  }

  deleteCliente(cliente: ClienteListadoDTO) {
    const confirmed = window.confirm(`¿Desea eliminar el cliente ${cliente.CLIENTE}?`);
    if (!confirmed) return;

    this.loading.set(true);
    this.errorMessage.set('');

    this.clientesService
      .deleteCliente(cliente.CLIENTE)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: () => this.loadClientes(),
        error: (error: HttpErrorResponse) => {
          if (error.status === 404) {
            this.errorMessage.set('No se encontró el cliente o ya fue eliminado.');
            return;
          }

          this.errorMessage.set('No se pudo eliminar el cliente.');
        }
      });
  }

  tipoClienteLabel(tipo: TipoClienteDTO): string {
    return `${tipo.TIPO_CLIENTE} - ${tipo.DESCRIPCION}`;
  }

  async exportToExcel() {
    const XLSX = await import('xlsx');

    const data = this.clientes().map((c) => ({
      CLIENTE: c.CLIENTE,
      NOMBRE_RAZON_SOCIAL: c.NOMBRE,
      NOMBRE_COMERCIAL: c.ALIAS,
      REGISTRO_COMERCIO: c.REGISTRO_COMERCIO,
      NIT: c.NIT,
      PAIS: c.Pais
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Clientes');

    const dateTag = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Listado_Clientes_${dateTag}.xlsx`);
  }
}
