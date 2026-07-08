import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

const PALABRA_CONFIRMACION = 'eliminar';
const MENSAJE_DEFAULT = 'Para continuar con la eliminación del documento digite Eliminar y luego clic en Procesar.';

@Component({
  selector: 'app-eliminar-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DialogModule, ButtonModule, InputTextModule],
  templateUrl: './eliminar-confirm-dialog.html',
  styleUrl: './eliminar-confirm-dialog.scss'
})
export class EliminarConfirmDialogComponent {
  visible = signal(false);
  texto = signal('');
  mensaje = signal(MENSAJE_DEFAULT);

  esValido = computed(() => this.texto().trim().toLowerCase() === PALABRA_CONFIRMACION);

  private onConfirmCallback: (() => void) | null = null;

  abrir(onConfirm: () => void, mensaje?: string): void {
    this.texto.set('');
    this.mensaje.set(mensaje?.trim() || MENSAJE_DEFAULT);
    this.onConfirmCallback = onConfirm;
    this.visible.set(true);
  }

  cancelar(): void {
    this.visible.set(false);
    this.onConfirmCallback = null;
  }

  procesar(): void {
    if (!this.esValido()) return;
    const callback = this.onConfirmCallback;
    this.visible.set(false);
    this.onConfirmCallback = null;
    callback?.();
  }
}
