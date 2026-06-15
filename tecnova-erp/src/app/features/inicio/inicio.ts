import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/services/auth';

@Component({
  selector: 'app-inicio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './inicio.html',
  styleUrls: ['./inicio.scss']
})
export class InicioComponent {
  private authService = inject(AuthService);

  imageError = signal(false);
  logoSrc = signal('');

  readonly empresa = computed(() => this.authService.currentUser()?.selectedEmpresa ?? null);

  readonly nombreComercial = computed(() => {
    const empresa = this.empresa();
    return empresa?.nombreComercial?.trim() || 'Empresa';
  });

  readonly logoUrl = computed(() => {
    const empresa = this.empresa();
    const base = String(empresa?.urlServicio ?? empresa?.urlApi ?? '').trim();
    if (!base) {
      return '';
    }

    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    return `${normalizedBase}BackgroundLogo.png`;
  });

  readonly fallbackLogoUrl = computed(() => {
    const rawLogo = String(this.empresa()?.logo ?? '').trim();
    if (!rawLogo) {
      return '';
    }

    if (/^data:image\//i.test(rawLogo)) {
      return rawLogo;
    }

    return `data:image/png;base64,${rawLogo}`;
  });

  constructor() {
    effect(() => {
      const primaryLogo = this.logoUrl();
      const fallbackLogo = this.fallbackLogoUrl();
      this.imageError.set(false);
      this.logoSrc.set(primaryLogo || fallbackLogo || '');
    });
  }

  onImageError(): void {
    const primaryLogo = this.logoUrl();
    const fallbackLogo = this.fallbackLogoUrl();

    if (fallbackLogo && this.logoSrc() !== fallbackLogo) {
      this.logoSrc.set(fallbackLogo);
      return;
    }

    if (!primaryLogo && fallbackLogo && this.logoSrc() !== fallbackLogo) {
      this.logoSrc.set(fallbackLogo);
      return;
    }

    this.imageError.set(true);
  }
}
