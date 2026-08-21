import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';

import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService, MessageService } from 'primeng/api';

import { MenuService } from '../../../core/services/menu.service';
import { MenuEmpresaLayout, MenuLayout, MenuOpcion, MenuUsuarioLite } from '../../../core/models/menu.models';

interface GrupoArbol {
  clave: string;
  label: string;
  icono?: string | null;
  requiereInventario: boolean;
  hijos: MenuOpcion[];
}

type Tab = 'layouts' | 'empresas' | 'usuarios' | 'catalogo';

@Component({
  selector: 'app-admin-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ToastModule, ConfirmDialogModule],
  providers: [ConfirmationService, MessageService],
  templateUrl: './admin-menu.html',
  styleUrls: ['./admin-menu.scss']
})
export class AdminMenuComponent {
  private menu = inject(MenuService);
  private confirm = inject(ConfirmationService);
  private toast = inject(MessageService);

  tab = signal<Tab>('layouts');

  // Catálogo
  opciones = signal<MenuOpcion[]>([]);
  // Layouts
  layouts = signal<MenuLayout[]>([]);
  layoutSelId = signal<number | null>(null);
  layoutClaves = signal<Set<string>>(new Set());
  layoutDirty = signal(false);
  savingLayout = signal(false);
  // Empresas
  empresas = signal<MenuEmpresaLayout[]>([]);
  empFiltro = signal('');
  // Usuarios
  usuariosEmp = signal<MenuUsuarioLite[]>([]);
  userEmpresaId = signal<number | null>(null);
  userSel = signal<string | null>(null);
  concedidas = signal<Set<string>>(new Set());
  denegadas = signal<Set<string>>(new Set());

  // Dialog nuevo layout
  showLayoutDialog = signal(false);
  nuevoNombre = signal('');
  nuevoDescripcion = signal('');

  loading = signal(false);

  constructor() {
    this.menu.getOpciones().subscribe({
      next: (o) => {
        this.opciones.set(o);
        this.cargarLayouts(true);
      },
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el catálogo de opciones.' })
    });
    this.cargarEmpresas();
  }

  setTab(t: Tab) { this.tab.set(t); }

  // ---------- Árbol (grupos + hojas no-root) ----------
  arbol = computed<GrupoArbol[]>(() => {
    const ops = this.opciones();
    if (!ops.length) return [];
    const byClave = new Map(ops.map((o) => [o.clave, o]));
    const topAncestor = (o: MenuOpcion): MenuOpcion => {
      let cur = o;
      let guard = 0;
      while (cur.clavePadre && byClave.has(cur.clavePadre) && guard++ < 10) {
        cur = byClave.get(cur.clavePadre)!;
      }
      return cur;
    };
    const grupos = new Map<string, GrupoArbol>();
    const orden = new Map<string, number>();
    ops
      .filter((o) => o.activo && !o.soloRoot && !!o.ruta) // hojas navegables
      .sort((a, b) => a.orden - b.orden)
      .forEach((leaf) => {
        const top = topAncestor(leaf);
        const esStandalone = top.clave === leaf.clave; // hoja de primer nivel
        const key = esStandalone ? 'GENERAL' : top.clave;
        if (!grupos.has(key)) {
          grupos.set(key, {
            clave: key,
            label: esStandalone ? 'General' : top.descripcion,
            icono: esStandalone ? 'bi bi-dot' : top.icono,
            requiereInventario: esStandalone ? false : top.requiereInventario,
            hijos: []
          });
          orden.set(key, esStandalone ? 999 : top.orden);
        }
        grupos.get(key)!.hijos.push(leaf);
      });
    return [...grupos.values()].sort((a, b) => (orden.get(a.clave)! - orden.get(b.clave)!));
  });

  totalLeaves = computed(() => this.arbol().reduce((n, g) => n + g.hijos.length, 0));

  // ---------- Layouts ----------
  layoutSel = computed(() => this.layouts().find((l) => l.idLayout === this.layoutSelId()) ?? null);
  layoutCount = computed(() => this.layoutClaves().size);

