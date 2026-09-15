import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login';
import { Dashboard } from './features/dashboard/dashboard';
import { InicioComponent } from './features/inicio/inicio';
import { ClientesComponent } from './features/clientes/clientes';
import { ProveedoresComponent } from './features/proveedores/proveedores';
import { ArticulosComponent } from './features/articulos/articulos';
import { MainLayoutComponent } from './layout/main-layout/main-layout';
import { authGuard } from './core/guards/auth-guard'; // <--- Importamos el guard funcional
import { menuGuard } from './core/guards/menu-guard';
import { ArticuloPrecioComponent } from './features/precios/articulo-precio/articulo-precio';

export const routes: Routes = [
    // 1. Redirección inicial
    { path: '', redirectTo: 'login', pathMatch: 'full' },

    // 2. Ruta pública (Login)
    // El guard aquí sirve para que, si ya estás logueado, te rebote al dashboard automáticamente
    {
        path: 'login',
        component: LoginComponent,
        canActivate: [authGuard]
    },

    // 3. Rutas protegidas (Requieren Login + Empresa seleccionada)
    // Aplicamos el guard al "padre". Todas las rutas hijas (children) quedan protegidas por herencia.
    // menuGuard + data.clave bloquean el acceso directo por URL a opciones no visibles (fail-open en clásico).
    {
        path: '',
        component: MainLayoutComponent,
        canActivate: [authGuard],
        children: [
            { path: '', redirectTo: 'inicio', pathMatch: 'full' },
            { path: 'inicio', component: InicioComponent },
            { path: 'dashboard', component: Dashboard, canActivate: [menuGuard], data: { clave: 'DASHBOARD' } },
            { path: 'clientes', component: ClientesComponent, canActivate: [menuGuard], data: { clave: 'CAT_CLIENTES' } },
            { path: 'proveedores', component: ProveedoresComponent, canActivate: [menuGuard], data: { clave: 'CAT_PROVEEDORES' } },
            { path: 'articulos', component: ArticulosComponent, canActivate: [menuGuard], data: { clave: 'CAT_ARTICULOS' } },
            { path: 'facturacion', redirectTo: 'facturacion/fac', pathMatch: 'full' },
            {
                path: 'facturacion/fac',
                loadComponent: () => import('./features/facturacion/factura-selector/factura-selector').then((m) => m.FacturaSelectorComponent),
                canActivate: [menuGuard],
                data: { tipoFactura: 'FAC', clave: 'FAC_FAC' }
            },
            {
                path: 'facturacion/ccf',
                loadComponent: () => import('./features/facturacion/factura-selector/factura-selector').then((m) => m.FacturaSelectorComponent),
                canActivate: [menuGuard],
                data: { tipoFactura: 'CCF', clave: 'FAC_CCF' }
            },
            {
                path: 'facturacion/fac-ampliada',
                loadComponent: () => import('./features/facturacion/fac/fac').then((m) => m.FacComponent)
            },
            {
                path: 'facturacion/ccf-ampliada',
                loadComponent: () => import('./features/facturacion/ccf/ccf').then((m) => m.CcfComponent)
            },
            {
                path: 'facturacion/nc',
                loadComponent: () => import('./features/facturacion/nc/nc').then((m) => m.NcComponent),
                canActivate: [menuGuard],
                data: { clave: 'FAC_NC' }
            },
            {
                path: 'facturacion/fex',
                loadComponent: () => import('./features/facturacion/fex/fex').then((m) => m.FexComponent),
                canActivate: [menuGuard],
                data: { clave: 'FAC_FEX' }
            },
            {
                path: 'facturacion/fac-pos',
                loadComponent: () => import('./features/facturacion/fac-pos/fac-pos').then((m) => m.FacPosComponent)
            },
            {
                path: 'facturacion/fac-pos-replica',
                loadComponent: () => import('./features/facturacion/fac-pos-replica/fac-pos-replica').then((m) => m.FacPosReplicaComponent)
            },
            {
                path: 'facturacion/pos',
                loadComponent: () => import('./features/facturacion/pos-hibrido/pos-hibrido').then((m) => m.PosHibridoComponent),
                canActivate: [menuGuard],
                data: { clave: 'FAC_POS' }
            },
            {
                path: 'facturacion/cierre-recibos',
                loadComponent: () => import('./features/facturacion/cierre-recibos/cierre-recibos').then((m) => m.CierreRecibosComponent),
                canActivate: [menuGuard],
                data: { clave: 'FAC_CIERRE_RECIBOS' }
            },
            {
                path: 'inventario/ingresos',
                loadComponent: () => import('./features/inventario/ingresos-inventario/ingresos-inventario').then(m => m.IngresosInventarioComponent),
                canActivate: [menuGuard],
                data: { clave: 'INV_INGRESOS', operacion: 'INGRESO' }
            },
            {
                path: 'inventario/salidas',
                loadComponent: () => import('./features/inventario/ingresos-inventario/ingresos-inventario').then(m => m.IngresosInventarioComponent),
                canActivate: [menuGuard],
                data: { clave: 'INV_SALIDAS', operacion: 'SALIDA' }
            },
            {
                path: 'inventario/traslados',
                loadComponent: () => import('./features/inventario/ingresos-inventario/ingresos-inventario').then(m => m.IngresosInventarioComponent),
                canActivate: [menuGuard],
                data: { clave: 'INV_TRASLADOS', operacion: 'TRASLADO' }
            },
            {
                path:'reportes/selector-libros',
                loadComponent: () => import('./reportes/selector-libros/selector-libros').then(m => m.SelectorLibros),
                canActivate: [menuGuard],
                data: { clave: 'REP_LIBROS' }
            },
      { path: 'precios', component: ArticuloPrecioComponent, canActivate: [menuGuard], data: { clave: 'INV_PRECIOS' } },
            {
                path: 'mi-perfil',
                loadComponent: () => import('./features/perfil/mi-perfil').then((m) => m.MiPerfilComponent)
            },
            {
                path: 'compras/registro',
                loadComponent: () => import('./features/compras/registro-compra-json/registro-compra-json').then((m) => m.RegistroCompraJsonComponent),
                canActivate: [menuGuard],
                data: { clave: 'CMP_REGISTRO' }
            },
            {
                path: 'reportes/anexos',
                loadComponent: () => import('./reportes/formatos/anexos-f07/anexos-f07').then((m) => m.AnexosF07Component),
                canActivate: [menuGuard],
                data: { clave: 'REP_ANEXOS' }
            },
            {
                path: 'comprobantes/retencion',
                loadComponent: () => import('./features/comprobantes/comp-retencion/comp-retencion').then((m) => m.CompRetencionComponent),
                canActivate: [menuGuard],
                data: { clave: 'CMP_RETENCION' }
            },
            {
                path: 'comprobantes/donacion',
                loadComponent: () => import('./features/comprobantes/comp-donacion/comp-donacion').then((m) => m.CompDonacionComponent),
                canActivate: [menuGuard],
                data: { clave: 'CMP_DONACION' }
            },
            {
                path: 'inventario/reportes/existencias',
                loadComponent: () => import('./features/inventario/rep-existencias/rep-existencias').then(m => m.RepExistenciasComponent),
                canActivate: [menuGuard],
                data: { clave: 'INV_REP_EXISTENCIAS' }
            },
            {
                path: 'inventario/reportes/movimientos',
                loadComponent: () => import('./features/inventario/rep-movimientos/rep-movimientos').then(m => m.RepMovimientosComponent),
                canActivate: [menuGuard],
                data: { clave: 'INV_REP_MOVIMIENTOS' }
            },
            {
                path: 'reportes/cuadro-ventas',
                loadComponent: () => import('./reportes/cuadro-ventas-pivot/cuadro-ventas-pivot').then(m => m.CuadroVentasPivotComponent),
                canActivate: [menuGuard],
                data: { clave: 'REP_CUADRO' }
            },
            {
                path: 'administracion/usuarios',
                loadComponent: () => import('./features/administracion/admin-usuarios/admin-usuarios').then(m => m.AdminUsuariosComponent)
            },
            {
                path: 'administracion/gestion-precios',
                loadComponent: () => import('./features/administracion/admin-gestion-precios/admin-gestion-precios').then(m => m.AdminGestionPreciosComponent),
                canActivate: [menuGuard],
                data: { clave: 'ADM_GESTION_PRECIOS' }
            },
            {
                path: 'administracion/sucursales-puntos-venta',
                loadComponent: () => import('./features/administracion/sucursales-punto-venta/sucursales-punto-venta').then(m => m.SucursalesPuntoVentaComponent)
            },
            {
                path: 'administracion/menu',
                loadComponent: () => import('./features/administracion/admin-menu/admin-menu').then(m => m.AdminMenuComponent)
            },
            {
                path: 'administracion/pos-hibrido',
                loadComponent: () => import('./features/administracion/pos-hibrido-config/pos-hibrido-config').then(m => m.PosHibridoConfigComponent)
            },
            {
                path: 'manuales',
                loadComponent: () => import('./features/manuales/manuales-home/manuales-home').then(m => m.ManualesHomeComponent),
                canActivate: [menuGuard],
                data: { clave: 'AYUDA_MANUALES' }
            },
            {
                path: 'manuales/articulos',
                loadComponent: () => import('./features/manuales/manual-articulos/manual-articulos').then(m => m.ManualArticulosComponent)
            }
            // Cuando crees Clientes o Proveedores, solo los agregas aquí abajo y ya nacen protegidos.
        ]
    },

    // 4. Comodín (Wildcard) para manejar errores 404 o rutas inexistentes
    { path: '**', redirectTo: 'login' }
];
