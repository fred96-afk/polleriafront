import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrderService } from '../../services/order.service';
import { PusherService } from '../../services/pusher.service';
import { OrderResponse } from '../../models/order.model';
import { finalize, Subscription } from 'rxjs';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-admin-orders',
  imports: [CommonModule],
  templateUrl: './admin-orders.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrdersComponent implements OnInit, OnDestroy {
  private readonly orderService = inject(OrderService);
  private readonly pusherService = inject(PusherService);
  private readonly toastService = inject(ToastrService);

  orders = signal<OrderResponse[]>([]);
  loading = signal(false);
  private orderSub?: Subscription;

  ngOnInit(): void {
    this.loadOrders();
    this.initPusherOrderNotifications();
  }

  ngOnDestroy(): void {
    if (this.orderSub) {
      this.orderSub.unsubscribe();
    }
    // Limpieza de canal Pusher para evitar suscripciones duplicadas o fugas de memoria
    this.pusherService.unsubscribe('orders');
  }

  private initPusherOrderNotifications(): void {
    // Suscripción al canal 'orders' y evento 'new-order'
    this.orderSub = this.pusherService
      .listenToEvent<any>('orders', 'new-order')
      .subscribe({
        next: (orderData) => {
          if (!orderData) return;

          // Extraer información del pedido con valores por defecto consistentes
          const id = orderData.id || orderData.orderId || '';
          const customerName = orderData.customerName || (orderData.customer && orderData.customer.name) || (orderData.tableNumber ? `Mesa ${orderData.tableNumber}` : 'Cliente');
          const type = orderData.type || (orderData.tableNumber ? `Mesa ${orderData.tableNumber}` : (orderData.isPos ? 'Salón / POS' : 'Delivery'));
          const totalAmount = Number(orderData.totalAmount || 0).toFixed(2);

          // 1. Mostrar alerta emergente (Toast) con el formato requerido:
          // "¡Nuevo pedido recibido! #<id> - <customerName> (<type>) - Total: S/ <totalAmount>"
          this.toastService.info(
            `¡Nuevo pedido recibido! #${id} - ${customerName} (${type}) - Total: S/ ${totalAmount}`,
            '¡NUEVO PEDIDO!',
            {
              timeOut: 9000,
              progressBar: true,
              closeButton: true,
              enableHtml: true
            }
          );

          // 2. Reproducir sonido de alerta suave para alertar al personal
          this.pusherService.playSoftNotificationSound();

          // 3. Actualizar reactivamente la lista de pedidos sin recargar toda la página
          this.refreshOrdersSilently(orderData);
        },
        error: (err) => console.error('Error en listener de orders/new-order:', err)
      });
  }

  loadOrders(showSpinner = true): void {
    if (showSpinner) {
      this.loading.set(true);
    }
    this.orderService.getOrders().pipe(
      finalize(() => {
        if (showSpinner) this.loading.set(false);
      })
    ).subscribe({
      next: (data) => this.orders.set(data),
      error: () => {
        if (showSpinner) this.toastService.error('Error al cargar órdenes');
      }
    });
  }

  private refreshOrdersSilently(newOrderPayload?: any): void {
    this.orderService.getOrders().subscribe({
      next: (data) => {
        this.orders.set(data);
      },
      error: () => {
        // Fallback: si falla la consulta de red, anteponer el payload recibido si tiene estructura válida
        if (newOrderPayload && newOrderPayload.id) {
          this.orders.update(prev => {
            const exists = prev.some(o => o.id === newOrderPayload.id);
            return exists ? prev : [newOrderPayload, ...prev];
          });
        }
      }
    });
  }

  deleteOrder(id: number): void {
    if (confirm('¿Cancelar esta orden?')) {
      this.orderService.deleteOrder(id).subscribe({
        next: () => {
          this.toastService.success('Orden cancelada');
          this.loadOrders(false);
        },
        error: () => this.toastService.error('No se pudo cancelar')
      });
    }
  }
}
