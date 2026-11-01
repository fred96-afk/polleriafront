import { ChangeDetectionStrategy, Component, computed, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { PusherService } from '../services/pusher.service';
import { OrderService } from '../services/order.service';
import { TableMapService } from '../services/table-map.service';
import { ReportService } from '../services/report.service';
import { NotificationService } from '../services/notification.service';
import { NotificationBellComponent } from './admin/notification-bell.component';
import { ToastrService } from 'ngx-toastr';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-layout',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, NotificationBellComponent],
  templateUrl: './layout.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LayoutComponent implements OnInit, OnDestroy {
  public readonly authService = inject(AuthService);
  private readonly pusherService = inject(PusherService);
  private readonly orderService = inject(OrderService);
  public readonly tableMapService = inject(TableMapService);
  public readonly reportService = inject(ReportService);
  public readonly notificationService = inject(NotificationService);
  private readonly toastService = inject(ToastrService);
  private readonly router = inject(Router);
  
  private pusherSubscription?: Subscription;

  readonly canAccessAdminDashboard = computed(() => this.authService.canAccessAdminDashboard());
  readonly canAccessPos = computed(() => this.authService.canAccessPos());

  readonly isSidebarOpen = signal(false);
  notifications = signal<any[]>([]);
  activeTablesCount = signal<number>(0);

  ngOnInit() {
    this.loadActiveTables();

    // Escuchar notificaciones de nuevos pedidos vía Pusher
    this.pusherSubscription = this.pusherService.orderNotifications$.subscribe(data => {
      this.handleNewOrder(data);
      this.loadActiveTables();
    });
  }

  ngOnDestroy() {
    if (this.pusherSubscription) {
      this.pusherSubscription.unsubscribe();
    }
  }

  loadActiveTables() {
    this.orderService.getOrders().subscribe({
      next: (orders) => {
        const count = orders.filter(o => 
          Boolean(o.tableNumber && o.tableNumber.trim().length > 0) &&
          o.paymentStatus !== 'Approved' &&
          o.status !== 'Cancelled'
        ).length;
        this.activeTablesCount.set(count);
        this.tableMapService.syncTablesWithOrders(orders);
      },
      error: () => {}
    });
  }

  private handleNewOrder(data: any) {
    const id = data.id || data.orderId || '';
    const customerName = data.customerName || (data.customer && data.customer.name) || (data.tableNumber ? `Mesa ${data.tableNumber}` : 'Cliente');
    const type = data.type || (data.tableNumber ? `Mesa ${data.tableNumber}` : (data.isPos ? 'Salón / POS' : 'Delivery'));
    const totalAmount = Number(data.totalAmount || 0).toFixed(2);

    this.toastService.info(
      `¡Nuevo pedido recibido! #${id} - ${customerName} (${type}) - Total: S/ ${totalAmount}`, 
      '¡NUEVO PEDIDO!',
      { 
        timeOut: 10000, 
        progressBar: true,
        closeButton: true,
        enableHtml: true
      }
    );
    
    // Reproducir sonido de alerta suave para el personal
    this.pusherService.playSoftNotificationSound();

    // Añadir a la lista local de notificaciones
    this.notifications.update(prev => [data, ...prev].slice(0, 5));
    
    // Notificación Push nativa del navegador
    this.tableMapService.showBrowserPushNotification(`🍗 ¡Nuevo pedido recibido! #${id}`, {
      body: `${customerName} (${type}) - Total: S/ ${totalAmount}`,
      tag: `order-${id}`
    });
  }

  toggleSidebar() {
    this.isSidebarOpen.update(v => !v);
  }

  closeSidebar() {
    this.isSidebarOpen.set(false);
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}
