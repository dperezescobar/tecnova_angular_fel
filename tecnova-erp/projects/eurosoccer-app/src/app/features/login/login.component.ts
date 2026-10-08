import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EuroAuthService } from '../../core/euro-auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent {
  private authService = inject(EuroAuthService);
  private router = inject(Router);

  usuario = '';
  clave = '';
  loading = signal(false);
  errorMessage = signal('');
  cambioPassword = signal(false);
  passwordNueva = '';
  passwordConfirmar = '';
  private passwordActual = '';

  private mensajeError(err: any): string {
    let msg = err?.error?.message;
    if (!msg && typeof err?.error === 'string') msg = err.error;
    if (!msg && err?.error?.errors) {
      msg = Object.values(err.error.errors).flat().join('. ');
    }
    return msg || 'Credenciales no válidas o servicio no disponible.';
  }

  onLogin(event: Event): void {
    event.preventDefault();
    if (!this.usuario.trim() || !this.clave.trim()) {
      this.errorMessage.set('Por favor complete usuario y contraseña.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.login({ usuario: this.usuario, clave: this.clave }).subscribe({
      next: (res) => {
        this.loading.set(false);
        if ('requierePasswordChange' in res) {
          this.passwordActual = this.clave;
          this.passwordNueva = '';
          this.passwordConfirmar = '';
          this.cambioPassword.set(true);
          return;
        }
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(this.mensajeError(err));
      }
    });
  }

  onCambioPassword(event: Event): void {
    event.preventDefault();
    if (this.passwordNueva.trim().length < 6) {
      this.errorMessage.set('La nueva contraseña debe tener mínimo 6 caracteres.');
      return;
    }
    if (this.passwordNueva !== this.passwordConfirmar) {
      this.errorMessage.set('Las contraseñas no coinciden.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.completarCambioPassword({
      usuario: this.usuario,
      passwordActual: this.passwordActual,
      passwordNueva: this.passwordNueva,
      passwordConfirmar: this.passwordConfirmar
    }).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set(this.mensajeError(err));
      }
    });
  }

  cancelarCambioPassword(): void {
    this.cambioPassword.set(false);
    this.clave = '';
    this.errorMessage.set('');
  }
}
