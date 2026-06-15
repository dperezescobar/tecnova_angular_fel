import { Injectable, signal } from '@angular/core';

interface DeferredInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private deferredPromptEvent: DeferredInstallPromptEvent | null = null;

  readonly isInstalled = signal(this.detectInstalledMode());
  readonly isInstallPromptAvailable = signal(false);
  readonly canShowInstallBanner = signal(!this.detectInstalledMode());

  constructor() {
    if (typeof window === 'undefined') {
      return;
    }

    window.addEventListener('beforeinstallprompt', (event: Event) => {
      event.preventDefault();
      this.deferredPromptEvent = event as DeferredInstallPromptEvent;
      this.isInstallPromptAvailable.set(true);
      this.updateBannerVisibility();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPromptEvent = null;
      this.isInstallPromptAvailable.set(false);
      this.isInstalled.set(true);
      this.updateBannerVisibility();
    });

    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const onStandaloneChange = () => {
      this.isInstalled.set(this.detectInstalledMode());
      this.updateBannerVisibility();
    };

    standaloneQuery.addEventListener('change', onStandaloneChange);
    this.updateBannerVisibility();
  }

  async promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    if (!this.deferredPromptEvent) {
      return 'unavailable';
    }

    await this.deferredPromptEvent.prompt();
    const choice = await this.deferredPromptEvent.userChoice;
    this.deferredPromptEvent = null;
    this.isInstallPromptAvailable.set(false);

    if (choice.outcome === 'accepted') {
      this.isInstalled.set(true);
    }

    this.updateBannerVisibility();
    return choice.outcome;
  }

  dismissBanner(): void {
    this.canShowInstallBanner.set(false);
  }

  private updateBannerVisibility(): void {
    this.canShowInstallBanner.set(!this.isInstalled() && this.isInstallPromptAvailable());
  }

  private detectInstalledMode(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    const inStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const iosStandalone = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
    const twaMode = document.referrer.startsWith('android-app://');

    return inStandalone || iosStandalone || twaMode;
  }
}