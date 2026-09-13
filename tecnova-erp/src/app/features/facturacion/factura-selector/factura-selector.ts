import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
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
  private authService = inject(AuthService);
  emiteDte = computed(() => !!this.authService.currentUser()?.selectedEmpresa?.emiteDte);

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      const idEmpresa = Number(user?.selectedEmpresa?.idEmpresa || 0);

      if (idEmpresa && idEmpresa !== 16) {
        const destino = this.tipoFactura() === 'CCF'
          ? '/facturacion/ccf-ampliada'
          : '/facturacion/fac-ampliada';
        this.router.navigate([destino], {
          queryParams: this.route.snapshot.queryParams,
          replaceUrl: true
        });
      }
    });
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
