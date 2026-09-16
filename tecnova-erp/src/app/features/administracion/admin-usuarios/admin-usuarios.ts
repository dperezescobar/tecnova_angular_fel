import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmationService, MessageService } from 'primeng/api';

import { UsuariosAdminService } from '../services/usuarios-admin';
import { RolesAdminService, PermisoRol } from '../services/roles-admin';
import { AuthService } from '../../../core/services/auth';
import { ReiniciarPasswordResponse, SistemaItem, UsuarioListado } from '../../../core/models/usuarios-admin.models';

@Component({
  selector: 'app-admin-usuarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    CardModule,
    SelectModule,
    CheckboxModule,
    ProgressSpinnerModule,
    MessageModule,
    TagModule,
    DialogModule,
    ToastModule,
    ConfirmDialogModule,
    TooltipModule
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './admin-usuarios.html',
  styleUrls: ['./admin-usuarios.scss']
})
export class AdminUsuariosComponent {
  private usuariosService = inject(UsuariosAdminService);
  private rolesService = inject(RolesAdminService);
  private authService = inject(AuthService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private fb = inject(FormBuilder);

  sistemas = signal<SistemaItem[]>([]);
  sistemaFiltro = signal<number>(2);
  formSistemas = signal<number[]>([2]);

  usuarios = signal<UsuarioListado[]>([]);
  loading = signal(false);
  saving = signal(false);

  showRolesDialog = signal(false);
  rolesDialogUsuario = signal<string | null>(null);
  catalogoRoles = signal<PermisoRol[]>([]);
  rolesSeleccionados = signal<string[]>([]);
  savingRoles = signal(false);
  errorMessage = signal('');
  filterText = signal('');

  showForm = signal(false);
  isEditMode = signal(false);
  loadingFormData = signal(false);
  editandoUsuario = signal<string | null>(null);

  showPasswordDialog = signal(false);
  passwordDialogUsuario = signal<string | null>(null);
  passwordSaving = signal(false);

  reinicioResultado = signal<ReiniciarPasswordResponse | null>(null);

  readonly tipoOptions = [
    { label: 'Administrador', value: 'A' },
    { label: 'Usuario', value: 'U' }
  ];

  readonly estadoOptions = [
    { label: 'Activo', value: true },
    { label: 'Inactivo', value: false }
  ];

  sistemaFiltroOptions = computed(() => {
    const list = this.sistemas().map((s) => ({
      label: s.sistema,
      value: s.idSistema
    }));
    return [{ label: 'Todos los sistemas', value: 0 }, ...list];
  });

  formTitle = computed(() => (this.isEditMode() ? `Editar usuario ${this.editandoUsuario() ?? ''}` : 'Nuevo usuario'));

  filteredUsuarios = computed(() => {
    const term = this.filterText().trim().toLowerCase();
    const usuarios = this.usuarios();
    if (!term) return usuarios;
    return usuarios.filter(
      (u) =>
        u.usuario.toLowerCase().includes(term) ||
        u.nombre.toLowerCase().includes(term) ||
        u.correoElectronico.toLowerCase().includes(term)
    );
  });

  usuarioForm = this.fb.group({
    correo: ['', [Validators.required, Validators.email]],
    nombre: ['', [Validators.required]],
    tipo: this.fb.control('U', { nonNullable: true, validators: [Validators.required] }),
    dui: [''],
    activo: this.fb.control(true, { nonNullable: true }),
    password: [''],
    passwordConfirmar: ['']
  });

  passwordForm = this.fb.group({
    nuevaPassword: ['', [Validators.required, Validators.minLength(6)]],
    confirmarPassword: ['', [Validators.required]]
  });

  constructor() {
    this.loadSistemas();
    this.loadUsuarios();
  }

  private get idEmpresa(): number {
    return this.authService.currentUser()?.selectedEmpresa?.idEmpresa ?? 0;
  }

  esUsuarioActual(usuario: string): boolean {
    const actual = this.authService.currentUser()?.username ?? '';
    return usuario.trim().toUpperCase() === actual.trim().toUpperCase();
  }

  onFilterChange(value: string) {
    this.filterText.set(value);
  }

  onSistemaFiltroChange(value: number) {
    this.sistemaFiltro.set(value);
    this.loadUsuarios();
  }

  loadSistemas() {
    this.usuariosService.getSistemas().subscribe({
      next: (list) => this.sistemas.set(list ?? []),
      error: () => {}
    });
  }

  loadUsuarios() {
    if (!this.idEmpresa) {
      this.errorMessage.set('No hay una empresa seleccionada.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.usuariosService
      .getListado(this.idEmpresa, this.sistemaFiltro())
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (list) => this.usuarios.set(list ?? []),
        error: () => this.errorMessage.set('No se pudo cargar el listado de usuarios.')
      });
  }

  isSistemaSelected(idSistema: number): boolean {
    return this.formSistemas().includes(idSistema);
  }

  toggleFormSistema(idSistema: number) {
    const current = this.formSistemas();
    if (current.includes(idSistema)) {
      if (current.length === 1) {
        this.messageService.add({ severity: 'warn', summary: 'Atención', detail: 'El usuario debe pertenecer al menos a un sistema.' });
        return;
      }
      this.formSistemas.set(current.filter((id) => id !== idSistema));
    } else {
      this.formSistemas.set([...current, idSistema]);
    }
  }

  openCreateForm() {
    this.isEditMode.set(false);
    this.editandoUsuario.set(null);
    this.showForm.set(true);
    this.errorMessage.set('');

    const defaultSis = this.sistemaFiltro() > 0 ? this.sistemaFiltro() : 2;
    this.formSistemas.set([defaultSis]);

    this.usuarioForm.reset({ correo: '', nombre: '', tipo: 'U', dui: '', activo: true, password: '', passwordConfirmar: '' });
    this.usuarioForm.controls.password.setValidators([Validators.required, Validators.minLength(6)]);
    this.usuarioForm.controls.passwordConfirmar.setValidators([Validators.required]);
    this.usuarioForm.controls.correo.enable();
    this.usuarioForm.controls.password.updateValueAndValidity();
    this.usuarioForm.controls.passwordConfirmar.updateValueAndValidity();
  }

  openEditForm(usuario: UsuarioListado) {
    this.isEditMode.set(true);
    this.editandoUsuario.set(usuario.usuario);
    this.showForm.set(true);
    this.errorMessage.set('');

    this.formSistemas.set(usuario.sistemas && usuario.sistemas.length > 0 ? [...usuario.sistemas] : [2]);

    this.usuarioForm.controls.password.clearValidators();
    this.usuarioForm.controls.passwordConfirmar.clearValidators();
    this.usuarioForm.controls.password.updateValueAndValidity();
    this.usuarioForm.controls.passwordConfirmar.updateValueAndValidity();

    this.loadingFormData.set(true);
    this.usuariosService
      .getDetalle(usuario.usuario)
      .pipe(finalize(() => this.loadingFormData.set(false)))
      .subscribe({
        next: (detalle) => {
          if (detalle.sistemas && detalle.sistemas.length > 0) {
            this.formSistemas.set([...detalle.sistemas]);
          }
          this.usuarioForm.reset({
            correo: detalle.correoElectronico,
            nombre: detalle.nombre,
            tipo: detalle.tipo || 'U',
            dui: detalle.dui ?? '',
            activo: detalle.activo,
            password: '',
            passwordConfirmar: ''
          });
          this.usuarioForm.controls.correo.disable();
        },
        error: () => this.errorMessage.set('No se pudo cargar el detalle del usuario.')
      });
  }

  closeForm() {
    this.showForm.set(false);
    this.isEditMode.set(false);
    this.editandoUsuario.set(null);
    this.usuarioForm.controls.correo.enable();
  }

  guardarUsuario() {
    if (this.usuarioForm.invalid) {
      this.usuarioForm.markAllAsTouched();
      return;
    }

    if (this.formSistemas().length === 0) {
      this.errorMessage.set('Debe seleccionar al menos un sistema para el usuario.');
      return;
    }

    const value = this.usuarioForm.getRawValue();

    if (!this.isEditMode() && value.password !== value.passwordConfirmar) {
      this.errorMessage.set('Las contraseñas no coinciden.');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set('');

    if (this.isEditMode()) {
      const usuario = this.editandoUsuario();
      if (!usuario) {
        this.saving.set(false);
        return;
      }

      this.usuariosService
        .editar(usuario, {
          nombre: value.nombre ?? '',
          tipo: value.tipo,
          correo: value.correo ?? '',
          dui: value.dui ?? '',
          activo: !!value.activo,
          sistemas: this.formSistemas()
        })
        .pipe(finalize(() => this.saving.set(false)))
        .subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Usuario actualizado', detail: usuario });
            this.closeForm();
            this.loadUsuarios();
          },
          error: (err) => this.errorMessage.set(err?.error?.message ?? 'No se pudo actualizar el usuario.')
        });
      return;
    }

