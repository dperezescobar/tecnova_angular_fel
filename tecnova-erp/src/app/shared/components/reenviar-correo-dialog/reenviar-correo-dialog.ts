import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { Observable, finalize } from 'rxjs';
import { FacturacionService } from '../../../features/facturacion/services/facturacion';

@Component({
  selector: 'app-reenviar-correo-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule],
  templateUrl: './reenviar-correo-dialog.html',
  styleUrl: './reenviar-correo-dialog.scss'
})
export class ReenviarCorreoDialogComponent {
  private facturacionService = inject(FacturacionService);
  private messageService = inject(MessageService);

  visible = signal(false);
  correo = signal('');
  enviando = signal(false);

  private idEmpresa = 0;
  private idFactura = 0;
  private tipoFactura = '';
  private enviarFn: ((correoDestino: string) => Observable<unknown>) | null = null;

  // enviarFn es opcional: si se pasa, el diálogo lo usa en vez de reenviarCorreoDte (maildte).
  // Los módulos que no lo pasan mantienen exactamente el comportamiento de siempre.
  abrir(idEmpresa: number, idFactura: number, tipoFactura: string, correoDefault: string, enviarFn?: (correoDestino: string) => Observable<unknown>): void {
    this.idEmpresa = idEmpresa;
    this.idFactura = idFactura;
    this.tipoFactura = tipoFactura;
    this.enviarFn = enviarFn ?? null;
    this.correo.set(correoDefault ?? '');
    this.visible.set(true);
  }

  cerrar(): void {
    if (this.enviando()) return;
    this.visible.set(false);
  }

  reenviar(): void {
    const correoDestino = this.correo().trim();
    if (!correoDestino) {
      this.messageService.add({ severity: 'warn', summary: 'Correo requerido', detail: 'Ingrese un correo de destino.' });
      return;
    }

    this.enviando.set(true);
    const envio$ = this.enviarFn
      ? this.enviarFn(correoDestino)
      : this.facturacionService.reenviarCorreoDte(this.idEmpresa, this.idFactura, this.tipoFactura, correoDestino);

    envio$
      .pipe(finalize(() => this.enviando.set(false)))
      .subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Correo reenviado',
            detail: `Se reenvió correctamente a ${correoDestino}.`
          });
          this.visible.set(false);
        },
        error: (err) => {
          const detail = typeof err?.error === 'string' && err.error.trim() ? err.error : 'No se pudo reenviar el correo.';
          this.messageService.add({ severity: 'error', summary: 'Error al reenviar', detail });
        }
      });
  }
}
