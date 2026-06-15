export interface PerfilEmpresaDto {
  nombre: string;
  nombreComercial: string;
  nit: string;
  nrc: string;
  giro: string;
  email: string;
  phone: string;
  departamento: string;
  municipio: string;
  direccion: string;
}

export interface AbonoEmpresaDto {
  fecha: string;
  referencia: string | null;
  monto: number;
  estado: string;
}
