export function getTipoFacturaDescripcion(tipoFactura: unknown): string {
  const tipo = String(tipoFactura ?? '').trim().toUpperCase();

  switch (tipo) {
    case 'FAC':
      return 'Factura';
    case 'CCF':
      return 'Comprobante de Crédito Fiscal';
    case 'FEX':
      return 'Factura de Exportación';
    case 'NC':
      return 'Nota de Crédito';
    case 'SE':
      return 'Sujeto Excluido';
    case 'CR':
      return 'Comprobante de Retención';
    case 'NR':
      return 'Nota de Remisión';
    case 'CD':
      return 'Comprobante de Donación';
    default:
      return tipo || 'Documento';
  }
}
