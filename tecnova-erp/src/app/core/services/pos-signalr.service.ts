import { Injectable, inject, signal } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth';

export interface SolicitudAjusteRespuesta {
  solicitudID: number;
  cajaID: number;
  articuloID: string;
  aprobado: boolean;
  precioFinal: number;
  usuarioAprobo: string;
  estado: 'APROBADO' | 'RECHAZADO';
}

export interface SolicitudAjustePendiente {
  solicitudID: number;
  cajaID: number;
  usuarioCajero: string;
  articuloID: string;
  articuloDescripcion: string;
  precioSistema: number;
  precioSolicitado: number;
  motivo: string;
  fechaSolicitud: string;
}

@Injectable({
  providedIn: 'root'
})
export class PosSignalRService {
  private auth = inject(AuthService);
  private hubConnection?: signalR.HubConnection;

  // Conteo de consumidores del hub (singleton compartido: manager en main-layout + caja en POS).
  // El último en salir es el único que puede detener la conexión (evita que el POS mate la del manager).
  private refCount = 0;
  private starting?: Promise<void>;
  private suscritoManager = false;
  private cajasSuscritas = new Set<number>();

  public respuestaAjusteSignal = signal<SolicitudAjusteRespuesta | null>(null);
  public nuevaSolicitudSignal = signal<SolicitudAjustePendiente | null>(null);
  public conectado = signal<boolean>(false);

  public async iniciarConexion(cajaId: number = 1, esManager: boolean = false): Promise<void> {
    this.refCount++;
    await this.asegurarConexion();

    // Re-suscribir el rol aunque la conexión ya existiera (antes se omitía y la caja nunca se unía al grupo).
    if (!this.hubConnection || this.hubConnection.state !== signalR.HubConnectionState.Connected) return;
    try {
      if (esManager) {
        if (!this.suscritoManager) { await this.hubConnection.invoke('SuscribirManager'); this.suscritoManager = true; }
      } else if (!this.cajasSuscritas.has(cajaId)) {
        await this.hubConnection.invoke('SuscribirCaja', cajaId);
        this.cajasSuscritas.add(cajaId);
      }
    } catch (err) {
      console.error('Error suscribiendo al hub de autorizaciones:', err);
    }
  }

  private async asegurarConexion(): Promise<void> {
    if (this.hubConnection && this.hubConnection.state === signalR.HubConnectionState.Connected) return;
    if (this.starting) return this.starting;

    const hubUrl = `${environment.apiUrl.replace('/api', '')}/hubs/autorizaciones`;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
        accessTokenFactory: () => this.auth.getAccessToken() ?? ''
      })
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('RecibirSolicitudResuelta', (respuesta: SolicitudAjusteRespuesta) => {
      this.respuestaAjusteSignal.set(respuesta);
    });

    this.hubConnection.on('RecibirNuevaSolicitud', (solicitud: SolicitudAjustePendiente) => {
      this.nuevaSolicitudSignal.set(solicitud);
    });

    // Al reconectar, los grupos se pierden en el servidor: hay que re-suscribir.
    this.hubConnection.onreconnected(async () => {
      this.conectado.set(true);
      try {
        if (this.suscritoManager) await this.hubConnection?.invoke('SuscribirManager');
        for (const caja of this.cajasSuscritas) await this.hubConnection?.invoke('SuscribirCaja', caja);
      } catch (err) {
        console.error('Error re-suscribiendo tras reconexión:', err);
      }
    });

    this.starting = (async () => {
      try {
        await this.hubConnection!.start();
        this.conectado.set(true);
      } catch (err) {
        console.error('Error conectando a SignalR Hub:', err);
        this.conectado.set(false);
      } finally {
        this.starting = undefined;
      }
    })();

    return this.starting;
  }

  /**
   * Libera un consumidor del hub. Solo detiene la conexión cuando ya nadie la usa,
   * de modo que salir del POS no derribe la conexión que el manager mantiene en el layout.
   */
  public async detenerConexion(): Promise<void> {
    this.refCount = Math.max(0, this.refCount - 1);
    if (this.refCount > 0) return;

    if (this.hubConnection) {
      try { await this.hubConnection.stop(); } catch { /* noop */ }
      this.conectado.set(false);
      this.suscritoManager = false;
      this.cajasSuscritas.clear();
    }
  }
}
