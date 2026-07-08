import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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
import { AuthService } from '../../../core/services/auth';
import { ReiniciarPasswordResponse, UsuarioListado } from '../../../core/models/usuarios-admin.models';

@Component({
  selector: 'app-admin-usuarios',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
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
  private authService = inject(AuthService);
  private confirmationService = inject(ConfirmationService);
  private messageService = inject(MessageService);
  private fb = inject(FormBuilder);

  private readonly idSistema = 2;

  usuarios = signal<UsuarioListado[]>([]);
  loading = signal(false);
  saving = signal(false);
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

  loadUsuarios() {
    if (!this.idEmpresa) {
      this.errorMessage.set('No hay una empresa seleccionada.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.usuariosService
      .getListado(this.idEmpresa, this.idSistema)
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (list) => this.usuarios.set(list ?? []),
        error: () => this.errorMessage.set('No se pudo cargar el listado de usuarios.')
      });
  }

  openCreateForm() {
    this.isEditMode.set(false);
    this.editandoUsuario.set(null);
    this.showForm.set(true);
    this.errorMessage.set('');

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
          activo: !!value.activo
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

    this.usuariosService
      .crear({
        usuario: value.correo ?? '',
        password: value.password ?? '',
        nombre: value.nombre ?? '',
        tipo: value.tipo,
        correo: value.correo ?? '',
        activo: !!value.activo,
        dui: value.dui ?? '',
        idEmpresa: this.idEmpresa,
        idSistema: this.idSistema
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
}
