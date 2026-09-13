import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';
import { forkJoin } from 'rxjs';
import { PosHibridoConfigService } from '../../facturacion/pos-hibrido/pos-hibrido-config.service';
import { FacturacionService } from '../../facturacion/services/facturacion';
import { PosHibridoConfigDto, PosModoDocumento, PosRubroConfigDto, PosUsuarioRubroDto } from '../../../core/models/facturacion.models';

interface RubroRow {
  grupoInventario1: string;
  descripcion: string;
  modoDocumento: PosModoDocumento;
  activo: boolean;
}

/**
 * Administración del POS Híbrido - Fase 2 (recibos consolidables). Root/admin. Todo lo que se
 * configura aquí es opt-in por empresa: sin activar el interruptor, pos-hibrido sigue funcionando
 * exactamente igual que antes (una FAC por venta, sin restricciones de rubro por usuario).
 */
@Component({
  selector: 'app-pos-hibrido-config',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './pos-hibrido-config.html',
  styleUrls: ['./pos-hibrido-config.scss']
})
export class PosHibridoConfigComponent {
  private svc = inject(PosHibridoConfigService);
  private facturacionService = inject(FacturacionService);

  cargando = signal(true);
  guardandoConfig = signal(false);
  guardandoRubros = signal(false);
  guardandoUsuario = signal(false);
  sinPermiso = signal(false);
  mensaje = signal<{ tipo: 'error' | 'ok'; texto: string } | null>(null);

  activo = signal(false);
  rubros = signal<RubroRow[]>([]);

  usuarios = signal<{ usuario: string; nombre: string }[]>([]);
  usuarioSel = signal<string>('');
  private usuarioRubroCache = new Map<string, PosUsuarioRubroDto[]>();
  permitidos = signal<Record<string, boolean>>({}); // grupo -> permitido, para el usuario seleccionado
  tieneRestriccion = computed(() => Object.keys(this.permitidos()).length > 0);

  constructor() {
    this.cargar();
  }

  private cargar(): void {
    this.cargando.set(true);
    this.mensaje.set(null);
    forkJoin({
      config: this.svc.getConfig(),
      rubroConfig: this.svc.getRubroConfig(),
      articulos: this.facturacionService.getArticulosPorBodega('BOD01'),
      usuarios: this.svc.getUsuariosEmpresa()
    })
      .pipe(finalize(() => this.cargando.set(false)))
      .subscribe({
        next: ({ config, rubroConfig, articulos, usuarios }) => {
          this.activo.set(!!config?.activo);
          this.usuarios.set(usuarios ?? []);

          const porGrupo = new Map<string, string>();
          for (const a of articulos ?? []) {
            const cod = (a.GRUPO_COD ?? '').trim();
            if (cod && !porGrupo.has(cod)) porGrupo.set(cod, (a.GRUPO_DESC ?? '').trim() || cod);
          }
          const existentes = new Map((rubroConfig ?? []).map((r) => [r.grupoInventario1, r]));
          const filas: RubroRow[] = Array.from(porGrupo.entries()).map(([cod, desc]) => {
            const ex = existentes.get(cod);
            return { grupoInventario1: cod, descripcion: desc, modoDocumento: ex?.modoDocumento ?? 'FACTURA_DIRECTA', activo: ex?.activo ?? true };
          });
          this.rubros.set(filas.sort((a, b) => a.descripcion.localeCompare(b.descripcion)));
        },
        error: (err) => {
          if (err?.status === 403) this.sinPermiso.set(true);
          this.mensaje.set({ tipo: 'error', texto: 'No se pudo cargar la configuración.' });
        }
      });
  }

  guardarActivo(): void {
    this.guardandoConfig.set(true);
    this.mensaje.set(null);
    const dto: PosHibridoConfigDto = { idEmpresa: 0, activo: this.activo() };
    this.svc.putConfig(dto)
      .pipe(finalize(() => this.guardandoConfig.set(false)))
      .subscribe({
        next: () => this.mensaje.set({ tipo: 'ok', texto: this.activo() ? 'POS Híbrido activado.' : 'POS Híbrido desactivado (vuelve al comportamiento actual).' }),
        error: (err) => this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) })
      });
  }

  setModo(grupo: string, modo: PosModoDocumento): void {
    this.rubros.update((rows) => rows.map((r) => (r.grupoInventario1 === grupo ? { ...r, modoDocumento: modo } : r)));
  }

  toggleRubroActivo(grupo: string): void {
    this.rubros.update((rows) => rows.map((r) => (r.grupoInventario1 === grupo ? { ...r, activo: !r.activo } : r)));
  }

  guardarRubros(): void {
    this.guardandoRubros.set(true);
    this.mensaje.set(null);
    const items: PosRubroConfigDto[] = this.rubros().map((r) => ({ grupoInventario1: r.grupoInventario1, modoDocumento: r.modoDocumento, activo: r.activo }));
    this.svc.putRubroConfig(items)
      .pipe(finalize(() => this.guardandoRubros.set(false)))
      .subscribe({
        next: () => this.mensaje.set({ tipo: 'ok', texto: 'Configuración de rubros guardada.' }),
        error: (err) => this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) })
      });
  }

  seleccionarUsuario(usuario: string): void {
    this.usuarioSel.set(usuario);
    this.mensaje.set(null);
    if (!usuario) { this.permitidos.set({}); return; }
    if (this.usuarioRubroCache.has(usuario)) {
      this.setPermitidosDesde(this.usuarioRubroCache.get(usuario)!);
      return;
    }
    this.svc.getUsuarioRubro(usuario).subscribe({
      next: (rows) => { this.usuarioRubroCache.set(usuario, rows ?? []); this.setPermitidosDesde(rows ?? []); },
      error: () => this.permitidos.set({})
    });
  }

  private setPermitidosDesde(rows: PosUsuarioRubroDto[]): void {
    const map: Record<string, boolean> = {};
    for (const r of rows) map[r.grupoInventario1] = r.permitido;
    this.permitidos.set(map);
  }

  toggleRestriccion(): void {
    if (this.tieneRestriccion()) {
      this.permitidos.set({}); // quitar toda restricción = vuelve a ver todo (default)
    } else {
      const map: Record<string, boolean> = {};
      for (const r of this.rubros()) map[r.grupoInventario1] = true; // arrancar permitiendo todo, luego el admin desmarca
      this.permitidos.set(map);
    }
  }

  toggleGrupoUsuario(grupo: string): void {
    this.permitidos.update((m) => ({ ...m, [grupo]: !m[grupo] }));
  }

  guardarUsuarioRubro(): void {
    const usuario = this.usuarioSel();
    if (!usuario) return;
    this.guardandoUsuario.set(true);
    this.mensaje.set(null);
    const items: PosUsuarioRubroDto[] = Object.entries(this.permitidos()).map(([grupo, permitido]) => ({ usuario, grupoInventario1: grupo, permitido }));
    this.svc.putUsuarioRubro(usuario, items)
      .pipe(finalize(() => this.guardandoUsuario.set(false)))
      .subscribe({
        next: () => { this.usuarioRubroCache.set(usuario, items); this.mensaje.set({ tipo: 'ok', texto: `Rubros de ${usuario} actualizados.` }); },
        error: (err) => this.mensaje.set({ tipo: 'error', texto: this.errorTexto(err) })
      });
  }

  private errorTexto(err: unknown): string {
    const e = err as { error?: { message?: string }; status?: number } | undefined;
    if (e?.status === 403) return 'Solo un administrador puede hacer este cambio.';
    return e?.error?.message ?? 'Ocurrió un error inesperado.';
  }
}
