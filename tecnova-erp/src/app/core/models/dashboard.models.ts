export interface DashboardDTO {
    ingresosTotalesAnio: number;
    facturasEmitidasMes: number;
    ventasMesActual: number;
    historialVentas: HistorialVenta[];
    facturasPorTipo: FacturaPorTipo[];
    topClientesAnio: TopItem[];
    topProductosAnio: TopItem[];
    topProductosMes: TopProductoMes[];
}

export interface HistorialVenta {
    etiqueta: string;
    valor: number;
}

export interface FacturaPorTipo {
    tipo: string;
    cantidad: number;
}

export interface TopItem {
    nombre: string;
    valor: number; // Monto vendido
}

export interface TopProductoMes {
    nombre: string;
    porcentaje: number;
}