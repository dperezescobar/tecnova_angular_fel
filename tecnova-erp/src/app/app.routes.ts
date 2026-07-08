import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login';
import { Dashboard } from './features/dashboard/dashboard';
import { InicioComponent } from './features/inicio/inicio';
import { ClientesComponent } from './features/clientes/clientes';
import { ProveedoresComponent } from './features/proveedores/proveedores';
import { ArticulosComponent } from './features/articulos/articulos';
import { MainLayoutComponent } from './layout/main-layout/main-layout';
import { authGuard } from './core/guards/auth-guard'; // <--- Importamos el guard funcional
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
    { 
        path: '', 
        component: MainLayoutComponent, 
        canActivate: [authGuard], 
        children: [
            { path: '', redirectTo: 'inicio', pathMatch: 'full' },
            { path: 'inicio', component: InicioComponent },
            { path: 'dashboard', component: Dashboard },
            { path: 'clientes', component: ClientesComponent },
            { path: 'proveedores', component: ProveedoresComponent },
            { path: 'articulos', component: ArticulosComponent },
            { path: 'facturacion', redirectTo: 'facturacion/fac', pathMatch: 'full' },
            {
                path: 'facturacion/fac',
                loadComponent: () => import('./features/facturacion/factura-selector/factura-selector').then((m) => m.FacturaSelectorComponent),
                data: { tipoFactura: 'FAC' }
            },
            {
                path: 'facturacion/ccf',
                loadComponent: () => import('./features/facturacion/factura-selector/factura-selector').then((m) => m.FacturaSelectorComponent),
                data: { tipoFactura: 'CCF' }
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
                loadComponent: () => import('./features/facturacion/nc/nc').then((m) => m.NcComponent)
            },
            {
                path: 'facturacion/fex',
                loadComponent: () => import('./features/facturacion/fex/fex').then((m) => m.FexComponent)
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
                path: 'inventario/ingresos',
                loadComponent: () => import('./features/inventario/ingresos-inventario/ingresos-inventario').then(m => m.IngresosInventarioComponent)
            },
            {
                path:'reportes/selector-libros',
                loadComponent: () => import('./reportes/selector-libros/selector-libros').then(m => m.SelectorLibros)                
            },
      { path: 'precios', component: ArticuloPrecioComponent },
            {
                path: 'mi-perfil',
                loadComponent: () => import('./features/perfil/mi-perfil').then((m) => m.MiPerfilComponent)
            },
            {
                path: 'compras/registro',
                loadComponent: () => import('./features/compras/registro-compra-json/registro-compra-json').then((m) => m.RegistroCompraJsonComponent)
            },
            {
                path: 'reportes/anexos',
                loadComponent: () => import('./reportes/formatos/anexos-f07/anexos-f07').then((m) => m.AnexosF07Component)
            },
            {
                path: 'comprobantes/retencion',
                loadComponent: () => import('./features/comprobantes/comp-retencion/comp-retencion').then((m) => m.CompRetencionComponent)
            },
            {
                path: 'comprobantes/donacion',
                loadComponent: () => import('./features/comprobantes/comp-donacion/comp-donacion').then((m) => m.CompDonacionComponent)
            },
            {
                path: 'inventario/reportes/existencias',
                loadComponent: () => import('./features/inventario/rep-existencias/rep-existencias').then(m => m.RepExistenciasComponent)
            },
            {
                path: 'inventario/reportes/movimientos',
                loadComponent: () => import('./features/inventario/rep-movimientos/rep-movimientos').then(m => m.RepMovimientosComponent)
            },
            {
                path: 'reportes/cuadro-ventas',
                loadComponent: () => import('./reportes/cuadro-ventas-pivot/cuadro-ventas-pivot').then(m => m.CuadroVentasPivotComponent)
            },
            {
                path: 'administracion/usuarios',
                loadComponent: () => import('./features/administracion/admin-usuarios/admin-usuarios').then(m => m.AdminUsuariosComponent)
            },
            {
                path: 'administracion/sucursales-puntos-venta',
                loadComponent: () => import('./features/administracion/sucursales-punto-venta/sucursales-punto-venta').then(m => m.SucursalesPuntoVentaComponent)
            },
            {
                path: 'manuales',
                loadComponent: () => import('./features/manuales/manuales-home/manuales-home').then(m => m.ManualesHomeComponent)
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