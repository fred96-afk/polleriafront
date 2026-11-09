import { Routes } from '@angular/router';
import { CustomerComponent } from './features/customer/customer.component';
import { LoginComponent } from './features/auth/login.component';
import { RegisterComponent } from './features/auth/register.component';
import { ForgotPasswordComponent } from './features/auth/forgot-password.component';
import { ResetPasswordComponent } from './features/auth/reset-password.component';
import { VerifyEmailComponent } from './features/auth/verify-email.component';
import { AdminLoginComponent } from './features/auth/admin-login.component';
import { LayoutComponent } from './features/layout.component';
import { SalesComponent } from './features/sales/sales.component';
import { AdminComponent } from './features/admin/admin.component';
import { CheckoutResultComponent } from './features/customer/checkout-result.component';
import { OrderTrackingComponent } from './features/customer/order-tracking.component';
import { OrderHistoryComponent } from './features/customer/order-history.component';

import { AdminProductsComponent } from './features/admin/admin-products.component';
import { AdminClientsComponent } from './features/admin/admin-clients.component';
import { AdminOrdersComponent } from './features/admin/admin-orders.component';
import { AdminCategoriesComponent } from './features/admin/admin-categories.component';
import { AdminBannersComponent } from './features/admin/admin-banners.component';
import { AdminUsersComponent } from './features/admin/admin-users.component';
import { AdminEmpleadosComponent } from './features/admin/admin-empleados.component';
import { AdminReportsComponent } from './features/admin/admin-reports.component';
import { AdminDashboardComponent } from './features/admin/admin-dashboard.component';
import { AdminTablesComponent } from './features/admin/admin-tables.component';
import { AdminMaintenanceComponent } from './features/admin/admin-maintenance.component';
import { DeliveryOrdersComponent } from './features/delivery/delivery-orders.component';
import { adminDashboardGuard, deliveryGuard, internalAccessGuard, posGuard } from './guards/role.guard';

export const routes: Routes = [
  // Parte Pública (Cliente)
  { path: '', component: CustomerComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'forgot-password', component: ForgotPasswordComponent },
  { path: 'reset-password', component: ResetPasswordComponent },
  { path: 'verify-email', component: VerifyEmailComponent },
  { path: 'checkout/success', component: CheckoutResultComponent },
  { path: 'checkout/failure', component: CheckoutResultComponent },
  { path: 'checkout/pending', component: CheckoutResultComponent },
  { path: 'order-tracking/:id', component: OrderTrackingComponent },
  { path: 'chat', redirectTo: '' },

  // Parte Administrativa
  { path: 'admin/login', component: AdminLoginComponent },
  {
    path: 'admin',
    component: LayoutComponent,
    canActivate: [internalAccessGuard],
    children: [
      { path: 'sales', component: SalesComponent, canActivate: [posGuard] },
      { path: 'delivery', component: DeliveryOrdersComponent, canActivate: [deliveryGuard] },
      { 
        path: 'dashboard', 
        component: AdminComponent,
        canActivate: [adminDashboardGuard],
        children: [
          { path: 'summary', component: AdminDashboardComponent },
          { path: 'products', component: AdminProductsComponent },
          { path: 'categories', component: AdminCategoriesComponent },
          { path: 'banners', component: AdminBannersComponent },
          { path: 'users', component: AdminUsersComponent },
          { path: 'empleados', component: AdminEmpleadosComponent },
          { path: 'clients', component: AdminClientsComponent },
          { path: 'tables', component: AdminTablesComponent },
          { path: 'orders', component: AdminOrdersComponent },
          { path: 'reports', component: AdminReportsComponent },
          { path: 'maintenance', component: AdminMaintenanceComponent },
          { path: '', redirectTo: 'summary', pathMatch: 'full' }
        ]
      },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },

  // Comodín
  { path: '**', redirectTo: '' }
];
