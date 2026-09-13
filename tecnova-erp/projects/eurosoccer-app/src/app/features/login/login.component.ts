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

  onLogin(event: Event): void {
    event.preventDefault();
    if (!this.usuario.trim() || !this.clave.trim()) {
      this.errorMessage.set('Por favor complete usuario y contraseña.');
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    this.authService.login({ usuario: this.usuario, clave: this.clave }).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigate(['/']);
      },
      error: (err) => {
        this.loading.set(false);
        let msg = err.error?.message;
        if (!msg && err.error?.errors) {
          msg = Object.values(err.error.errors).flat().join('. ');
        }
        this.errorMessage.set(msg || 'Credenciales no válidas o servicio no disponible.');
      }
    });
  }
}