  cargarLayouts(seleccionarPrimeroEditable = false) {
    this.menu.getLayouts().subscribe({
      next: (ls) => {
        this.layouts.set(ls);
        if (seleccionarPrimeroEditable && this.layoutSelId() == null) {
          const editable = ls.find((l) => !l.esBase);
          if (editable) this.seleccionarLayout(editable);
        }
      },
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los layouts.' })
    });
  }

  seleccionarLayout(l: MenuLayout) {
    this.layoutSelId.set(l.idLayout);
    this.layoutDirty.set(false);
    if (l.esBase) {
      this.layoutClaves.set(new Set(this.arbol().flatMap((g) => g.hijos.map((h) => h.clave))));
      return;
    }
    this.menu.getLayoutOpciones(l.idLayout).subscribe({
      next: (claves) => this.layoutClaves.set(new Set(claves)),
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las opciones del layout.' })
    });
  }

  esClaveEnLayout(clave: string): boolean { return this.layoutClaves().has(clave); }

  toggleClave(clave: string) {
    if (this.layoutSel()?.esBase) return;
    const s = new Set(this.layoutClaves());
    s.has(clave) ? s.delete(clave) : s.add(clave);
    this.layoutClaves.set(s);
    this.layoutDirty.set(true);
  }

  contarEnLayout(g: GrupoArbol): number {
    return g.hijos.filter((h) => this.layoutClaves().has(h.clave)).length;
  }

  estadoGrupo(g: GrupoArbol): 'all' | 'some' | 'none' {
    const on = g.hijos.filter((h) => this.layoutClaves().has(h.clave)).length;
    return on === 0 ? 'none' : on === g.hijos.length ? 'all' : 'some';
  }

  toggleGrupo(g: GrupoArbol) {
    if (this.layoutSel()?.esBase) return;
    const s = new Set(this.layoutClaves());
    const encender = this.estadoGrupo(g) !== 'all';
    g.hijos.forEach((h) => (encender ? s.add(h.clave) : s.delete(h.clave)));
    this.layoutClaves.set(s);
    this.layoutDirty.set(true);
  }

