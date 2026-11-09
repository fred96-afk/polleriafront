import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

function denyAccess(router: Router, authService: AuthService, redirectTo: string) {
  authService.logout();
  return router.createUrlTree([redirectTo]);
}

export const internalAccessGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/admin/login']);
  }

  if (authService.canAccessInternalPanel()) {
    return true;
  }

  return denyAccess(router, authService, '/admin/login');
};

export const adminDashboardGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/admin/login']);
  }

  if (authService.canAccessAdminDashboard()) {
    return true;
  }

  if (authService.canAccessPos()) {
    return router.createUrlTree(['/admin/sales']);
  }

  if (authService.canAccessDeliveryOrders()) {
    return router.createUrlTree(['/admin/delivery']);
  }

  return denyAccess(router, authService, '/admin/login');
};

export const posGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/admin/login']);
  }

  if (authService.canAccessPos()) {
    return true;
  }

  if (authService.canAccessAdminDashboard()) {
    return router.createUrlTree(['/admin/dashboard/products']);
  }

  return denyAccess(router, authService, '/admin/login');
};

export const deliveryGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isAuthenticated()) {
    return router.createUrlTree(['/admin/login']);
  }

  if (authService.canAccessDeliveryOrders()) {
    return true;
  }

  if (authService.canAccessAdminDashboard()) {
    return router.createUrlTree(['/admin/dashboard/orders']);
  }

  if (authService.canAccessPos()) {
    return router.createUrlTree(['/admin/sales']);
  }

  return denyAccess(router, authService, '/admin/login');
};
