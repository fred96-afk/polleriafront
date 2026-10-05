import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ProductService } from '../../services/product.service';
import { OrderService } from '../../services/order.service';
import { AuthService } from '../../services/auth.service';
import { ClientService } from '../../services/client.service';
import { DniService } from '../../services/dni.service';
import { PusherService } from '../../services/pusher.service';
import { ProductResponse } from '../../models/product.model';
import { OrderDetailRequest, OrderResponse } from '../../models/order.model';
import { ToastrService } from 'ngx-toastr';
import { switchMap, finalize, map, Subscription } from 'rxjs';

export interface CartItem extends ProductResponse {
  quantity: number;
}

export interface RestaurantTable {
  number: string;
  label: string;
  isOccupied: boolean;
  order?: OrderResponse;
}

@Component({
  selector: 'app-sales',
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './sales.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesComponent implements OnInit, OnDestroy {
  private readonly productService = inject(ProductService);
  private readonly orderService = inject(OrderService);
  private readonly clientService = inject(ClientService);
  private readonly dniService = inject(DniService);
  public readonly authService = inject(AuthService);
  private readonly pusherService = inject(PusherService);
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastrService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private pusherSub?: Subscription;
  private queryParamsSub?: Subscription;

  // Modos de vista principal: 'pos' (catálogo / mostrador) o 'tables' (mesas con pedidos)
  activeTab = signal<'pos' | 'tables'>('pos');
  showTablesMenu = signal(false);

  // Catálogo y Carrito
  products = signal<ProductResponse[]>([]);
  cart = signal<CartItem[]>([]);
  loading = signal(false);
  loadingProducts = signal(true);
  searchingDocument = signal(false);
  showClientModal = signal(false);
  showCartMobile = signal(false);
  cashierName = computed(() => this.authService.displayName.toUpperCase());

  // Tipo de atención para nueva venta: 'counter' (Mostrador) o 'table' (Mesa)
  orderMode = signal<'counter' | 'table'>('counter');
  selectedTableNumber = signal<string>('1');

  // Mesas y Pedidos
  allOrders = signal<OrderResponse[]>([]);
  loadingTables = signal(false);
  tableSearchQuery = signal('');
  tableStatusFilter = signal<string>('all');
  tablesViewMode = signal<'orders_only' | 'all_tables'>('orders_only');

  // Detalle y Cobro de Mesa
  selectedTableOrder = signal<OrderResponse | null>(null);
  showTableDetailModal = signal(false);
  showTableCheckoutModal = signal(false);
  processingTablePayment = signal(false);
  searchingTableDoc = signal(false);

  clientForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    documentNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{8,11}$/)]],
    address: ['Venta POS']
  });

  tableCheckoutForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    documentNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{8,11}$/)]],
    address: ['Consumo en Salón']
  });

  totalPrice = computed(() => {
    return this.cart().reduce((acc, item) => acc + (item.basePrice * item.quantity), 0);
  });

  // Filtra las órdenes que corresponden a mesas ocupadas con pedidos activos
  activeTableOrders = computed(() => {
    const orders = this.allOrders();
    return orders
      .filter(o => 
        Boolean(o.tableNumber && o.tableNumber.trim().length > 0) &&
        o.paymentStatus !== 'Approved' &&
        o.status !== 'Cancelled'
      )
      .sort((a, b) => new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime());
  });

  activeTablesCount = computed(() => this.activeTableOrders().length);

  totalPendingAmountInTables = computed(() => {
    return this.activeTableOrders().reduce((acc, o) => acc + (o.totalAmount || 0), 0);
  });

  // Filtro de mesas con pedidos por búsqueda y estado
  filteredTableOrders = computed(() => {
    const query = this.tableSearchQuery().trim().toLowerCase();
    const statusFilter = this.tableStatusFilter();
    let orders = this.activeTableOrders();

    if (query) {
      orders = orders.filter(o => {
        const table = (o.tableNumber || '').toLowerCase();
        const client = (o.customerName || '').toLowerCase();
        const id = o.id.toString();
        return table.includes(query) || client.includes(query) || id.includes(query);
      });
    }

    if (statusFilter !== 'all') {
      orders = orders.filter(o => o.status === statusFilter);
    }

    return orders;
  });

  // Mapa de mesas del salón (Mesas 1 a 12 + cualquier otra mesa detectada con pedido activo)
  allFloorTables = computed<RestaurantTable[]>(() => {
    const activeOrders = this.activeTableOrders();
    const tableMap = new Map<string, OrderResponse>();

    for (const order of activeOrders) {
      if (order.tableNumber) {
        const key = order.tableNumber.trim();
        if (!tableMap.has(key)) {
          tableMap.set(key, order);
        }
      }
    }

    const defaultTableNumbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
    const result: RestaurantTable[] = [];

    // Primero las mesas por defecto
    for (const num of defaultTableNumbers) {
      const order = tableMap.get(num) || tableMap.get(`Mesa ${num}`) || tableMap.get(`M-${num}`);
      result.push({
        number: num,
        label: `Mesa ${num}`,
        isOccupied: Boolean(order),
        order
      });
    }

    // Agregar mesas adicionales personalizadas que no estén en 1-12
    for (const [key, order] of tableMap.entries()) {
      const isAlreadyIncluded = result.some(t => 
        t.number.toLowerCase() === key.toLowerCase() || 
        t.label.toLowerCase() === key.toLowerCase() ||
        key === `Mesa ${t.number}`
      );
      if (!isAlreadyIncluded) {
        result.push({
          number: key,
          label: key.toLowerCase().startsWith('mesa') ? key : `Mesa ${key}`,
          isOccupied: true,
          order
        });
      }
    }

    return result;
  });

  ngOnInit() {
    this.queryParamsSub = this.route.queryParams.subscribe(params => {
      if (params['view'] === 'tables') {
        this.activeTab.set('tables');
      } else if (params['view'] === 'pos') {
        this.activeTab.set('pos');
      }
    });

    this.loadProducts();
    this.loadOrders();

    // Notificaciones en tiempo real vía Pusher
    this.pusherSub = this.pusherService.orderNotifications$.subscribe(data => {
      // Recargar órdenes de mesas automáticamente ante cualquier evento de pedido
      this.loadOrders(false);
      if (data && data.tableNumber) {
        this.toastService.info(
          `Actualización en Mesa ${data.tableNumber}`,
          'Salón en Vivo'
        );
      }
    });
  }

  ngOnDestroy() {
    this.pusherSub?.unsubscribe();
    this.queryParamsSub?.unsubscribe();
  }

  loadProducts() {
    this.loadingProducts.set(true);
    this.productService.getProducts().pipe(
      finalize(() => this.loadingProducts.set(false))
    ).subscribe({
      next: (products) => this.products.set(products),
      error: () => this.toastService.error('Error al cargar catálogo de productos')
    });
  }

  loadOrders(showLoading = true) {
    if (showLoading) {
      this.loadingTables.set(true);
    }
    this.orderService.getOrders().pipe(
      finalize(() => {
        if (showLoading) this.loadingTables.set(false);
      })
    ).subscribe({
      next: (orders) => this.allOrders.set(orders),
      error: () => {
        if (showLoading) this.toastService.error('Error al cargar órdenes de mesas');
      }
    });
  }

  setActiveTab(tab: 'pos' | 'tables') {
    this.activeTab.set(tab);
    if (tab === 'tables') {
      this.loadOrders();
    }
  }

  toggleTablesMenu() {
    this.showTablesMenu.update(v => !v);
    if (this.showTablesMenu()) {
      this.loadOrders(false);
    }
  }

  closeTablesMenu() {
    this.showTablesMenu.set(false);
  }

  addToCart(product: ProductResponse) {
    this.cart.update(current => {
      const existing = current.find(i => i.id === product.id);
      if (existing) {
        return current.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...current, { ...product, quantity: 1 }];
    });
  }

  removeFromCart(id: number) {
    this.cart.update(current => {
      const existing = current.find(i => id === i.id);
      if (existing && existing.quantity > 1) {
        return current.map(i => i.id === id ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return current.filter(i => i.id !== id);
    });
  }

  clearCart() {
    this.cart.set([]);
  }

  searchDocument() {
    const docNum = this.clientForm.get('documentNumber')?.value;
    if (!docNum || (docNum.length !== 8 && docNum.length !== 11)) {
      this.toastService.warning('Ingrese 8 dígitos para DNI u 11 para RUC', 'Formato Inválido');
      return;
    }

    this.searchingDocument.set(true);
    this.dniService.consultarDocumento(docNum).pipe(
      finalize(() => this.searchingDocument.set(false))
    ).subscribe({
      next: (data) => {
        if (data.success && data.nombre) {
          this.clientForm.patchValue({ name: data.nombre.toUpperCase() });
          this.toastService.success(`Documento Validado`, 'Éxito');
        } else {
          this.toastService.warning('No encontrado. Ingrese manual.', 'Aviso');
        }
      },
      error: () => this.toastService.error('Error de conexión', 'Error')
    });
  }

  searchTableDoc() {
    const docNum = this.tableCheckoutForm.get('documentNumber')?.value;
    if (!docNum || (docNum.length !== 8 && docNum.length !== 11)) {
      this.toastService.warning('Ingrese 8 dígitos para DNI u 11 para RUC', 'Formato Inválido');
      return;
    }

    this.searchingTableDoc.set(true);
    this.dniService.consultarDocumento(docNum).pipe(
      finalize(() => this.searchingTableDoc.set(false))
    ).subscribe({
      next: (data) => {
        if (data.success && data.nombre) {
          this.tableCheckoutForm.patchValue({ name: data.nombre.toUpperCase() });
          this.toastService.success(`Documento Validado`, 'Éxito');
        } else {
          this.toastService.warning('No encontrado. Ingrese manual.', 'Aviso');
        }
      },
      error: () => this.toastService.error('Error de conexión', 'Error')
    });
  }

  private extractInvoicePdfUrl(invoiceResponse: unknown): string | null {
    if (!invoiceResponse || typeof invoiceResponse !== 'object') {
      return null;
    }

    const response = invoiceResponse as Record<string, unknown>;
    const candidates = [
      response['pdfUrl'],
      response['pdfURL'],
      response['pdf_url'],
      response['enlaceDelPdf'],
      response['enlace_del_pdf'],
      response['urlPdf'],
      response['url_pdf'],
      response['url'],
      response['link']
    ];

    const pdfUrl = candidates.find(value => typeof value === 'string' && value.trim().length > 0);
    return typeof pdfUrl === 'string' ? pdfUrl : null;
  }

  private openPdfWindow(pdfUrl: string, fallbackWindow: Window | null) {
    if (fallbackWindow && !fallbackWindow.closed) {
      fallbackWindow.location.href = pdfUrl;
      fallbackWindow.focus();
      return true;
    }

    const newWindow = window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    if (newWindow) {
      newWindow.focus();
      return true;
    }

    return false;
  }

  processSale() {
    if (this.clientForm.invalid) return;

    const userId = this.authService.userId;
    if (!userId) {
      this.toastService.error('Error de sesión');
      return;
    }

    this.loading.set(true);
    const pendingPdfWindow = window.open('', '_blank');
    if (pendingPdfWindow) {
      pendingPdfWindow.document.title = 'Generando comprobante...';
      pendingPdfWindow.document.body.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #1f2937;">
          <h2 style="margin: 0 0 12px;">Generando comprobante...</h2>
          <p style="margin: 0;">La venta fue enviada. Esta pestaña se actualizará cuando el PDF esté listo.</p>
        </div>
      `;
    }

    const formVal = this.clientForm.value;
    const isTable = this.orderMode() === 'table';
    const tableNum = isTable ? (this.selectedTableNumber() || '1') : null;

    const clientData = {
      name: formVal.name,
      documentNumber: formVal.documentNumber,
      documentType: formVal.documentNumber?.length === 11 ? 'RUC' : 'DNI',
      address: formVal.address || (isTable ? `Mesa ${tableNum}` : 'Venta POS'),
      phone: ''
    };

    this.clientService.createClient(clientData as any).pipe(
      switchMap(client => {
        const details: OrderDetailRequest[] = this.cart().map(item => ({
          productId: item.id,
          quantity: item.quantity
        }));

        return this.orderService.createOrder({
          userId: userId,
          clientId: client.id,
          isPos: true,
          tableNumber: tableNum,
          details: details,
          customerName: client.name,
          documentNumber: client.documentNumber,
          documentType: client.documentType
        });
      }),
      switchMap(order => {
        const orderId = order.id;
        return this.orderService.generateInvoice(orderId).pipe(
          map(invoiceResponse => ({ orderId, invoiceResponse }))
        );
      })
    ).subscribe({
      next: ({ orderId, invoiceResponse }) => {
        const pdfUrl = this.extractInvoicePdfUrl(invoiceResponse);
        const openedPdf = pdfUrl ? this.openPdfWindow(pdfUrl, pendingPdfWindow) : false;

        const tableText = isTable ? ` (Mesa ${tableNum})` : '';
        this.toastService.success(`Venta #${orderId}${tableText} procesada`);

        if (pdfUrl) {
          if (openedPdf) {
            this.toastService.success('Comprobante abierto en una nueva pestaña', 'PDF generado');
          } else {
            this.toastService.warning('El navegador bloqueó la pestaña del comprobante', 'PDF generado');
          }
        } else {
          if (pendingPdfWindow && !pendingPdfWindow.closed) {
            pendingPdfWindow.close();
          }
          this.toastService.warning('La venta se procesó, pero no llegó la URL del PDF', 'Comprobante pendiente');
        }

        this.cart.set([]);
        this.clientForm.reset({
          name: '',
          documentNumber: '',
          address: 'Venta POS'
        });
        this.showClientModal.set(false);
        this.showCartMobile.set(false);
        this.loading.set(false);
        this.loadOrders(false);
      },
      error: (err) => {
        if (pendingPdfWindow && !pendingPdfWindow.closed) {
          pendingPdfWindow.close();
        }
        console.error('[POS SALE ERROR]', err);
        this.toastService.error('Error al procesar venta o generar comprobante', 'Error POS');
        this.loading.set(false);
      }
    });
  }

  // Ver detalle de una mesa con pedido
  openTableDetail(order: OrderResponse) {
    this.selectedTableOrder.set(order);
    this.showTableDetailModal.set(true);
  }

  closeTableDetail() {
    this.showTableDetailModal.set(false);
    this.selectedTableOrder.set(null);
  }

  // Iniciar cobro de mesa
  openTableCheckout(order: OrderResponse) {
    this.selectedTableOrder.set(order);
    this.tableCheckoutForm.patchValue({
      name: order.customerName || `Cliente Mesa ${order.tableNumber || ''}`,
      documentNumber: '',
      address: `Mesa ${order.tableNumber || ''}`
    });
    this.showTableCheckoutModal.set(true);
  }

  closeTableCheckout() {
    this.showTableCheckoutModal.set(false);
    this.processingTablePayment.set(false);
  }

  // Procesar cobro y comprobante de la mesa
  processTablePayment() {
    const order = this.selectedTableOrder();
    if (!order) return;

    this.processingTablePayment.set(true);
    const pendingPdfWindow = window.open('', '_blank');
    if (pendingPdfWindow) {
      pendingPdfWindow.document.title = `Cobrando Mesa ${order.tableNumber || ''}...`;
      pendingPdfWindow.document.body.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #1f2937;">
          <h2 style="margin: 0 0 12px;">Generando comprobante para Mesa ${order.tableNumber || ''}...</h2>
          <p style="margin: 0;">Se está procesando el cobro y comprobante electrónico.</p>
        </div>
      `;
    }

    // 1. Generar factura / boleta con NubeFact
    this.orderService.generateInvoice(order.id).pipe(
      // 2. Actualizar estado de pago a Approved
      switchMap(invoiceResponse => {
        return this.orderService.updatePaymentStatus(order.id, 'Approved').pipe(
          map(() => invoiceResponse)
        );
      }),
      // 3. Actualizar estado del pedido a Delivered si no estaba
      switchMap(invoiceResponse => {
        return this.orderService.updateOrderStatus(order.id, 'Delivered').pipe(
          map(() => invoiceResponse)
        );
      }),
      finalize(() => {
        this.processingTablePayment.set(false);
      })
    ).subscribe({
      next: (invoiceResponse) => {
        const pdfUrl = this.extractInvoicePdfUrl(invoiceResponse);
        const openedPdf = pdfUrl ? this.openPdfWindow(pdfUrl, pendingPdfWindow) : false;

        this.toastService.success(`Mesa ${order.tableNumber || ''} cobrada con éxito. Mesa liberada.`);

        if (pdfUrl && !openedPdf) {
          this.toastService.warning('El navegador bloqueó la pestaña del comprobante', 'PDF generado');
        } else if (!pdfUrl && pendingPdfWindow && !pendingPdfWindow.closed) {
          pendingPdfWindow.close();
        }

        this.closeTableCheckout();
        this.closeTableDetail();
        this.loadOrders(false);
      },
      error: (err) => {
        if (pendingPdfWindow && !pendingPdfWindow.closed) {
          pendingPdfWindow.close();
        }
        console.error('[TABLE PAYMENT ERROR]', err);
        // Si falló NubeFact pero deseamos marcar como pagado manualmente
        this.orderService.updatePaymentStatus(order.id, 'Approved').subscribe({
          next: () => {
            this.toastService.warning(`Mesa ${order.tableNumber || ''} marcada como pagada (comprobante no generado)`);
            this.closeTableCheckout();
            this.closeTableDetail();
            this.loadOrders(false);
          },
          error: () => {
            this.toastService.error('Error al procesar el cobro de la mesa', 'Error');
          }
        });
      }
    });
  }

  // Cargar productos del pedido de una mesa al carrito de venta actual para agregarle productos o modificar
  loadTableOrderToCart(order: OrderResponse) {
    if (!order.details || order.details.length === 0) {
      this.toastService.warning('La orden no tiene productos');
      return;
    }

    const newItems: CartItem[] = order.details.map(d => {
      const existingProduct = this.products().find(p => p.id === d.productId);
      return {
        id: d.productId,
        name: d.productName || existingProduct?.name || `Producto #${d.productId}`,
        basePrice: d.unitPrice,
        quantity: d.quantity,
        description: existingProduct?.description || null,
        categoryId: existingProduct?.categoryId || null,
        categoryName: existingProduct?.categoryName || null,
        imageUrl: existingProduct?.imageUrl || null
      };
    });

    this.cart.set(newItems);
    this.orderMode.set('table');
    this.selectedTableNumber.set(order.tableNumber || '1');
    this.activeTab.set('pos');
    this.closeTableDetail();
    this.closeTablesMenu();
    this.toastService.info(`Productos de Mesa ${order.tableNumber} cargados al Punto de Venta`, 'Pedido en POS');
  }

  // Cancelar orden de mesa
  cancelTableOrder(order: OrderResponse) {
    if (!confirm(`¿Está seguro de cancelar el pedido #${order.id} de la Mesa ${order.tableNumber}?`)) {
      return;
    }

    this.orderService.deleteOrder(order.id).subscribe({
      next: () => {
        this.toastService.success(`Pedido de Mesa #${order.tableNumber} cancelado`);
        this.closeTableDetail();
        this.loadOrders(false);
      },
      error: () => this.toastService.error('No se pudo cancelar el pedido de la mesa')
    });
  }

  // Seleccionar mesa desde el plano de mesas
  selectFloorTable(table: RestaurantTable) {
    if (table.isOccupied && table.order) {
      this.openTableDetail(table.order);
    } else {
      // Mesa libre: iniciar venta para esa mesa
      this.orderMode.set('table');
      this.selectedTableNumber.set(table.number);
      this.activeTab.set('pos');
      this.toastService.info(`Mesa ${table.number} seleccionada para nueva orden`, 'Mesa Libre');
    }
  }

  getTimeAgo(dateStr: string): string {
    try {
      const orderDate = new Date(dateStr);
      const diffMs = Date.now() - orderDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Hace un momento';
      if (diffMins < 60) return `Hace ${diffMins} min`;
      const diffHours = Math.floor(diffMins / 60);
      return `Hace ${diffHours} h ${diffMins % 60} min`;
    } catch {
      return '';
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'Pending':
        return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'InPreparation':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Ready':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'Delivered':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Cancelled':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'Pending':
        return 'Pendiente';
      case 'InPreparation':
        return 'En Cocina';
      case 'Ready':
        return 'Listo p/ Servir';
      case 'Delivered':
        return 'Servido';
      case 'Cancelled':
        return 'Cancelado';
      default:
        return status;
    }
  }

  printPreCuenta(order: OrderResponse) {
    const printWindow = window.open('', '_blank', 'width=350,height=600');
    if (!printWindow) {
      this.toastService.warning('Habilite las ventanas emergentes para imprimir la pre-cuenta');
      return;
    }

    const itemsHtml = order.details.map(d => `
      <tr>
        <td style="padding: 4px 0; font-size: 12px;">${d.quantity}x ${d.productName || 'Prod'}</td>
        <td style="text-align: right; padding: 4px 0; font-size: 12px; font-weight: bold;">S/ ${d.subtotal.toFixed(2)}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Pre-Cuenta Mesa ${order.tableNumber}</title>
        <style>
          body { font-family: 'Courier New', monospace; padding: 15px; max-width: 280px; margin: 0 auto; color: #111; }
          h2 { text-align: center; margin: 0 0 5px 0; font-size: 16px; text-transform: uppercase; }
          .center { text-align: center; font-size: 11px; margin-bottom: 8px; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          table { width: 100%; border-collapse: collapse; }
          .total { font-size: 16px; font-weight: bold; text-align: right; margin-top: 8px; }
        </style>
      </head>
      <body>
        <h2>POLLERÍA EL GIGANTE</h2>
        <div class="center">PRE-CUENTA DE SALÓN</div>
        <div class="divider"></div>
        <div style="font-size: 12px;"><strong>MESA:</strong> ${order.tableNumber || '-'}</div>
        <div style="font-size: 12px;"><strong>ORDEN #:</strong> ${order.id}</div>
        <div style="font-size: 12px;"><strong>FECHA:</strong> ${new Date(order.orderDate).toLocaleString()}</div>
        <div style="font-size: 12px;"><strong>CLIENTE:</strong> ${order.customerName || 'Cliente en Salón'}</div>
        <div class="divider"></div>
        <table>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        <div class="divider"></div>
        <div class="total">TOTAL: S/ ${order.totalAmount.toFixed(2)}</div>
        <div class="divider"></div>
        <div class="center" style="margin-top: 15px;">** NO VÁLIDO COMO COMPROBANTE **<br>Gracias por su preferencia</div>
        <script>
          window.onload = function() { window.print(); window.close(); }
        </script>
      </body>
      </html>
    `);
    printWindow.document.close();
  }
}