  guardarLayout() {
    const l = this.layoutSel();
    if (!l || l.esBase) return;
    this.savingLayout.set(true);
    this.menu.guardarLayoutOpciones(l.idLayout, [...this.layoutClaves()])
      .pipe(finalize(() => this.savingLayout.set(false)))
      .subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Layout guardado', detail: l.nombre });
          this.layoutDirty.set(false);
          this.cargarLayouts();
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message ?? 'No se pudo guardar.' })
      });
  }

  abrirNuevoLayout() {
    this.nuevoNombre.set('');
    this.nuevoDescripcion.set('');
    this.showLayoutDialog.set(true);
  }

  crearLayout() {
    const nombre = this.nuevoNombre().trim();
    if (!nombre) {
      this.toast.add({ severity: 'warn', summary: 'Falta el nombre', detail: 'Ingresa un nombre para el layout.' });
      return;
    }
    this.menu.crearLayout(nombre, this.nuevoDescripcion().trim()).subscribe({
      next: (r) => {
        this.toast.add({ severity: 'success', summary: 'Layout creado', detail: nombre });
        this.showLayoutDialog.set(false);
        this.menu.getLayouts().subscribe((ls) => {
          this.layouts.set(ls);
          const nuevo = ls.find((l) => l.idLayout === r.idLayout);
          if (nuevo) this.seleccionarLayout(nuevo);
        });
      },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message ?? 'No se pudo crear el layout.' })
    });
  }

  // ---------- Empresas ----------
  cargarEmpresas() {
    this.loading.set(true);
    this.menu.getEmpresas().pipe(finalize(() => this.loading.set(false))).subscribe({
      next: (e) => this.empresas.set(e),
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las empresas.' })
    });
  }

  empresasFiltradas = computed(() => {
    const t = this.empFiltro().trim().toLowerCase();
    const e = this.empresas();
    if (!t) return e;
    return e.filter((x) => x.nombre.toLowerCase().includes(t) || (x.nrc ?? '').toLowerCase().includes(t));
  });

  contar(estado: string) { return this.empresas().filter((e) => e.estado === estado).length; }

  layoutsAsignables = computed(() => this.layouts()); // incluye Clásico (base) para revertir

  onCambiarLayout(emp: MenuEmpresaLayout, idLayoutStr: string) {
    const idLayout = Number(idLayoutStr);
    const base = this.layouts().find((l) => l.esBase);
    if (base && idLayout === base.idLayout) { this.revertir(emp, true); return; }
    this.menu.asignarEmpresa(emp.idEmpresa, idLayout, false).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'Layout preparado', detail: emp.nombre }); this.cargarEmpresas(); },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message ?? 'No se pudo asignar.' })
    });
  }

  activar(emp: MenuEmpresaLayout) {
    if (!emp.idLayout) return;
    this.menu.asignarEmpresa(emp.idEmpresa, emp.idLayout, true).subscribe({
      next: () => { this.toast.add({ severity: 'success', summary: 'Empresa migrada', detail: emp.nombre }); this.cargarEmpresas(); },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message ?? 'No se pudo activar.' })
    });
  }

  revertir(emp: MenuEmpresaLayout, silencioso = false) {
    const hacer = () => this.menu.revertirEmpresa(emp.idEmpresa).subscribe({
      next: () => { this.toast.add({ severity: 'info', summary: 'Revertida a Clásico', detail: emp.nombre }); this.cargarEmpresas(); },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message ?? 'No se pudo revertir.' })
    });
    if (silencioso) { hacer(); return; }
    this.confirm.confirm({
      header: 'Revertir a Clásico',
      message: `¿Devolver a ${emp.nombre} al menú clásico? Sus usuarios volverán a ver el menú actual completo.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Revertir', rejectLabel: 'Cancelar',
      accept: hacer
    });
  }

  // ---------- Usuarios ----------
  onSelEmpresaUser(idStr: string) {
    const id = Number(idStr);
    this.userEmpresaId.set(id || null);
    this.userSel.set(null);
    this.denegadas.set(new Set());
    this.usuariosEmp.set([]);
    if (!id) return;
    this.menu.getUsuariosEmpresa(id).subscribe({
      next: (us) => this.usuariosEmp.set(us),
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar los usuarios.' })
    });
    // Opciones que la empresa concede (según su layout activo, o todas si es clásico)
    const emp = this.empresas().find((e) => e.idEmpresa === id);
    const todas = new Set(this.arbol().flatMap((g) => g.hijos.map((h) => h.clave)));
    if (emp && emp.estado === 'ACTIVO' && emp.idLayout) {
      this.menu.getLayoutOpciones(emp.idLayout).subscribe({
        next: (claves) => this.concedidas.set(new Set(claves)),
        error: () => this.concedidas.set(todas)
      });
    } else {
      this.concedidas.set(todas); // clásico: concede todo
    }
  }

  onSelUsuario(usuario: string) {
    this.userSel.set(usuario || null);
    this.denegadas.set(new Set());
    const emp = this.userEmpresaId();
    if (!usuario || !emp) return;
    this.menu.getExcepciones(usuario, emp).subscribe({
      next: (claves) => this.denegadas.set(new Set(claves)),
      error: () => this.toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las restricciones.' })
    });
  }

  gruposConcedidos = computed<GrupoArbol[]>(() => {
    const conc = this.concedidas();
    return this.arbol()
      .map((g) => ({ ...g, hijos: g.hijos.filter((h) => conc.has(h.clave)) }))
      .filter((g) => g.hijos.length > 0);
  });

  efectivoUsuario = computed(() => this.concedidas().size - this.denegadas().size);

  toggleDeny(clave: string) {
    const s = new Set(this.denegadas());
    s.has(clave) ? s.delete(clave) : s.add(clave);
    this.denegadas.set(s);
    const emp = this.userEmpresaId();
    const usr = this.userSel();
    if (!emp || !usr) return;
    this.menu.guardarExcepciones(usr, emp, [...s]).subscribe({
      next: () => {},
      error: (e) => this.toast.add({ severity: 'error', summary: 'Error', detail: e?.error?.message ?? 'No se pudo guardar la restricción.' })
    });
  }
  esDenegada(clave: string): boolean { return this.denegadas().has(clave); }

  // ---------- Catálogo ordenado ----------
  catalogoOrdenado = computed(() => [...this.opciones()].sort((a, b) => a.orden - b.orden));
}
