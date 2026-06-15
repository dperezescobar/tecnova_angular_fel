import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';

// PrimeNG v21.1.1
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select'; // Dropdown renombrado a Select

import { AuthService } from '../../../core/services/auth';
import { AuthResponse, Empresa } from '../../../core/models/auth.models';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, 
    ReactiveFormsModule,
    FormsModule,
    CardModule, 
    InputTextModule, 
    PasswordModule, 
    ButtonModule,
    MessageModule,
    SelectModule
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.scss']
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private readonly systemId = 2;

  // Signals para control de estado
  step = signal(1); // 1: Login, 2: Selección Empresa [cite: 461]
  loading = signal(false);
  messageText = signal('');
  messageSeverity = signal<'success' | 'error'>('error');
  accessCodeLoading = signal(false);
  empresas = signal<Empresa[]>([]);
  selectedEmpresaId = signal<number | null>(null);
  
  // Almacenar respuesta de autenticación temporalmente
  private authResponse: AuthResponse | null = null;
// Helper para facilitar mostrar mensajes
  private showMessage(text: string, severity: 'success' | 'error') {
    this.messageSeverity.set(severity);
    this.messageText.set(text);
  }
  private getErrorMessage(error: unknown, fallback: string): string {
    const sanitizeMessage = (message: string): string => {
      const normalized = message.trim();
      const isTechnicalTrace =
        normalized.includes('System.') ||
        normalized.includes('Microsoft.EntityFrameworkCore') ||
        normalized.includes(' at ') ||
        normalized.includes('HEADERS =======') ||
        normalized.includes('StackTrace');

      if (isTechnicalTrace) {
        return 'Ocurrió un error al establecer la sesión. Intenta nuevamente o contacta soporte.';
      }

      return normalized;
    };

    if (typeof error === 'string') {
      return sanitizeMessage(error);
    }

    if (error && typeof error === 'object') {
      const err = error as {
        message?: string;
        error?: { message?: string } | string;
        status?: number;
      };

      if (typeof err.error === 'string' && err.error.trim()) {
        return sanitizeMessage(err.error);
      }

      if (typeof err.error === 'object' && err.error?.message) {
        return sanitizeMessage(err.error.message);
      }

      if (err.message) {
        return sanitizeMessage(err.message);
      }

      if (err.status === 500) {
        return 'Ocurrió un error al establecer la sesión. Intenta nuevamente o contacta soporte.';
      }

      if (err.status) {
        return `${fallback} (HTTP ${err.status})`;
      }
    }

    return fallback;
  }

  loginForm = this.fb.group({
    user: ['', [Validators.required]],
    pass: ['', [Validators.required]],
    idsistema: [this.systemId]
  });
// NUEVO MÉTODO: Ejecuta la llamada a la API
  onRequestAccessCode() {
    const userControl = this.loginForm.get('user');
    if (userControl?.invalid || !userControl?.value) {
      userControl?.markAsTouched();
      return;
    }

    this.accessCodeLoading.set(true);
    this.messageText.set(''); // Limpiar mensajes previos

    this.authService.requestAccessCode(userControl.value).subscribe({
      next: () => {
        this.showMessage('Código enviado a su correo', 'success');
        this.accessCodeLoading.set(false);
      },
      error: () => {
        this.showMessage('Código no enviado, revise su correo', 'error');
        this.accessCodeLoading.set(false);
      }
    });
  }
  onSubmit() {
    if (this.loginForm.invalid) return;

    this.loading.set(true);
    this.messageText.set('');

    const { user, pass, idsistema } = this.loginForm.value;

    // Ejecutamos el login inicial para obtener el Token
    this.authService.login(user!, pass!, idsistema ?? this.systemId).subscribe({
      next: (response) => {
        // Guardamos la respuesta de autenticación
        this.authResponse = response;
        
        // Una vez tenemos token, pedimos las empresas del usuario 
        this.authService.getEmpresas(user!, this.authResponse.token, idsistema ?? this.systemId).subscribe({
          next: (listado) => {
            if (listado.length === 0) {
              this.showMessage('No se encontraron empresas para este usuario.', 'error');
              this.loading.set(false);
              return;
            }

            if (listado.length === 1) {
              // Flujo automático: Solo 1 empresa [cite: 474]
              this.authService.completeLogin(
                this.authResponse!.token,
                this.authResponse!.refreshToken,
                this.authResponse!.username,
                listado[0],
                this.authResponse!
              ).subscribe({
                next: () => {
                  this.loading.set(false);
                },
                error: (err) => {
                  console.error('Error al establecer sesión (empresa única):', err);
                  const msg=this.getErrorMessage(err, 'No se pudo establecer la sesión de empresa.');
                  this.showMessage(msg, 'error');
                  this.loading.set(false);
                }
              });
            } else {
              // Flujo manual: Mostrar selector 
              this.empresas.set(listado);
              this.step.set(2);
              this.loading.set(false);
            }
          },
          error: () => {
            this.showMessage('Error al recuperar empresas.', 'error');
            this.loading.set(false);
          }
        });
      },
      error: () => {
        this.loading.set(false);
        this.messageText.set('Usuario o contraseña incorrectos.');
      }
    });
  }

  // Método para el Paso 2: Selección manual
  onConfirmarEmpresa() {
    if (!this.selectedEmpresaId() || !this.authResponse) return;

    this.loading.set(true);
    this.messageText.set('');

    const empresa = this.empresas().find(e => e.idEmpresa === this.selectedEmpresaId());
    if (empresa) {
      this.authService.completeLogin(
        this.authResponse.token,
        this.authResponse.refreshToken,
        this.authResponse.username,
        empresa,
        this.authResponse
      ).subscribe({
        next: () => {
          this.loading.set(false);
        },
        error: (err) => {
          console.error('Error al establecer sesión (selección manual):', err);
          const msg=this.getErrorMessage(err, 'No se pudo establecer la sesión de empresa.');
          this.showMessage(msg, 'error');
          this.loading.set(false);
        }
      });
      return;
    }

    this.loading.set(false);
  }

  goBack() {
    this.step.set(1);
    this.messageText.set('');
  }
}