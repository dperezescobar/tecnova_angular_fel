import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Validacion {
  situacion: string;
  regla: string;
  mensaje: string;
}

interface Paso {
  icono: string;
  titulo: string;
  detalle: string;
}

type Vista = 'documento' | 'guia';
type Tarea = 'crear' | 'editar' | 'eliminar';

@Component({
  selector: 'app-manual-articulos',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  templateUrl: './manual-articulos.html',
  styleUrl: './manual-articulos.scss'
})
export class ManualArticulosComponent {
  // ── Pestaña activa ───────────────────────────────────────────────────────────
  vista = signal<Vista>('documento');

  // ── Estado de la guía interactiva (Pestaña 2) ─────────────────────────────────
  tarea = signal<Tarea | null>(null);
  paso = signal(0);
  completado = signal(false);

  // =============================================================================
  //  Pasos (compartidos por las dos pestañas). Redactados en lenguaje llano y
  //  basados únicamente en los elementos que existen en la pantalla de Artículos.
  // =============================================================================
  pasosCrear: Paso[] = [
    { icono: 'bi bi-list', titulo: 'Abre la pantalla de Artículos', detalle: 'En el menú de la izquierda entra a "Catálogos" y luego a "Artículos". Verás la lista de productos.' },
    { icono: 'bi bi-plus-circle', titulo: 'Toca "Nuevo Artículo"', detalle: 'El botón está en la parte de arriba a la derecha. Se abrirá el formulario del producto.' },
    { icono: 'bi bi-tags', titulo: 'Elige el Tipo de artículo', detalle: 'En la lista "Tipo de artículo" elige la opción que corresponde. Es obligatorio.' },
    { icono: 'bi bi-collection', titulo: 'Elige el Grupo', detalle: 'Selecciona el "Grupo". Si necesitas uno nuevo, toca el botón de lápiz que está junto a la lista para gestionarlo.' },
    { icono: 'bi bi-upc-scan', titulo: 'El código se genera solo', detalle: 'El "Código único" se arma automáticamente con el Tipo y el Grupo. No necesitas escribirlo.' },
    { icono: 'bi bi-pencil-square', titulo: 'Escribe el Nombre / Descripción', detalle: 'Escribe el nombre del producto en el campo "Nombre / Descripción". Es obligatorio: sin él no se puede guardar.' },
    { icono: 'bi bi-rulers', titulo: 'Elige la Unidad de medida', detalle: 'Selecciona la unidad en la lista "Unidad de medida" (por ejemplo, unidad, libra, metro).' },
    { icono: 'bi bi-percent', titulo: 'Revisa el Impuesto', detalle: 'En "Impuesto" verás el IVA marcado. Puedes marcar o quitar impuestos con las casillas.' },
    { icono: 'bi bi-camera', titulo: '(Opcional) Agrega una foto', detalle: 'Usa "Adjuntar foto" para elegir una imagen o "Tomar foto" para usar la cámara. Es opcional.' },
    { icono: 'bi bi-save', titulo: 'Toca "Guardar"', detalle: '¡Listo! El producto se guarda y aparece en el listado de artículos.' }
  ];

  pasosEditar: Paso[] = [
    { icono: 'bi bi-search', titulo: 'Busca el producto', detalle: 'En el listado, escribe en el buscador el código, la descripción o el tipo del producto.' },
    { icono: 'bi bi-pencil', titulo: 'Toca el lápiz (Editar)', detalle: 'En la columna "Acciones" toca el ícono de lápiz del producto. Se abrirán sus datos.' },
    { icono: 'bi bi-input-cursor-text', titulo: 'Cambia lo que necesites', detalle: 'Corrige el nombre, el tipo, el grupo, la unidad o el impuesto. Recuerda: el código no se puede cambiar.' },
    { icono: 'bi bi-camera', titulo: '(Opcional) Cambia la foto', detalle: 'Puedes adjuntar o tomar una nueva foto y luego tocar "Subir fotografía".' },
    { icono: 'bi bi-save', titulo: 'Toca "Actualizar"', detalle: 'Guarda los cambios. Verás un aviso de que el artículo se actualizó correctamente.' }
  ];

