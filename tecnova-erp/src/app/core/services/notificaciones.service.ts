import { Injectable, inject, signal } from '@angular/core';
import { PerfilService } from '../../features/perfil/services/perfil.service';

@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private perfilService = inject(PerfilService);

  /** true = hay al menos un abono Pendiente */
  tienePendientes = signal(false);
  /** true = ya se hizo la verificación inicial (evita re-llamadas) */
  yaVerificado = signal(false);

  verificarAbonos(idEmpresa: number): void {
    if (!idEmpresa) { return; }
    this.perfilService.getAbonosEmpresa(idEmpresa).subscribe({
      next: (abonos) => {
        const hasPending = abonos.some(
          (a) => (a.estado ?? '').toLowerCase() === 'pendiente'
        );
        this.tienePendientes.set(hasPending);
        this.yaVerificado.set(true);
      },
      error: () => {
        this.yaVerificado.set(true);
      },
    });
  }

  marcarVisto(): void {
    this.tienePendientes.set(false);
  }
}
