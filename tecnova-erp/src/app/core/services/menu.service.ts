import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
  MenuEfectivo, MenuEmpresaLayout, MenuLayout, MenuModo, MenuOpcion, MenuUsuarioLite
} from '../models/menu.models';

@Injectable({ providedIn: 'root' })
export class MenuService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/Menu`;

  // ---- Estado del menú efectivo del usuario actual (consumido por el sidebar) ----
  private modo = signal<MenuModo>('CLASICO');
  private claves = signal<Set<string>>(new Set());
  readonly cargado = signal(false);
  private ultimaEmpresa = 0;

  /** Carga (o recarga) el menú efectivo para la empresa dada. Fail-open a CLÁSICO ante error. */
  cargarEfectivo(idEmpresa: number, forzar = false): void {
    if (!idEmpresa) {
      this.modo.set('CLASICO');
      this.claves.set(new Set());
      this.cargado.set(true);
      this.ultimaEmpresa = 0;
      return;
    }
    if (!forzar && this.cargado() && this.ultimaEmpresa === idEmpresa) return;
    this.ultimaEmpresa = idEmpresa;

    this.http.get<MenuEfectivo>(`${this.base}/Efectivo`, { params: { idEmpresa } }).subscribe({
      next: (r) => {
        this.modo.set(r?.modo === 'ADMINISTRADO' ? 'ADMINISTRADO' : 'CLASICO');
        this.claves.set(new Set(r?.claves ?? []));
        this.cargado.set(true);
      },
      error: () => {
        this.modo.set('CLASICO'); // ante fallo, no ocultamos nada
        this.claves.set(new Set());
        this.cargado.set(true);
      }
    });
  }

  refrescar(): void {
    if (this.ultimaEmpresa) this.cargarEfectivo(this.ultimaEmpresa, true);
  }

  esClasico(): boolean { return this.modo() === 'CLASICO'; }

  /** ¿La opción es visible para el usuario actual? En modo clásico siempre sí. */
  puedeVer(clave: string): boolean {
    return this.modo() === 'CLASICO' ? true : this.claves().has(clave);
  }

  /** ¿El grupo tiene al menos una opción visible? */
  grupoVisible(claves: string[]): boolean {
    return this.modo() === 'CLASICO' ? true : claves.some((c) => this.claves().has(c));
  }

  // ============ Administración (root) ============
  getOpciones(): Observable<MenuOpcion[]> {
    return this.http.get<MenuOpcion[]>(`${this.base}/Opciones`).pipe(map((r) => r ?? []));
  }

  getLayouts(): Observable<MenuLayout[]> {
    return this.http.get<MenuLayout[]>(`${this.base}/Layouts`).pipe(map((r) => r ?? []));
  }

  crearLayout(nombre: string, descripcion: string): Observable<{ idLayout: number }> {
    return this.http.post<{ idLayout: number }>(`${this.base}/Layouts`, { nombre, descripcion });
  }

  editarLayout(id: number, nombre: string, descripcion: string, activo: boolean): Observable<void> {
    return this.http.put<void>(`${this.base}/Layouts/${id}`, { nombre, descripcion, activo });
  }

  getLayoutOpciones(id: number): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/Layouts/${id}/Opciones`).pipe(map((r) => r ?? []));
  }

  guardarLayoutOpciones(id: number, claves: string[]): Observable<void> {
    return this.http.put<void>(`${this.base}/Layouts/${id}/Opciones`, { claves });
  }

  getEmpresas(): Observable<MenuEmpresaLayout[]> {
    return this.http.get<MenuEmpresaLayout[]>(`${this.base}/Empresas`).pipe(map((r) => r ?? []));
  }

  asignarEmpresa(idEmpresa: number, idLayout: number, activo: boolean): Observable<void> {
    return this.http.put<void>(`${this.base}/Empresas/${idEmpresa}`, { idLayout, activo });
  }

  revertirEmpresa(idEmpresa: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/Empresas/${idEmpresa}`);
  }

  getUsuariosEmpresa(idEmpresa: number): Observable<MenuUsuarioLite[]> {
    return this.http.get<MenuUsuarioLite[]>(`${this.base}/Empresas/${idEmpresa}/Usuarios`).pipe(map((r) => r ?? []));
  }

  getExcepciones(usuario: string, idEmpresa: number): Observable<string[]> {
    return this.http
      .get<string[]>(`${this.base}/Excepciones`, { params: { usuario, idEmpresa } })
      .pipe(map((r) => r ?? []));
  }

  guardarExcepciones(usuario: string, idEmpresa: number, claves: string[]): Observable<void> {
    return this.http.put<void>(`${this.base}/Excepciones`, { usuario, idEmpresa, claves });
  }
}
