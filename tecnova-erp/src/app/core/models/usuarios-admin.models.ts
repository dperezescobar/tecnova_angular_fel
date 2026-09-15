export interface SistemaItem {
  idSistema: number;
  sistema: string;
}

export interface UsuarioListado {
  usuario: string;
  nombre: string;
  tipo: string;
  correoElectronico: string;
  activo: boolean;
  bloqueado: boolean;
  createdBy?: string;
  roles?: string[];
  sistemas?: number[];
  sistemasNombres?: string[];
}

export interface UsuarioDetalle {
  usuario: string;
  nombre: string;
  tipo: string;
  correoElectronico: string;
  activo: boolean;
  bloqueado: boolean;
  politicaNuevoPassword: boolean;
  dui?: string;
  sistemas?: number[];
}

export interface UsuarioNuevoRequest {
  usuario: string;
  password: string;
  nombre: string;
  tipo: string;
  correo: string;
  activo: boolean;
  dui?: string;
  idEmpresa: number;
  idSistema: number;
  sistemas?: number[];
}

export interface UsuarioEditarRequest {
  nombre: string;
  tipo: string;
  correo: string;
  dui?: string;
  activo: boolean;
  sistemas?: number[];
}

export interface ReiniciarPasswordResponse {
  usuario: string;
  nuevaPassword: string;
}
