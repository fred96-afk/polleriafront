import { Injectable, computed, inject, signal } from '@angular/core';
import { ToastrService } from 'ngx-toastr';
import { PusherService } from './pusher.service';
import { OrderService } from './order.service';
import { NotificationCategory, SystemNotification } from '../models/notification.model';

const STORAGE_NOTIFICATIONS_KEY = 'polleria_system_notifications_v3';
const STORAGE_SOUND_KEY = 'polleria_notification_sound_enabled';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly pusherService = inject(PusherService);
  private readonly orderService = inject(OrderService);
  private readonly toastService = inject(ToastrService);

  // Estados Reactivos con Signals
  readonly notifications = signal<SystemNotification[]>([]);
  readonly isPanelOpen = signal<boolean>(false);
  readonly isModalOpen = signal<boolean>(false);
  readonly selectedCategory = signal<'all' | 'unread' | 'order' | 'table' | 'report'>('all');
  readonly statusFilter = signal<'all' | 'unread' | 'read'>('all');
  readonly searchQuery = signal<string>('');
  readonly soundEnabled = signal<boolean>(true);
  readonly pushPermission = signal<NotificationPermission>('default');

  // Computed signals
  readonly unreadCount = computed(() => this.notifications().filter(n => !n.read).length);
  readonly hasUnread = computed(() => this.unreadCount() > 0);
  readonly recentNotifications = computed(() => this.notifications().slice(0, 10));

  // Notificaciones filtradas para el panel desplegable
  readonly filteredNotifications = computed(() => {
    const list = this.notifications();
    const filter = this.selectedCategory();

    switch (filter) {
      case 'unread':
        return list.filter(n => !n.read);
      case 'order':
        return list.filter(n => n.category === 'order' || n.category === 'payment');
      case 'table':
        return list.filter(n => n.category === 'table');
      case 'report':
        return list.filter(n => n.category === 'report');
      default:
        return list;
    }
  });

  // Notificaciones filtradas para el modal de lista completa (con búsqueda)
  readonly modalFilteredNotifications = computed(() => {
    let list = this.notifications();
    const query = this.searchQuery().trim().toLowerCase();
    const category = this.selectedCategory();
    const status = this.statusFilter();

    if (category === 'unread') {
      list = list.filter(n => !n.read);
    } else if (category === 'order') {
      list = list.filter(n => n.category === 'order' || n.category === 'payment');
    } else if (category === 'table') {
      list = list.filter(n => n.category === 'table');
    } else if (category === 'report') {
      list = list.filter(n => n.category === 'report');
    }

    if (status === 'unread') {
      list = list.filter(n => !n.read);
    } else if (status === 'read') {
      list = list.filter(n => n.read);
    }

    if (query) {
      list = list.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.message.toLowerCase().includes(query) ||
        (n.tableNumber && n.tableNumber.toLowerCase().includes(query)) ||
        (n.orderId && String(n.orderId).includes(query))
      );
    }

    return list;
  });

  constructor() {
    this.loadFromStorage();
    this.checkPushPermission();
    this.initPusherListeners();
    this.loadSystemOrders();
  }

  // ==========================================
  // PERSISTENCIA Y CARGA DE ALMACENAMIENTO
  // ==========================================
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;

    try {
      const soundPref = localStorage.getItem(STORAGE_SOUND_KEY);
      if (soundPref !== null) {
        this.soundEnabled.set(soundPref === 'true');
      }

      const raw = localStorage.getItem(STORAGE_NOTIFICATIONS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const list: SystemNotification[] = parsed.map((item: any) => ({
            ...item,
            timestamp: new Date(item.timestamp)
          }));
          const clean = this.deduplicateList(list);
          this.notifications.set(clean);
          return;
        }
      }
    } catch (e) {
      console.warn('Error al cargar notificaciones de localStorage:', e);
    }

    // Inicializar lista sin elementos duplicados
    this.seedInitialNotifications();
  }

  private seedInitialNotifications(): void {
    const now = Date.now();
    const initialList: SystemNotification[] = [
      {
        id: 'seed_order_124',
        title: '🍗 Nuevo Pedido #124 - Mesa 4',
        message: 'Salón • 1 Pollo a la brasa + Papas familiares + Chicha morada (S/ 68.00)',
        category: 'order',
        type: 'new_order',
        timestamp: new Date(now - 1000 * 60 * 3),
        read: false,
        orderId: 124,
        tableNumber: '4',
        amount: 68.0,
        routeLink: '/admin/dashboard/orders',
        actionText: 'Ver Pedido',
        icon: 'receipt_long',
        color: 'bg-emerald-600',
        priority: 'high'
      },
      {
        id: 'seed_table_call_6',
        title: '🔔 Mesa 6: Llamada de Mozo',
        message: 'El cliente en Mesa 6 solicita atención del personal.',
        category: 'table',
        type: 'call_waiter',
        timestamp: new Date(now - 1000 * 60 * 8),
        read: false,
        tableNumber: '6',
        routeLink: '/admin/dashboard/tables',
        actionText: 'Ver Mesas',
        icon: 'notifications_active',
        color: 'bg-purple-600',
        priority: 'urgent'
      },
      {
        id: 'seed_table_bill_2',
        title: '🧾 Mesa 2: Solicitud de Cuenta',
        message: 'Mesa 2 solicita la cuenta para pagar S/ 54.00.',
        category: 'table',
        type: 'request_bill',
        timestamp: new Date(now - 1000 * 60 * 18),
        read: true,
        tableNumber: '2',
        amount: 54.0,
        routeLink: '/admin/dashboard/tables',
        actionText: 'Ver Mesas',
        icon: 'receipt',
        color: 'bg-amber-600',
        priority: 'high'
      },
      {
        id: 'seed_report_sales',
        title: '📊 Reporte de Ventas Generado',
        message: 'Reporte consolidado del día disponible en formato Excel.',
        category: 'report',
        type: 'report_ready',
        timestamp: new Date(now - 1000 * 60 * 42),
        read: true,
        routeLink: '/admin/dashboard/reports',
        actionText: 'Descargar Reporte',
        icon: 'analytics',
        color: 'bg-teal-600',
        priority: 'normal'
      },
      {
        id: 'seed_payment_120',
        title: '💳 Pago Confirmado - Pedido #120',
        message: 'Pago de S/ 85.00 aprobado vía Mercado Pago (Delivery).',
        category: 'payment',
        type: 'payment_updated',
        timestamp: new Date(now - 1000 * 60 * 75),
        read: true,
        orderId: 120,
        amount: 85.0,
        routeLink: '/admin/dashboard/orders',
        actionText: 'Ver Pedido',
        icon: 'payments',
        color: 'bg-blue-600',
        priority: 'normal'
      }
    ];

    this.notifications.set(initialList);
    this.saveToStorage();
  }

  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_NOTIFICATIONS_KEY, JSON.stringify(this.notifications()));
      localStorage.setItem(STORAGE_SOUND_KEY, String(this.soundEnabled()));
    } catch (e) {
      console.warn('Error al guardar notificaciones en localStorage:', e);
    }
  }

  /**
   * Elimina elementos duplicados de la lista garantizando unicidad por ID, por número de orden o por llamada de mesa.
   */
  private deduplicateList(list: SystemNotification[]): SystemNotification[] {
    const seenIds = new Set<string>();
    const seenOrders = new Set<string>();
    const seenEvents = new Set<string>();
    const result: SystemNotification[] = [];

    for (const item of list) {
      if (!item || !item.id) continue;

      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);

      // Deduplicar órdenes por orderId
      if (item.orderId) {
        const orderKey = `order_${String(item.orderId).trim()}_${item.type || 'order'}`;
        if (seenOrders.has(orderKey)) continue;
        seenOrders.add(orderKey);
      }

      // Deduplicar alertas de mesa idénticas en lapsos cortos
      if (item.tableNumber && item.type) {
        const eventKey = `table_${String(item.tableNumber).trim()}_${item.type}`;
        if (seenEvents.has(eventKey)) continue;
        seenEvents.add(eventKey);
      }

      result.push(item);
    }

    return result;
  }

  // ==========================================
  // CARGA DE ÓRDENES REALES DEL BACKEND
  // ==========================================
  loadSystemOrders(): void {
    try {
      this.orderService.getOrders().subscribe({
        next: (orders) => {
          if (!orders || !Array.isArray(orders) || orders.length === 0) return;

          const sorted = [...orders]
            .sort((a, b) => {
              const timeA = a.orderDate ? new Date(a.orderDate).getTime() : 0;
              const timeB = b.orderDate ? new Date(b.orderDate).getTime() : 0;
              return timeB - timeA;
            })
            .slice(0, 15);

          for (const order of sorted) {
            const strOrderId = String(order.id).trim();
            const notifId = `order_api_${strOrderId}`;

            // Comprobar estrictamente si ya existe en la lista
            const exists = this.notifications().some(n => 
              n.id === notifId || 
              (n.orderId && String(n.orderId).trim() === strOrderId) ||
              (n.title && n.title.includes(`#${strOrderId}`))
            );

            if (!exists) {
              const customer = order.customerName || (order.tableNumber ? `Mesa ${order.tableNumber}` : 'Cliente');
              const type = order.tableNumber ? `Mesa ${order.tableNumber}` : (order.type || 'Salón / POS');
              const amount = Number(order.totalAmount || 0).toFixed(2);
              const isDone = order.paymentStatus === 'Approved' || order.status === 'Cancelled' || order.status === 'Delivered';

              const newOrderNotif: SystemNotification = {
                id: notifId,
                title: `🍗 Pedido #${order.id} - ${customer}`,
                message: `${type} • Monto Total: S/ ${amount} • Estado: ${order.status || 'Registrado'}`,
                category: 'order',
                type: 'new_order',
                timestamp: order.orderDate ? new Date(order.orderDate) : new Date(),
                read: isDone,
                orderId: order.id,
                tableNumber: order.tableNumber || undefined,
                amount: order.totalAmount,
                routeLink: '/admin/dashboard/orders',
                actionText: 'Ver Pedido',
                icon: 'receipt_long',
                color: 'bg-emerald-600',
                priority: isDone ? 'normal' : 'high'
              };

              this.notifications.update(prev => this.deduplicateList([newOrderNotif, ...prev]).slice(0, 50));
            }
          }
          this.saveToStorage();
        },
        error: () => {}
      });
    } catch (e) {
      // ignore
    }
  }

  // ==========================================
  // ESCUCHA DE EVENTOS EN VIVO (PUSHER)
  // ==========================================
  private initPusherListeners(): void {
    // 1. Escuchar eventos de pedidos generales
    this.pusherService.orderNotifications$.subscribe({
      next: (data) => this.handleIncomingOrderEvent(data),
      error: (err) => console.error('Error en notificaciones de pedidos:', err)
    });

    // 2. Escuchar canal 'tables' (llamada de mozo, pedido de cuenta)
    try {
      this.pusherService.subscribeToChannel('tables', 'table-alert', (data: any) => {
        this.handleTableAlert(data);
      });
      this.pusherService.subscribeToChannel('tables', 'call-waiter', (data: any) => {
        this.handleTableAlert({ ...data, type: 'call_waiter' });
      });
      this.pusherService.subscribeToChannel('tables', 'request-bill', (data: any) => {
        this.handleTableAlert({ ...data, type: 'request_bill' });
      });
    } catch (e) {
      console.warn('Advertencia en suscripción de canal tables:', e);
    }

    // 3. Escuchar canal 'reports' (reportes listos o fallidos)
    try {
      this.pusherService.subscribeToChannel('reports', 'report-ready', (data: any) => {
        this.handleReportEvent(data, true);
      });
      this.pusherService.subscribeToChannel('reports', 'report-completed', (data: any) => {
        this.handleReportEvent(data, true);
      });
      this.pusherService.subscribeToChannel('reports', 'report-failed', (data: any) => {
        this.handleReportEvent(data, false);
      });
    } catch (e) {
      console.warn('Advertencia en suscripción de canal reports:', e);
    }
  }

  private handleIncomingOrderEvent(data: any): void {
    if (!data) return;
    const event = data.event || 'new-order';
    const id = data.id || data.orderId || (data.order && data.order.id) || '';
    const customerName = data.customerName || (data.customer && data.customer.name) || (data.tableNumber ? `Mesa ${data.tableNumber}` : 'Cliente');
    const tableNum = data.tableNumber || (data.order && data.order.tableNumber) || '';
    const type = data.type || (tableNum ? `Mesa ${tableNum}` : (data.isPos ? 'Salón / POS' : 'Delivery'));
    const totalAmount = Number(data.totalAmount || (data.order && data.order.totalAmount) || 0).toFixed(2);

    if (event === 'new-order') {
      this.addNotification({
        id: `order_live_${id}`,
        title: `🍗 ¡Nuevo Pedido #${id}!`,
        message: `${customerName} (${type}) • Monto Total: S/ ${totalAmount}`,
        category: 'order',
        type: 'new_order',
        orderId: Number(id) || undefined,
        tableNumber: tableNum || undefined,
        amount: Number(totalAmount),
        routeLink: '/admin/dashboard/orders',
        actionText: 'Ver Pedido',
        icon: 'receipt_long',
        color: 'bg-emerald-600',
        priority: 'high'
      });
    } else if (event === 'status-updated') {
      const status = data.status || 'Actualizado';
      this.addNotification({
        id: `status_live_${id}_${status}`,
        title: `Pedido #${id}: Estado Actualizado`,
        message: `El pedido de ${customerName} cambió al estado: "${status}"`,
        category: 'order',
        type: 'status_updated',
        orderId: Number(id) || undefined,
        tableNumber: tableNum || undefined,
        routeLink: '/admin/dashboard/orders',
        actionText: 'Ver Pedido',
        icon: 'update',
        color: 'bg-blue-600',
        priority: 'normal'
      });
    } else if (event === 'payment-updated') {
      const paymentStatus = data.paymentStatus || 'Aprobado';
      this.addNotification({
        id: `payment_live_${id}_${paymentStatus}`,
        title: `💳 Pago de Pedido #${id}`,
        message: `Estado de pago actualizado: ${paymentStatus} (S/ ${totalAmount})`,
        category: 'payment',
        type: 'payment_updated',
        orderId: Number(id) || undefined,
        amount: Number(totalAmount),
        routeLink: '/admin/dashboard/orders',
        actionText: 'Ver Pedido',
        icon: 'payments',
        color: 'bg-teal-600',
        priority: 'normal'
      });
    } else if (event === 'order-accepted') {
      this.addNotification({
        id: `accepted_live_${id}`,
        title: `🛵 Pedido #${id} en Entrega`,
        message: `El pedido para ${customerName} fue aceptado por el repartidor.`,
        category: 'order',
        type: 'order_accepted',
        orderId: Number(id) || undefined,
        routeLink: '/admin/dashboard/orders',
        actionText: 'Ver Pedido',
        icon: 'delivery_dining',
        color: 'bg-indigo-600',
        priority: 'normal'
      });
    }
  }

  private handleTableAlert(data: any): void {
    if (!data || !data.tableNumber) return;
    const tableNum = String(data.tableNumber).trim();
    const type = data.type || 'call_waiter';

    if (type === 'call_waiter') {
      this.addNotification({
        id: `call_${tableNum}_${Date.now()}`,
        title: `🔔 Mesa ${tableNum}: Llamada de Mozo`,
        message: data.message || `El cliente en Mesa ${tableNum} solicita atención inmediata.`,
        category: 'table',
        type: 'call_waiter',
        tableNumber: tableNum,
        routeLink: '/admin/dashboard/tables',
        actionText: 'Ver Mesa',
        icon: 'notifications_active',
        color: 'bg-purple-600',
        priority: 'urgent'
      });
    } else if (type === 'request_bill') {
      this.addNotification({
        id: `bill_${tableNum}_${Date.now()}`,
        title: `🧾 Mesa ${tableNum}: Solicitud de Cuenta`,
        message: data.message || `El comensal de Mesa ${tableNum} ha solicitado la cuenta.`,
        category: 'table',
        type: 'request_bill',
        tableNumber: tableNum,
        routeLink: '/admin/dashboard/tables',
        actionText: 'Ver Mesa',
        icon: 'receipt',
        color: 'bg-amber-600',
        priority: 'high'
      });
    }
  }

  private handleReportEvent(data: any, success: boolean): void {
    if (!data) return;
    const reportType = data.reportType || data.ReportType || 'General';
    const fileName = data.fileName || data.FileName || '';

    if (success) {
      this.addNotification({
        id: `report_ok_${fileName || Date.now()}`,
        title: `📊 Reporte Listo: ${reportType}`,
        message: data.message || `El reporte "${fileName || reportType}" ha finalizado exitosamente.`,
        category: 'report',
        type: 'report_ready',
        routeLink: '/admin/dashboard/reports',
        actionText: 'Descargar Reporte',
        icon: 'analytics',
        color: 'bg-teal-600',
        priority: 'normal'
      });
    } else {
      this.addNotification({
        id: `report_err_${Date.now()}`,
        title: `⚠️ Error en Reporte: ${reportType}`,
        message: data.message || 'No se pudo generar el reporte solicitado.',
        category: 'report',
        type: 'report_failed',
        routeLink: '/admin/dashboard/reports',
        actionText: 'Ver Reportes',
        icon: 'error_outline',
        color: 'bg-rose-600',
        priority: 'high'
      });
    }
  }

  // ==========================================
  // GESTIÓN DE NOTIFICACIONES (CRUD EN MEMORIA)
  // ==========================================
  addNotification(item: Omit<SystemNotification, 'id' | 'timestamp' | 'read'> & Partial<SystemNotification>): void {
    const id = item.id || `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const itemOrderId = item.orderId ? String(item.orderId).trim() : null;

    // Verificación estricta de duplicados
    const isDuplicate = this.notifications().some(n => {
      if (n.id === id) return true;

      if (itemOrderId && n.orderId && String(n.orderId).trim() === itemOrderId) {
        if (n.type === item.type) return true;
        if (n.title.includes(`#${itemOrderId}`) && item.title.includes(`#${itemOrderId}`)) return true;
      }

      if (item.tableNumber && n.tableNumber && item.type && n.type === item.type) {
        if (String(item.tableNumber).trim() === String(n.tableNumber).trim()) {
          const diffMs = Math.abs(Date.now() - new Date(n.timestamp).getTime());
          if (diffMs < 60000) return true;
        }
      }

      if (n.title.trim().toLowerCase() === item.title.trim().toLowerCase()) {
        const diffMs = Math.abs(Date.now() - new Date(n.timestamp).getTime());
        if (diffMs < 60000) return true;
      }

      return false;
    });

    if (isDuplicate) return;

    const newNotif: SystemNotification = {
      id,
      title: item.title,
      message: item.message,
      category: item.category,
      type: item.type,
      timestamp: item.timestamp || new Date(),
      read: false,
      orderId: item.orderId,
      tableNumber: item.tableNumber,
      amount: item.amount,
      routeLink: item.routeLink,
      actionText: item.actionText,
      icon: item.icon || this.getDefaultIcon(item.category),
      color: item.color || this.getDefaultColor(item.category),
      priority: item.priority || 'normal',
      data: item.data
    };

    // Añadir al inicio y deduplicar
    this.notifications.update(prev => this.deduplicateList([newNotif, ...prev]).slice(0, 50));
    this.saveToStorage();

    // Reproducir sonido si está habilitado
    if (this.soundEnabled()) {
      this.playAlertSound(newNotif.category);
    }

    // Notificación Push de escritorio del navegador si tiene permisos
    this.showBrowserPushNotification(newNotif.title, {
      body: newNotif.message,
      tag: newNotif.id
    });
  }

  markAsRead(id: string): void {
    this.notifications.update(list =>
      list.map(n => n.id === id ? { ...n, read: true } : n)
    );
    this.saveToStorage();
  }

  toggleReadStatus(id: string): void {
    this.notifications.update(list =>
      list.map(n => n.id === id ? { ...n, read: !n.read } : n)
    );
    this.saveToStorage();
  }

  markAllAsRead(): void {
    this.notifications.update(list =>
      list.map(n => ({ ...n, read: true }))
    );
    this.saveToStorage();
    this.toastService.success('Todas las notificaciones de la lista fueron marcadas como leídas');
  }

  removeNotification(id: string): void {
    this.notifications.update(list => list.filter(n => n.id !== id));
    this.saveToStorage();
  }

  clearAll(): void {
    this.notifications.set([]);
    this.saveToStorage();
    this.toastService.info('La lista de notificaciones ha sido vaciada');
  }

  // ==========================================
  // ESTADO DE LA INTERFAZ (PANEL / MODAL)
  // ==========================================
  togglePanel(): void {
    this.isPanelOpen.update(v => !v);
  }

  openPanel(): void {
    this.isPanelOpen.set(true);
  }

  closePanel(): void {
    this.isPanelOpen.set(false);
  }

  openModal(): void {
    this.isModalOpen.set(true);
    this.isPanelOpen.set(false);
  }

  closeModal(): void {
    this.isModalOpen.set(false);
  }

  setFilter(filter: 'all' | 'unread' | 'order' | 'table' | 'report'): void {
    this.selectedCategory.set(filter);
  }

  setStatusFilter(status: 'all' | 'unread' | 'read'): void {
    this.statusFilter.set(status);
  }

  setSearchQuery(query: string): void {
    this.searchQuery.set(query);
  }

  toggleSound(): void {
    const next = !this.soundEnabled();
    this.soundEnabled.set(next);
    localStorage.setItem(STORAGE_SOUND_KEY, String(next));
    if (next) {
      this.playAlertSound('system');
      this.toastService.info('Sonido de alertas activado');
    } else {
      this.toastService.warning('Sonido de alertas silenciado');
    }
  }

  // ==========================================
  // PERMISOS DE PUSH Y AUDIO SINTETIZADO
  // ==========================================
  checkPushPermission(): void {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      this.pushPermission.set(Notification.permission);
    }
  }

  async requestPushPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      this.toastService.warning('Tu navegador no soporta Notificaciones Push del sistema');
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      this.pushPermission.set(permission);
      if (permission === 'granted') {
        this.toastService.success('¡Notificaciones del sistema activadas correctamente!');
        this.showBrowserPushNotification('🍗 Pollería El Gigante', {
          body: 'Notificaciones en tiempo real activadas exitosamente.'
        });
      } else {
        this.toastService.info('Permiso de notificaciones no concedido.');
      }
      return permission;
    } catch (e) {
      console.error('Error solicitando permisos de notificación:', e);
      return 'denied';
    }
  }

  showBrowserPushNotification(title: string, options?: NotificationOptions): void {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      try {
        new Notification(title, {
          icon: '/favicon.ico',
          badge: '/favicon.ico',
          ...options
        });
      } catch (err) {
        console.warn('Error mostrando push nativo:', err);
      }
    }
  }

  playAlertSound(category: NotificationCategory): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      if (category === 'order') {
        this.playTone(ctx, 587.33, now, 0.35);
        this.playTone(ctx, 880.00, now + 0.12, 0.45);
      } else if (category === 'table') {
        this.playTone(ctx, 659.25, now, 0.25);
        this.playTone(ctx, 783.99, now + 0.15, 0.35);
      } else if (category === 'report') {
        this.playTone(ctx, 523.25, now, 0.3);
        this.playTone(ctx, 659.25, now + 0.1, 0.4);
      } else {
        this.playTone(ctx, 440.00, now, 0.2);
      }
    } catch (e) {
      console.warn('Error reproduciendo sonido sintético:', e);
    }
  }

  private playTone(ctx: AudioContext, frequency: number, startTime: number, duration: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  // ==========================================
  // SIMULADOR DE NOTIFICACIONES
  // ==========================================
  simulateTestNotification(type: 'order' | 'call_waiter' | 'request_bill' | 'report' | 'system'): void {
    const randomId = Math.floor(200 + Math.random() * 800);
    const randomTable = Math.floor(1 + Math.random() * 12);
    const randomAmount = (Math.random() * 80 + 25).toFixed(2);

    switch (type) {
      case 'order':
        this.handleIncomingOrderEvent({
          event: 'new-order',
          id: randomId,
          customerName: `Cliente Prueba #${randomId}`,
          tableNumber: `${randomTable}`,
          totalAmount: randomAmount
        });
        break;

      case 'call_waiter':
        this.handleTableAlert({
          tableNumber: `${randomTable}`,
          type: 'call_waiter',
          message: `El cliente de Mesa ${randomTable} solicita mozo para ordenar.`
        });
        break;

      case 'request_bill':
        this.handleTableAlert({
          tableNumber: `${randomTable}`,
          type: 'request_bill',
          message: `La Mesa ${randomTable} ha solicitado la cuenta (S/ ${randomAmount}).`
        });
        break;

      case 'report':
        this.handleReportEvent({
          reportType: 'Ventas del Día',
          fileName: `reporte_ventas_${Date.now()}.xlsx`,
          message: 'Reporte de ventas del día consolidado exitosamente.'
        }, true);
        break;

      case 'system':
      default:
        this.addNotification({
          title: 'Notificación de Prueba',
          message: 'Esta es una notificación de prueba del sistema para verificar la lista.',
          category: 'system',
          type: 'system_alert',
          routeLink: '/admin/dashboard/summary',
          actionText: 'Ver Dashboard',
          icon: 'info',
          color: 'bg-blue-600'
        });
        break;
    }
  }

  private getDefaultIcon(category: NotificationCategory): string {
    switch (category) {
      case 'order': return 'receipt_long';
      case 'table': return 'notifications_active';
      case 'report': return 'analytics';
      case 'payment': return 'payments';
      default: return 'notifications';
    }
  }

  private getDefaultColor(category: NotificationCategory): string {
    switch (category) {
      case 'order': return 'bg-emerald-600';
      case 'table': return 'bg-purple-600';
      case 'report': return 'bg-teal-600';
      case 'payment': return 'bg-teal-700';
      default: return 'bg-orange-600';
    }
  }
}