  pasosEliminar: Paso[] = [
    { icono: 'bi bi-search', titulo: 'Busca el producto', detalle: 'Encuentra el producto en el listado usando el buscador.' },
    { icono: 'bi bi-trash', titulo: 'Toca el bote de basura (Eliminar)', detalle: 'En la columna "Acciones" toca el ícono rojo de basura del producto.' },
    { icono: 'bi bi-question-circle', titulo: 'Confirma el aviso', detalle: 'Aparecerá una pregunta para confirmar. Acepta si estás seguro; si no, cancela y no pasa nada.' },
    { icono: 'bi bi-shield-check', titulo: 'El sistema te protege', detalle: 'Si el producto ya se usó en facturas, inventario o devoluciones, NO se borra y te dice el motivo. En ese caso, mejor desactívalo quitando la marca "Activo" al editarlo.' }
  ];

  validaciones: Validacion[] = [
    {
      situacion: 'Guardar sin Nombre/Descripción o sin Tipo de artículo',
      regla: 'El Nombre/Descripción y el Tipo de artículo son obligatorios.',
      mensaje: 'El botón Guardar no completa la acción hasta que los llenes.'
    },
    {
      situacion: 'El código generado ya existe',
      regla: 'El código del artículo debe ser único.',
      mensaje: 'YA EXISTE EL ARTÍCULO EN EL SISTEMA'
    },
    {
      situacion: 'Adjuntar una imagen',
      regla: 'Solo archivos de imagen; máximo 15 MB. Se ajusta a 800 px y se guarda como JPG.',
      mensaje: 'Solo se permiten archivos de imagen (JPG, PNG, WEBP, etc). / El archivo supera el límite de 15 MB.'
    },
    {
      situacion: 'Eliminar un artículo con facturas',
      regla: 'No se puede eliminar si tiene facturas asociadas.',
      mensaje: 'EL ARTÍCULO TIENE FACTURAS ASOCIADAS!!'
    },
    {
      situacion: 'Eliminar un artículo con documentos de inventario',
      regla: 'No se puede eliminar si tiene ingresos o salidas de inventario.',
      mensaje: 'EL ARTÍCULO TIENE DOCUMENTOS ASOCIADOS!!'
    },
    {
      situacion: 'Eliminar un artículo con devoluciones',
      regla: 'No se puede eliminar si tiene devoluciones asociadas.',
      mensaje: 'EL ARTÍCULO TIENE DEVOLUCIONES ASOCIADAS!!'
    }
  ];

  tareas: Array<{ id: Tarea; icono: string; titulo: string; descripcion: string }> = [
    { id: 'crear', icono: 'bi bi-plus-circle', titulo: 'Crear un producto', descripcion: 'Dar de alta un producto nuevo en el catálogo.' },
    { id: 'editar', icono: 'bi bi-pencil', titulo: 'Editar un producto', descripcion: 'Cambiar los datos de un producto que ya existe.' },
    { id: 'eliminar', icono: 'bi bi-trash', titulo: 'Eliminar un producto', descripcion: 'Borrar un producto del catálogo.' }
  ];

  pasosGuia = computed<Paso[]>(() => {
    switch (this.tarea()) {
      case 'crear': return this.pasosCrear;
      case 'editar': return this.pasosEditar;
      case 'eliminar': return this.pasosEliminar;
      default: return [];
    }
  });

  totalPasos = computed(() => this.pasosGuia().length);
  pasoActual = computed<Paso | null>(() => this.pasosGuia()[this.paso()] ?? null);
  progreso = computed(() => {
    const total = this.totalPasos();
    return total > 0 ? Math.round(((this.paso() + 1) / total) * 100) : 0;
  });
  esUltimoPaso = computed(() => this.paso() >= this.totalPasos() - 1);
  tareaTitulo = computed(() => this.tareas.find((t) => t.id === this.tarea())?.titulo ?? '');

  setVista(vista: Vista): void {
    this.vista.set(vista);
  }

  seleccionarTarea(tarea: Tarea): void {
    this.tarea.set(tarea);
    this.paso.set(0);
    this.completado.set(false);
  }

  volverATareas(): void {
    this.tarea.set(null);
    this.paso.set(0);
    this.completado.set(false);
  }

  siguientePaso(): void {
    if (this.esUltimoPaso()) {
      this.completado.set(true);
      return;
    }
    this.paso.update((p) => p + 1);
  }

  pasoAnterior(): void {
    if (this.completado()) {
      this.completado.set(false);
      return;
    }
    this.paso.update((p) => Math.max(0, p - 1));
  }

  reiniciarGuia(): void {
    this.paso.set(0);
    this.completado.set(false);
  }
}
