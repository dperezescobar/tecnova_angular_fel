import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { EuroSwUpdateService } from './core/euro-sw-update.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    @if (swUpdateService.updateAvailable()) {
      <div class="sw-update-banner">
        <div class="sw-update-content">
          <div class="sw-update-text">
            <i class="fa-solid fa-arrows-rotate"></i>
            <span>Nueva versión disponible para <b>EuroSoccer</b>.</span>
          </div>
          <button type="button" class="sw-update-btn" (click)="swUpdateService.aplicarActualizacion()" [disabled]="swUpdateService.isActivating()">
            <i class="fa-solid fa-rotate-right" [class.fa-spin]="swUpdateService.isActivating()"></i>
            <span>{{ swUpdateService.isActivating() ? 'Aplicando...' : 'Actualizar ahora' }}</span>
          </button>
        </div>
      </div>
    }
    <router-outlet></router-outlet>
  `,
  styles: [`
    .sw-update-banner {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      width: 90%;
      max-width: 560px;
      background: #0b1120;
      color: #f1f5f9;
      padding: 10px 18px;
      border-radius: 9999px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.35), 0 8px 10px -6px rgba(0, 0, 0, 0.2);
      border: 1px solid #24344d;
      animation: swSlideDown 0.35s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .sw-update-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      font-size: 0.875rem;
    }

    .sw-update-text {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 400;
      color: #34d399;
    }

    .sw-update-text b {
      font-weight: 600;
      color: #10b981;
    }

    .sw-update-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #10b981;
      color: #ffffff;
      border: none;
      padding: 6px 14px;
      font-size: 0.8125rem;
      font-weight: 600;
      border-radius: 9999px;
      cursor: pointer;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .sw-update-btn:hover:not(:disabled) {
      background: #059669;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
    }

    .sw-update-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .sw-update-btn:disabled {
      opacity: 0.7;
      cursor: wait;
    }

    @keyframes swSlideDown {
      from {
        opacity: 0;
        transform: translate(-50%, -20px);
      }
      to {
        opacity: 1;
        transform: translate(-50%, 0);
      }
    }
  `]
})
export class AppComponent {
  readonly swUpdateService = inject(EuroSwUpdateService);
}
