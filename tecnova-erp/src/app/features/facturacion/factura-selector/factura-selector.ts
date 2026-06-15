import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { FacturacionService } from '../services/facturacion';
import { AuthService } from '../../../core/services/auth';

type TipoFactura = 'FAC' | 'CCF';

@Component({
  selector: 'app-factura-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, CardModule],
  templateUrl: './factura-selector.html',
  styleUrls: ['./factura-selector.scss']
})
export class FacturaSelectorComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
 private facturacionService = inject(FacturacionService);
 private authService = inject(AuthService);
  emiteDte = signal<boolean>(false); // Signal para controlar si se emite DTE o no

 constructor() {
 const idEmpresa = this.authService.currentUser()?.selectedEmpresa?.idEmpresa;
    if (idEmpresa) {
        this.facturacionService.getEmiteDte(idEmpresa).subscribe(status => {
            this.emiteDte.set(status); // 'emiteDte' es tu Signal<boolean>
        });
    }
 }
  readonly tipoFactura = computed<TipoFactura>(() => {
    const raw = String(this.route.snapshot.data['tipoFactura'] ?? 'FAC').trim().toUpperCase();
    return raw === 'CCF' ? 'CCF' : 'FAC';
  });

  readonly etiqueta = computed(() =>
    this.tipoFactura() === 'CCF' ? 'Crédito Fiscal' : 'Consumidor Final'
  );

  abrirFacturaRapida() {
    this.router.navigate(['/facturacion/fac-pos'], {
      queryParams: { tipoFactura: this.tipoFactura() }
    });
  }

  abrirFacturaAmpliada() {
    const destino = this.tipoFactura() === 'CCF'
      ? '/facturacion/ccf-ampliada'
      : '/facturacion/fac-ampliada';

    this.router.navigate([destino]);
  }
}
