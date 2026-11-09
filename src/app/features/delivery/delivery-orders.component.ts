import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from '../../services/auth.service';
import { OrderService } from '../../services/order.service';
import { OrderResponse } from '../../models/order.model';

@Component({
  selector: 'app-delivery-orders',
  imports: [CommonModule],
  templateUrl: './delivery-orders.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeliveryOrdersComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly orderService = inject(OrderService);
  private readonly toastService = inject(ToastrService);

  readonly orders = signal<OrderResponse[]>([]);
  readonly loading = signal(false);
  readonly acceptingOrderId = signal<number | null>(null);
  readonly deliveryOrders = computed(() => this.orders().filter(order => {
    const type = this.normalize(order.type);
    const status = this.normalize(order.status);
    const isDelivery = ['delivery', 'reparto', 'domicilio'].some(marker => type.includes(marker))
      || (
        order.isPos !== true
        && order.isPickup !== true
        && !order.tableNumber?.trim()
        && Boolean(order.customerAddress?.trim())
      );
    const isActive = !['cancelled', 'canceled', 'delivered', 'cancelado', 'cancelada', 'entregado', 'entregada']
      .some(finalStatus => status.includes(finalStatus));
    const isAvailableToCurrentUser = order.deliveryUserId == null
      || order.deliveryUserId === this.authService.userId;

    return isDelivery && isActive && isAvailableToCurrentUser;
  }));

  ngOnInit(): void {
    this.loadOrders();
  }

  loadOrders(): void {
    this.loading.set(true);
    this.orderService.getOrders().pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: orders => this.orders.set(orders),
      error: error => {
        console.error('Error al cargar pedidos de reparto:', error);
        this.toastService.error('No se pudieron cargar los pedidos de reparto.', 'Error');
      }
    });
  }

  acceptOrder(order: OrderResponse): void {
    const deliveryUserId = this.authService.userId;
    if (deliveryUserId === null) {
      this.toastService.error('No se pudo identificar tu usuario. Vuelve a iniciar sesión.', 'Sesión inválida');
      return;
    }

    if (order.deliveryUserId !== null && order.deliveryUserId !== undefined) {
      if (order.deliveryUserId === deliveryUserId) {
        this.toastService.info('Este pedido ya está asignado a tu cuenta.');
      } else {
        this.toastService.warning('Este pedido ya fue asignado a otro repartidor.');
      }
      return;
    }

    this.acceptingOrderId.set(order.id);
    this.orderService.acceptDelivery(order.id, deliveryUserId).pipe(
      finalize(() => this.acceptingOrderId.set(null))
    ).subscribe({
      next: () => {
        this.toastService.success(`El pedido #${order.id} fue asignado a tu cuenta.`);
        this.loadOrders();
      },
      error: error => {
        console.error(`Error al aceptar el pedido #${order.id}:`, error);
        this.toastService.error('No se pudo aceptar el pedido. Puede que otro repartidor ya lo haya tomado.');
        this.loadOrders();
      }
    });
  }

  isAssignedToCurrentUser(order: OrderResponse): boolean {
    return order.deliveryUserId === this.authService.userId;
  }

  private normalize(value: string | null | undefined): string {
    return (value ?? '')
      .trim()
      .toLocaleLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