    const mainSistema = this.formSistemas().length > 0 ? this.formSistemas()[0] : (this.sistemaFiltro() > 0 ? this.sistemaFiltro() : 2);

    this.usuariosService
      .crear({
        usuario: (value.correo ?? '').trim().toUpperCase(),
        password: value.password ?? '',
        nombre: (value.nombre ?? '').trim().toUpperCase(),
        tipo: value.tipo,
        correo: (value.correo ?? '').trim().toUpperCase(),
        activo: !!value.activo,
        dui: value.dui ?? '',
        idEmpresa: this.idEmpresa,
        idSistema: mainSistema,
        sistemas: this.formSistemas()
      })
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Usuario creado', detail: value.correo ?? '' });
          this.closeForm();
          this.loadUsuarios();
        },
        error: (err) => this.errorMessage.set(err?.error?.message ?? 'No se pudo crear el usuario.')
      });
  }

  solicitarDesactivar(usuario: UsuarioListado) {
    this.confirmationService.confirm({
      header: 'Desactivar usuario',
      message: `¿Desea desactivar al usuario ${usuario.usuario}? Podrá reactivarlo luego desde Editar.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Desactivar',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.usuariosService.desactivar(usuario.usuario).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Usuario desactivado', detail: usuario.usuario });
            this.loadUsuarios();
          },
          error: (err) =>
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: err?.error?.message ?? 'No se pudo desactivar el usuario.'
            })
        });
      }
    });
  }

  solicitarBloquear(usuario: UsuarioListado) {
    this.confirmationService.confirm({
      header: 'Bloquear usuario',
      message: `¿Desea bloquear al usuario ${usuario.usuario}? No podrá iniciar sesión hasta ser desbloqueado.`,
      icon: 'pi pi-lock',
      acceptLabel: 'Bloquear',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.usuariosService.bloquear(usuario.usuario).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Usuario bloqueado', detail: usuario.usuario });
            this.loadUsuarios();
          },
          error: (err) =>
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: err?.error?.message ?? 'No se pudo bloquear el usuario.'
            })
        });
      }
    });
  }

  solicitarDesbloquear(usuario: UsuarioListado) {
    this.confirmationService.confirm({
      header: 'Desbloquear usuario',
      message: `¿Desea desbloquear al usuario ${usuario.usuario}?`,
      icon: 'pi pi-lock-open',
      acceptLabel: 'Desbloquear',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.usuariosService.desbloquear(usuario.usuario).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Usuario desbloqueado', detail: usuario.usuario });
            this.loadUsuarios();
          },
          error: (err) =>
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: err?.error?.message ?? 'No se pudo desbloquear el usuario.'
            })
        });
      }
    });
  }

  solicitarReiniciarPassword(usuario: UsuarioListado) {
    this.confirmationService.confirm({
      header: 'Reiniciar contraseña',
      message: `La contraseña de ${usuario.usuario} se reiniciará y deberá definir una nueva al iniciar sesión. ¿Continuar?`,
      icon: 'pi pi-refresh',
      acceptLabel: 'Reiniciar',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.usuariosService.reiniciarPassword(usuario.usuario).subscribe({
          next: (resultado) => {
            this.reinicioResultado.set(resultado);
            this.loadUsuarios();
          },
          error: (err) =>
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: err?.error?.message ?? 'No se pudo reiniciar la contraseña.'
            })
        });
      }
    });
  }

  cerrarReinicioResultado() {
    this.reinicioResultado.set(null);
  }

  abrirCambiarPassword(usuario: UsuarioListado) {
    this.passwordDialogUsuario.set(usuario.usuario);
    this.passwordForm.reset({ nuevaPassword: '', confirmarPassword: '' });
    this.showPasswordDialog.set(true);
  }

  cerrarCambiarPassword() {
    this.showPasswordDialog.set(false);
    this.passwordDialogUsuario.set(null);
  }

  guardarNuevaPassword() {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }

    const usuario = this.passwordDialogUsuario();
    const { nuevaPassword, confirmarPassword } = this.passwordForm.value;
    if (!usuario) return;

    if (nuevaPassword !== confirmarPassword) {
      this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Las contraseñas no coinciden.' });
      return;
    }

    this.passwordSaving.set(true);
    this.usuariosService
      .cambiarPassword(usuario, nuevaPassword!)
      .pipe(finalize(() => this.passwordSaving.set(false)))
      .subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Contraseña actualizada', detail: usuario });
          this.cerrarCambiarPassword();
        },
        error: (err) =>
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: err?.error?.message ?? 'No se pudo actualizar la contraseña.'
          })
      });
  }

  abrirModalRoles(u: UsuarioListado): void {
    this.rolesDialogUsuario.set(u.usuario);
    this.showRolesDialog.set(true);

    this.rolesService.getRoles().subscribe({
      next: (catalogo) => {
        const normalized = (catalogo ?? []).map((c) => ({
          ...c,
          rol: (c.rol || '').trim().toUpperCase(),
          nombre: (c.nombre || c.rol || '').trim().toUpperCase()
        }));
        this.catalogoRoles.set(normalized);
      }
    });

    this.rolesService.getRolesUsuario(u.usuario).subscribe({
      next: (asignados) => {
        const normalized = (asignados ?? []).map((r) => (r || '').trim().toUpperCase());
        this.rolesSeleccionados.set(normalized);
      }
    });
  }

  cerrarModalRoles(): void {
    this.showRolesDialog.set(false);
    this.rolesDialogUsuario.set(null);
  }

  toggleRolSeleccionado(rol: string): void {
    const target = (rol || '').trim().toUpperCase();
    const list = this.rolesSeleccionados().map((r) => (r || '').trim().toUpperCase());
    const index = list.indexOf(target);
    if (index >= 0) {
      list.splice(index, 1);
    } else {
      list.push(target);
    }
    this.rolesSeleccionados.set(list);
  }

  isRolSeleccionado(rol: string): boolean {
    const target = (rol || '').trim().toUpperCase();
    return this.rolesSeleccionados().some((r) => (r || '').trim().toUpperCase() === target);
  }

  guardarRolesUsuario(): void {
    const usuario = this.rolesDialogUsuario();
    if (!usuario || this.savingRoles()) return;

    this.savingRoles.set(true);
    const rolesLimpios = Array.from(
      new Set(this.rolesSeleccionados().map((r) => (r || '').trim().toUpperCase()).filter(Boolean))
    );

    this.rolesService.asignarRolesUsuario(usuario, rolesLimpios, this.idEmpresa)
      .pipe(finalize(() => this.savingRoles.set(false)))
      .subscribe({
        next: () => {
          this.usuarios.update((items) =>
            items.map((u) => (u.usuario.toLowerCase() === usuario.toLowerCase() ? { ...u, roles: rolesLimpios } : u))
          );
          this.messageService.add({ severity: 'success', summary: 'Roles Asignados', detail: `Roles actualizados para ${usuario}` });
          this.cerrarModalRoles();
        },
        error: (err) => {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: err?.error?.message ?? 'No se pudieron guardar los roles.' });
        }
      });
  }
}
