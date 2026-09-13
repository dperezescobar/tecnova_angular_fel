// Lo que enviamos al hacer Login (equivale a tu clase userData en C#)
export interface LoginRequest {
    user: string;
    pass: string;
    idsistema: number;
}

// Lo que la API nos devuelve (equivale a tu TokenResponseDTO)
export interface LoginResponse {
    token: string;
    refreshToken: string;
    expiration: string; // Vienen como string desde JSON
    username: string;
    fechaActual?: string;
  dui?: string;
  nombreUsuario?: string;
  tipoUsuario?: string;
  bloqueado?: boolean;
  esRoot?: boolean;
  requierePasswordChange?: boolean;
}

// Basado en EmpresaUserInfoDTO y EmpresaSessionDataDTO
export interface Empresa {
  idEmpresa: number;
  nombreComercial: string;
  nombre: string;
  nit: string;
  nrc: string;
  urlServicio: string;
  urlApi?: string;
  logo: string; // Logo64
  ambienteEmision: number;
  emiteDte: boolean;
  dbName: string;
}

export interface AuthResponse {
  token: string;
  refreshToken: string;
  username: string;
  expiration: string;
  fechaActual?: string;
  dui?: string;
  nombreUsuario?: string;
  tipoUsuario?: string;
  bloqueado?: boolean;
  esRoot?: boolean;
  requierePasswordChange?: boolean;
}

// Para guardar el estado del usuario en la app
export interface UserSession {
  token: string;
  refreshToken: string;
  username: string;
  fechaActual?: string;
  dui?: string;
  nombreUsuario?: string;
  tipoUsuario?: string;
  bloqueado?: boolean;
  esRoot?: boolean;
  expiration?: string;
  selectedEmpresa: Empresa | null;
}

// Body para POST /api/Auth/CompletarCambioPasswordReiniciado
export interface CompletarCambioPasswordRequest {
  usuario: string;
  passwordActual: string;
  passwordNueva: string;
  passwordConfirmar: string;
  idSistema: number;
}
