export type MenuModo = 'CLASICO' | 'ADMINISTRADO';

export interface MenuEfectivo {
  modo: MenuModo;
  claves: string[];
}

export interface MenuOpcion {
  clave: string;
  descripcion: string;
  clavePadre?: string | null;
  ruta?: string | null;
  icono?: string | null;
  orden: number;
  idSistema: number;
  soloRoot: boolean;
  requiereInventario: boolean;
  activo: boolean;
}

export interface MenuLayout {
  idLayout: number;
  nombre: string;
  descripcion?: string | null;
  esBase: boolean;
  activo: boolean;
  opciones: number;
  empresas: number;
}

export type MenuEstadoEmpresa = 'CLASICO' | 'PREPARADO' | 'ACTIVO';

export interface MenuEmpresaLayout {
  idEmpresa: number;
  nombre: string;
  nrc?: string | null;
  idLayout?: number | null;
  nombreLayout?: string | null;
  activo: boolean;
  estado: MenuEstadoEmpresa;
  fechaMigracion?: string | null;
  migradoPor?: string | null;
}

export interface MenuUsuarioLite {
  usuario: string;
  nombre: string;
  tipo?: string | null;
}
