import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FloorMap, RestaurantTable, TableNotification, TableStatus, ChairSlot, TableShape } from '../models/table-map.model';
import { OrderResponse } from '../models/order.model';
import { PusherService } from './pusher.service';
import { ToastrService } from 'ngx-toastr';
import { NotificationService } from './notification.service';
import { enviroment } from '../../enviroments/enviroments.development';

const STORAGE_MAPS_KEY = 'polleria_floor_maps_v2';
const STORAGE_TABLES_KEY = 'polleria_restaurant_tables_v3';

@Injectable({
  providedIn: 'root'
})
export class TableMapService {
  private readonly http = inject(HttpClient);
  private readonly pusherService = inject(PusherService);
  private readonly toastService = inject(ToastrService);
  private readonly notificationService = inject(NotificationService);

  private readonly apiUrl = `${enviroment.backenbaseurl}/api/Tables`;

  // Estados reactivos (Signals)
  maps = signal<FloorMap[]>([]);
  activeMapId = signal<string>('salon-principal');
  tables = signal<RestaurantTable[]>([]);
  notifications = signal<TableNotification[]>([]);
  pushPermission = signal<NotificationPermission>('default');

  // Computed: plano activo
  activeMap = computed(() => {
    const list = this.maps();
    const id = this.activeMapId();
    return list.find(m => m.id === id) || list[0] || null;
  });

  // Computed: mesas del plano activo
  activeMapTables = computed(() => {
    const currentMapId = this.activeMapId();
    return this.tables().filter(t => t.mapId === currentMapId);
  });

  // Computed: estadísticas de mesas globales
  tableStats = computed(() => {
    const all = this.tables();
    const total = all.length;
    const occupied = all.filter(t => t.status === 'occupied' || t.status === 'billing' || t.status === 'calling').length;
    const available = all.filter(t => t.status === 'available' || !t.status).length;
    const billing = all.filter(t => t.status === 'billing').length;
    const calling = all.filter(t => t.status === 'calling').length;
    const occupancyRate = total > 0 ? Math.round((occupied / total) * 100) : 0;
    const totalChairs = all.reduce((acc, t) => acc + (t.chairs || t.capacity || 4), 0);
    return { total, occupied, available, billing, calling, occupancyRate, totalChairs };
  });

  constructor() {
    this.checkPushPermission();
    this.loadFromStorage();
    this.loadFromBackend();
    this.initPusherListeners();
  }

  // ==========================================
  // PERMISOS Y NOTIFICACIONES PUSH DEL NAVEGADOR
  // ==========================================
  checkPushPermission() {
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
        this.toastService.success('¡Notificaciones Push activadas para mesas y pedidos!', 'Notificaciones');
        this.showBrowserPushNotification('Pollería El Gigante', {
          body: 'Notificaciones Push activadas en tiempo real para las mesas del salón.',
          icon: '/favicon.ico'
        });
      } else if (permission === 'denied') {
        this.toastService.warning('Has denegado las notificaciones push en el navegador');
      }
      return permission;
    } catch (err) {
      console.error('Error al solicitar permiso de notificación:', err);
      return 'denied';
    }
  }

  showBrowserPushNotification(title: string, options?: any) {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        const notifOptions: any = {
          badge: '/favicon.ico',
          icon: '/favicon.ico',
          ...options
        };
        const notif = new Notification(title, notifOptions);
        notif.onclick = () => {
          window.focus();
          notif.close();
        };
      } catch (e) {
        console.warn('Error al mostrar notificación push nativa:', e);
      }
    }
  }

  // Sintetizador de audio nativo con Web Audio API
  playAlertSound(type: 'order' | 'call' | 'bill' = 'order') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (type === 'call') {
        this.playTone(ctx, 880, 0, 0.25);
        this.playTone(ctx, 1174.66, 0.15, 0.35);
      } else if (type === 'bill') {
        this.playTone(ctx, 523.25, 0, 0.2);
        this.playTone(ctx, 659.25, 0.1, 0.2);
        this.playTone(ctx, 783.99, 0.2, 0.35);
      } else {
        this.playTone(ctx, 587.33, 0, 0.25);
        this.playTone(ctx, 880, 0.12, 0.4);
      }
    } catch (e) {
      console.warn('Web Audio no disponible:', e);
    }
  }

  private playTone(ctx: AudioContext, freq: number, delay: number, duration: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    
    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + delay + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration);
  }

  // ==========================================
  // INICIALIZACIÓN DE PUSHER Y EVENTOS EN VIVO
  // ==========================================
  private initPusherListeners() {
    this.pusherService.orderNotifications$.subscribe(eventData => {
      this.handleIncomingPusherOrder(eventData);
    });

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
    } catch (err) {
      console.warn('Pusher tables subscription warning:', err);
    }
  }

  private handleIncomingPusherOrder(data: any) {
    if (!data) return;
    const tableNum = data.tableNumber || (data.order && data.order.tableNumber) || '';
    const orderId = data.id || data.orderId || (data.order && data.order.id) || '';
    const total = data.totalAmount || (data.order && data.order.totalAmount) || 0;

    if (tableNum) {
      const cleanTable = this.normalizeTableNumber(tableNum);
      
      this.tables.update(list => list.map(t => {
        if (this.normalizeTableNumber(t.number) === cleanTable) {
          return {
            ...t,
            status: 'occupied',
            currentOrderId: Number(orderId) || t.currentOrderId
          };
        }
        return t;
      }));

      this.playAlertSound('order');

      this.showBrowserPushNotification(`🍗 Nuevo Pedido - Mesa ${cleanTable}`, {
        body: `Pedido #${orderId} recibido para Mesa ${cleanTable}. Total: S/ ${Number(total).toFixed(2)}`,
        tag: `order-${orderId}`
      });

      this.addNotification({
        id: 'notif_' + Date.now(),
        tableNumber: cleanTable,
        type: 'new_order',
        title: `Mesa ${cleanTable}: Nuevo Pedido #${orderId}`,
        message: `Se ha registrado una comanda por S/ ${Number(total).toFixed(2)}`,
        orderId: Number(orderId),
        amount: Number(total),
        timestamp: new Date(),
        read: false
      });
    }
  }

  private handleTableAlert(data: any) {
    if (!data || !data.tableNumber) return;
    const tableNum = this.normalizeTableNumber(data.tableNumber);
    const type = data.type || 'call_waiter';

    if (type === 'call_waiter') {
      this.playAlertSound('call');
      this.updateTableStatus(tableNum, 'calling');
      this.showBrowserPushNotification(`🔔 Mesa ${tableNum} solicita atención`, {
        body: data.message || 'El comensal está llamando al mozo.',
        tag: `call-${tableNum}`
      });
      this.toastService.info(`La Mesa ${tableNum} está solicitando atención del mozo`, '🔔 LLAMADA DE MOZO', {
        timeOut: 8000,
        progressBar: true
      });
      this.addNotification({
        id: 'call_' + Date.now(),
        tableNumber: tableNum,
        type: 'call_waiter',
        title: `Mesa ${tableNum}: Llamada de Mozo`,
        message: data.message || 'El cliente solicita atención inmediata en la mesa.',
        timestamp: new Date(),
        read: false
      });
    } else if (type === 'request_bill') {
      this.playAlertSound('bill');
      this.updateTableStatus(tableNum, 'billing');
      this.showBrowserPushNotification(`💳 Mesa ${tableNum} solicita la cuenta`, {
        body: data.message || 'El comensal ha pedido la cuenta / pre-cuenta.',
        tag: `bill-${tableNum}`
      });
      this.toastService.warning(`La Mesa ${tableNum} ha solicitado la cuenta`, '💳 CUENTA SOLICITADA', {
        timeOut: 8000,
        progressBar: true
      });
      this.addNotification({
        id: 'bill_' + Date.now(),
        tableNumber: tableNum,
        type: 'request_bill',
        title: `Mesa ${tableNum}: Solicitud de Cuenta`,
        message: data.message || 'El cliente solicita que se le lleve la cuenta para pagar.',
        timestamp: new Date(),
        read: false
      });
    }
  }

  triggerTableAlert(tableNumber: string, type: 'call_waiter' | 'request_bill' | 'new_order', message?: string) {
    const cleanNum = this.normalizeTableNumber(tableNumber);
    this.handleTableAlert({
      tableNumber: cleanNum,
      type,
      message: message || (type === 'call_waiter' ? 'Cliente solicita mozo' : 'Cliente solicita la cuenta')
    });
  }

  private updateTableStatus(tableNumber: string, status: TableStatus) {
    const clean = this.normalizeTableNumber(tableNumber);
    this.tables.update(list => list.map(t => {
      if (this.normalizeTableNumber(t.number) === clean) {
        return { ...t, status };
      }
      return t;
    }));
  }

  private addNotification(notif: TableNotification) {
    this.notifications.update(prev => [notif, ...prev.slice(0, 49)]);
    this.notificationService.addNotification({
      id: notif.id,
      title: notif.title,
      message: notif.message,
      category: notif.type === 'new_order' ? 'order' : 'table',
      type: notif.type,
      orderId: notif.orderId,
      tableNumber: notif.tableNumber,
      amount: notif.amount,
      routeLink: notif.type === 'new_order' ? '/admin/dashboard/orders' : '/admin/dashboard/tables',
      actionText: notif.type === 'new_order' ? 'Ver Pedidos' : 'Ver Mesas',
      icon: notif.type === 'new_order' ? 'receipt_long' : (notif.type === 'call_waiter' ? 'notifications_active' : 'receipt'),
      color: notif.type === 'new_order' ? 'bg-emerald-600' : (notif.type === 'call_waiter' ? 'bg-purple-600' : 'bg-amber-600')
    });
  }

  markNotificationAsRead(id: string) {
    this.notifications.update(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  clearAllNotifications() {
    this.notifications.set([]);
  }

  // ==========================================
  // SINCRONIZACIÓN CON ÓRDENES DEL BACKEND
  // ==========================================
  syncTablesWithOrders(orders: OrderResponse[]) {
    const orderMap = new Map<string, OrderResponse>();

    for (const order of orders) {
      if (order.tableNumber && order.tableNumber.trim()) {
        const key = this.normalizeTableNumber(order.tableNumber);
        const isCompleted = order.paymentStatus === 'Approved' || order.status === 'Cancelled';
        if (!isCompleted && !orderMap.has(key)) {
          orderMap.set(key, order);
        }
      }
    }

    this.tables.update(currentTables => {
      const updated: RestaurantTable[] = currentTables.map(t => {
        const key = this.normalizeTableNumber(t.number);
        const activeOrder = orderMap.get(key) || null;
        let newStatus: TableStatus = 'available';

        if (activeOrder) {
          if (t.status === 'billing' || t.status === 'calling') {
            newStatus = t.status;
          } else {
            newStatus = 'occupied';
          }
        }

        return {
          ...t,
          label: t.name || `Mesa ${t.number}`,
          isOccupied: Boolean(activeOrder) || newStatus === 'occupied' || newStatus === 'billing' || newStatus === 'calling',
          status: newStatus,
          order: activeOrder,
          currentOrderId: activeOrder ? activeOrder.id : undefined
        };
      });

      for (const [key, order] of orderMap.entries()) {
        const exists = updated.some(t => this.normalizeTableNumber(t.number) === key);
        if (!exists) {
          const activeMap = this.activeMapId() || 'salon-principal';
          const autoTable: RestaurantTable = {
            id: 'table_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
            number: key,
            name: `Mesa ${key}`,
            label: `Mesa ${key}`,
            isOccupied: true,
            mapId: activeMap,
            chairs: 4,
            capacity: 4,
            location: 'Salón Principal - Asignada',
            shape: 'square' as const,
            x: Math.min(85, 10 + (updated.length % 5) * 16),
            y: Math.min(85, 15 + Math.floor(updated.length / 5) * 18),
            isActive: true,
            status: 'occupied' as const,
            order,
            currentOrderId: order.id
          };
          updated.push(autoTable);
        }
      }

      return updated;
    });
  }

  normalizeTableNumber(num: string | null | undefined): string {
    if (!num) return '';
    return num.trim().replace(/^mesa\s+/i, '').replace(/^m-/i, '').trim();
  }

  // ==========================================
  // CÁLCULO VISUAL DE SILLAS EN LAS MESAS
  // ==========================================
  getChairSlots(table: { chairs?: number; capacity?: number; shape?: TableShape }): ChairSlot[] {
    const total = Math.max(1, Math.min(30, Number(table.chairs || table.capacity || 4)));
    const shape = table.shape || 'square';
    const slots: ChairSlot[] = [];

    if (shape === 'round') {
      for (let i = 0; i < total; i++) {
        const angle = (i * 360) / total;
        const rad = (angle - 90) * (Math.PI / 180);
        const r = 58; // radio en % desde el centro
        const cx = 50 + r * Math.cos(rad);
        const cy = 50 + r * Math.sin(rad);
        slots.push({
          id: i,
          side: 'radial',
          percent: 50,
          angle,
          style: {
            left: `${cx.toFixed(1)}%`,
            top: `${cy.toFixed(1)}%`,
            transform: `translate(-50%, -50%) rotate(${angle.toFixed(1)}deg)`
          }
        });
      }
      return slots;
    }

    if (shape === 'rectangle') {
      let leftCount = 0;
      let rightCount = 0;
      let topCount = 0;
      let bottomCount = 0;

      if (total <= 2) {
        topCount = 1;
        bottomCount = total > 1 ? 1 : 0;
      } else if (total <= 4) {
        topCount = 1;
        bottomCount = 1;
        leftCount = 1;
        rightCount = total > 3 ? 1 : 0;
      } else {
        leftCount = 1;
        rightCount = 1;
        const remaining = total - 2;
        topCount = Math.ceil(remaining / 2);
        bottomCount = remaining - topCount;
      }

      let id = 0;
      for (let i = 0; i < topCount; i++) {
        const pct = topCount === 1 ? 50 : 20 + (i * 60) / (topCount - 1);
        slots.push({ id: id++, side: 'top', percent: pct, style: { top: '-7px', left: `${pct.toFixed(1)}%`, transform: 'translateX(-50%)' } });
      }
      for (let i = 0; i < bottomCount; i++) {
        const pct = bottomCount === 1 ? 50 : 20 + (i * 60) / (bottomCount - 1);
        slots.push({ id: id++, side: 'bottom', percent: pct, style: { bottom: '-7px', left: `${pct.toFixed(1)}%`, transform: 'translateX(-50%)' } });
      }
      for (let i = 0; i < leftCount; i++) {
        const pct = leftCount === 1 ? 50 : 25 + (i * 50) / (leftCount - 1);
        slots.push({ id: id++, side: 'left', percent: pct, style: { left: '-7px', top: `${pct.toFixed(1)}%`, transform: 'translateY(-50%)' } });
      }
      for (let i = 0; i < rightCount; i++) {
        const pct = rightCount === 1 ? 50 : 25 + (i * 50) / (rightCount - 1);
        slots.push({ id: id++, side: 'right', percent: pct, style: { right: '-7px', top: `${pct.toFixed(1)}%`, transform: 'translateY(-50%)' } });
      }
      return slots;
    }

    // Cuadrada (Square)
    let id = 0;
    const sides = ['top', 'bottom', 'left', 'right'] as const;
    const sideCounts = { top: 0, bottom: 0, left: 0, right: 0 };
    for (let i = 0; i < total; i++) {
      const s = sides[i % 4];
      sideCounts[s]++;
    }

    for (const s of sides) {
      const count = sideCounts[s];
      for (let i = 0; i < count; i++) {
        const pct = count === 1 ? 50 : 25 + (i * 50) / (count - 1);
        if (s === 'top') {
          slots.push({ id: id++, side: 'top', percent: pct, style: { top: '-7px', left: `${pct.toFixed(1)}%`, transform: 'translateX(-50%)' } });
        } else if (s === 'bottom') {
          slots.push({ id: id++, side: 'bottom', percent: pct, style: { bottom: '-7px', left: `${pct.toFixed(1)}%`, transform: 'translateX(-50%)' } });
        } else if (s === 'left') {
          slots.push({ id: id++, side: 'left', percent: pct, style: { left: '-7px', top: `${pct.toFixed(1)}%`, transform: 'translateY(-50%)' } });
        } else if (s === 'right') {
          slots.push({ id: id++, side: 'right', percent: pct, style: { right: '-7px', top: `${pct.toFixed(1)}%`, transform: 'translateY(-50%)' } });
        }
      }
    }
    return slots;
  }

  // ==========================================
  // CRUD DE PLANOS / MAPAS (SECTORES DEL LOCAL)
  // ==========================================
  setActiveMap(id: string) {
    this.activeMapId.set(id);
  }

  createMap(data: Omit<FloorMap, 'id'>): FloorMap {
    const id = this.slugify(data.name) || 'plano_' + Date.now();
    const newMap: FloorMap = {
      ...data,
      id,
      order: this.maps().length + 1,
      isActive: true
    };
    this.maps.update(list => [...list, newMap]);
    this.activeMapId.set(id);
    this.saveToStorage();
    this.toastService.success(`Plano "${newMap.name}" creado con éxito`, 'Mapa Creado');
    return newMap;
  }

  updateMap(id: string, data: Partial<FloorMap>) {
    this.maps.update(list => list.map(m => m.id === id ? { ...m, ...data } : m));
    this.saveToStorage();
    this.toastService.success('Plano actualizado correctamente');
  }

  deleteMap(id: string) {
    const mapToDelete = this.maps().find(m => m.id === id);
    if (!mapToDelete) return;

    if (this.maps().length <= 1) {
      this.toastService.warning('Debe existir al menos un plano en el local');
      return;
    }

    this.maps.update(list => list.filter(m => m.id !== id));
    this.tables.update(list => list.filter(t => t.mapId !== id));

    const firstRemaining = this.maps()[0];
    if (firstRemaining) {
      this.activeMapId.set(firstRemaining.id);
    }

    this.saveToStorage();
    this.toastService.info(`Plano "${mapToDelete.name}" eliminado`);
  }

  // ==========================================
  // CRUD DE MESAS
  // ==========================================
  createTable(data: Omit<RestaurantTable, 'id'>): RestaurantTable {
    const cleanNumber = this.normalizeTableNumber(data.number);
    const chairsCount = Number(data.chairs || data.capacity || 4);
    const locationName = data.location || this.getSectorDefaultLocation(data.mapId, cleanNumber);
    
    const exists = this.tables().some(t => 
      t.mapId === data.mapId && this.normalizeTableNumber(t.number) === cleanNumber
    );

    if (exists) {
      this.toastService.warning(`La Mesa ${cleanNumber} ya existe en este plano`, 'Número Duplicado');
    }

    const newTable: RestaurantTable = {
      ...data,
      number: cleanNumber,
      id: 'tbl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: data.name || `Mesa ${cleanNumber}`,
      chairs: chairsCount,
      capacity: chairsCount,
      location: locationName,
      status: 'available',
      isActive: true,
      x: data.x !== undefined ? data.x : 20,
      y: data.y !== undefined ? data.y : 20,
      shape: data.shape || 'square'
    };

    this.tables.update(list => [...list, newTable]);
    this.saveToStorage();
    this.toastService.success(`Mesa ${newTable.number} (${newTable.chairs} sillas) agregada al local`);

    // Sincronizar en segundo plano con el backend
    this.syncTableToBackend(newTable);

    return newTable;
  }

  updateTable(id: string, data: Partial<RestaurantTable>) {
    let updatedTable: RestaurantTable | null = null;

    this.tables.update(list => list.map(t => {
      if (t.id === id) {
        const cleanNumber = data.number !== undefined ? this.normalizeTableNumber(data.number) : t.number;
        const chairsCount = data.chairs !== undefined ? Number(data.chairs) : (data.capacity !== undefined ? Number(data.capacity) : t.chairs);
        const loc = data.location !== undefined ? data.location : t.location;

        updatedTable = {
          ...t,
          ...data,
          number: cleanNumber,
          name: data.name || (data.number ? `Mesa ${cleanNumber}` : t.name),
          chairs: chairsCount,
          capacity: chairsCount,
          location: loc
        };
        return updatedTable;
      }
      return t;
    }));

    this.saveToStorage();
    this.toastService.success('Mesa actualizada correctamente');

    if (updatedTable) {
      this.syncTableUpdateToBackend(updatedTable);
    }
  }

  deleteTable(id: string) {
    const table = this.tables().find(t => t.id === id);
    if (!table) return;

    if (table.status === 'occupied' && table.order) {
      this.toastService.error(`No puedes eliminar la Mesa ${table.number} porque tiene un pedido activo (#${table.order.id})`, 'Mesa Ocupada');
      return;
    }

    this.tables.update(list => list.filter(t => t.id !== id));
    this.saveToStorage();
    this.toastService.info(`Mesa ${table.number} eliminada del plano`);

    if (table.backendId) {
      this.http.delete(`${this.apiUrl}/${table.backendId}`).subscribe({
        error: (err) => console.warn('Error al eliminar mesa del backend:', err)
      });
    }
  }

  updateTablePosition(id: string, x: number, y: number) {
    const clampedX = Math.max(2, Math.min(92, Math.round(x)));
    const clampedY = Math.max(2, Math.min(90, Math.round(y)));

    let movedTable: RestaurantTable | null = null;

    this.tables.update(list => list.map(t => {
      if (t.id === id) {
        movedTable = { ...t, x: clampedX, y: clampedY };
        return movedTable;
      }
      return t;
    }));

    this.saveToStorage();

    if (movedTable && (movedTable as RestaurantTable).backendId) {
      this.http.patch(`${this.apiUrl}/${(movedTable as RestaurantTable).backendId}/position`, {
        x: clampedX,
        y: clampedY
      }).subscribe({
        error: (err) => console.warn('Error al actualizar posición en backend:', err)
      });
    }
  }

  getSectorDefaultLocation(mapId: string, tableNumber: string): string {
    const map = this.maps().find(m => m.id === mapId);
    const sectorName = map ? map.name : 'Salón Principal';
    return `${sectorName} - Mesa ${tableNumber}`;
  }

  // ==========================================
  // SINCRONIZACIÓN CON EL BACKEND API
  // ==========================================
  private loadFromBackend() {
    this.http.get<any[]>(this.apiUrl).subscribe({
      next: (beTables) => {
        if (Array.isArray(beTables) && beTables.length > 0) {
          const mapped: RestaurantTable[] = beTables.map(bt => {
            const chairs = Number(bt.chairs || bt.capacity || 4);
            return {
              id: 'be_' + bt.id,
              backendId: bt.id,
              number: String(bt.number),
              name: bt.name || `Mesa ${bt.number}`,
              label: bt.name || `Mesa ${bt.number}`,
              chairs: chairs,
              capacity: chairs,
              location: bt.location || 'Salón Principal',
              mapId: bt.mapId || 'salon-principal',
              shape: (bt.shape as TableShape) || 'square',
              x: bt.x !== undefined ? bt.x : 20,
              y: bt.y !== undefined ? bt.y : 20,
              isActive: bt.isActive ?? true,
              status: 'available'
            };
          });

          // Mezclar con estados de mesas en memoria
          this.tables.update(current => {
            const statusMap = new Map(current.map(c => [this.normalizeTableNumber(c.number), c]));
            return mapped.map(mt => {
              const prev = statusMap.get(this.normalizeTableNumber(mt.number));
              if (prev) {
                return {
                  ...mt,
                  status: prev.status,
                  order: prev.order,
                  currentOrderId: prev.currentOrderId,
                  isOccupied: prev.isOccupied
                };
              }
              return mt;
            });
          });

          this.saveToStorage();
        }
      },
      error: (err) => {
        console.warn('Backend tables endpoint no disponible, usando almacenamiento local:', err);
      }
    });
  }

  private syncTableToBackend(table: RestaurantTable) {
    const payload = {
      number: table.number,
      name: table.name || `Mesa ${table.number}`,
      chairs: table.chairs,
      location: table.location,
      mapId: table.mapId,
      shape: table.shape,
      x: table.x,
      y: table.y,
      isActive: table.isActive
    };

    this.http.post<any>(this.apiUrl, payload).subscribe({
      next: (res) => {
        if (res && res.id) {
          this.tables.update(list => list.map(t => t.id === table.id ? { ...t, backendId: res.id } : t));
          this.saveToStorage();
        }
      },
      error: (err) => console.warn('Error al guardar mesa en backend:', err)
    });
  }

  private syncTableUpdateToBackend(table: RestaurantTable) {
    if (!table.backendId) return;

    const payload = {
      number: table.number,
      name: table.name || `Mesa ${table.number}`,
      chairs: table.chairs,
      location: table.location,
      mapId: table.mapId,
      shape: table.shape,
      x: table.x,
      y: table.y,
      isActive: table.isActive
    };

    this.http.put(`${this.apiUrl}/${table.backendId}`, payload).subscribe({
      error: (err) => console.warn('Error al actualizar mesa en backend:', err)
    });
  }

  // ==========================================
  // PERSISTENCIA LOCAL STORAGE Y DEFAULT SEEDS
  // ==========================================
  private loadFromStorage() {
    if (typeof localStorage === 'undefined') return;

    try {
      const storedMaps = localStorage.getItem(STORAGE_MAPS_KEY);
      const storedTables = localStorage.getItem(STORAGE_TABLES_KEY);

      if (storedMaps && storedTables) {
        const parsedMaps: FloorMap[] = JSON.parse(storedMaps);
        const parsedTables: RestaurantTable[] = JSON.parse(storedTables);
        if (parsedMaps.length > 0 && parsedTables.length > 0) {
          // Normalizar chairs y location en caso de datos antiguos
          const normalized = parsedTables.map(t => ({
            ...t,
            chairs: Number(t.chairs || t.capacity || 4),
            capacity: Number(t.chairs || t.capacity || 4),
            location: t.location || `Salón Principal - Mesa ${t.number}`
          }));

          this.maps.set(parsedMaps);
          this.activeMapId.set(parsedMaps[0].id);
          this.tables.set(normalized);
          return;
        }
      }
    } catch (e) {
      console.warn('Error al cargar mapas de localStorage:', e);
    }

    this.initializeDefaultData();
  }

  saveToStorage() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_MAPS_KEY, JSON.stringify(this.maps()));
      localStorage.setItem(STORAGE_TABLES_KEY, JSON.stringify(this.tables()));
    } catch (e) {
      console.error('Error al guardar en localStorage:', e);
    }
  }

  resetToDefaultLayout() {
    this.initializeDefaultData();
    this.toastService.info('Se ha restaurado el plano y las mesas a la configuración inicial con sillas y ubicación');
  }

  private initializeDefaultData() {
    const defaultMaps: FloorMap[] = [
      {
        id: 'salon-principal',
        name: 'Salón Principal',
        description: 'Zona central de atención al público y mesas familiares',
        order: 1,
        icon: 'table_restaurant',
        color: '#f97316',
        isActive: true
      },
      {
        id: 'terraza',
        name: 'Terraza Exterior',
        description: 'Área libre al aire libre con vista a la avenida',
        order: 2,
        icon: 'deck',
        color: '#10b981',
        isActive: true
      },
      {
        id: 'segundo-piso',
        name: 'Segundo Nivel VIP',
        description: 'Espacio climatizado para eventos y grupos grandes',
        order: 3,
        icon: 'stairs',
        color: '#8b5cf6',
        isActive: true
      }
    ];

    const defaultTables: RestaurantTable[] = [
      // Salón Principal (Mesas 1 a 12 con número de sillas y ubicación física específica)
      { id: 't1', number: '1', name: 'Mesa 1', mapId: 'salon-principal', chairs: 4, capacity: 4, location: 'Salón Principal - Frente a Entrada', shape: 'square', x: 8, y: 12, isActive: true, status: 'available' },
      { id: 't2', number: '2', name: 'Mesa 2', mapId: 'salon-principal', chairs: 4, capacity: 4, location: 'Salón Principal - Zona Centro', shape: 'square', x: 32, y: 12, isActive: true, status: 'available' },
      { id: 't3', number: '3', name: 'Mesa 3', mapId: 'salon-principal', chairs: 6, capacity: 6, location: 'Salón Principal - Zona Familiar', shape: 'rectangle', x: 56, y: 12, isActive: true, status: 'available' },
      { id: 't4', number: '4', name: 'Mesa 4', mapId: 'salon-principal', chairs: 6, capacity: 6, location: 'Salón Principal - Zona Familiar', shape: 'rectangle', x: 80, y: 12, isActive: true, status: 'available' },

      { id: 't5', number: '5', name: 'Mesa 5', mapId: 'salon-principal', chairs: 4, capacity: 4, location: 'Salón Principal - Pasillo Central', shape: 'round', x: 8, y: 44, isActive: true, status: 'available' },
      { id: 't6', number: '6', name: 'Mesa 6', mapId: 'salon-principal', chairs: 4, capacity: 4, location: 'Salón Principal - Pasillo Central', shape: 'round', x: 32, y: 44, isActive: true, status: 'available' },
      { id: 't7', number: '7', name: 'Mesa 7', mapId: 'salon-principal', chairs: 8, capacity: 8, location: 'Salón Principal - Mesa Grupal Grande', shape: 'rectangle', x: 56, y: 44, isActive: true, status: 'available' },
      { id: 't8', number: '8', name: 'Mesa 8', mapId: 'salon-principal', chairs: 4, capacity: 4, location: 'Salón Principal - Pasillo Central', shape: 'round', x: 80, y: 44, isActive: true, status: 'available' },

      { id: 't9', number: '9', name: 'Mesa 9', mapId: 'salon-principal', chairs: 2, capacity: 2, location: 'Salón Principal - Parejas Ventana', shape: 'round', x: 8, y: 76, isActive: true, status: 'available' },
      { id: 't10', number: '10', name: 'Mesa 10', mapId: 'salon-principal', chairs: 2, capacity: 2, location: 'Salón Principal - Parejas Ventana', shape: 'round', x: 32, y: 76, isActive: true, status: 'available' },
      { id: 't11', number: '11', name: 'Mesa 11', mapId: 'salon-principal', chairs: 4, capacity: 4, location: 'Salón Principal - Junto a Barra', shape: 'square', x: 56, y: 76, isActive: true, status: 'available' },
      { id: 't12', number: '12', name: 'Mesa 12', mapId: 'salon-principal', chairs: 4, capacity: 4, location: 'Salón Principal - Junto a Barra', shape: 'square', x: 80, y: 76, isActive: true, status: 'available' },

      // Terraza (Mesas T-1 a T-6)
      { id: 't_t1', number: 'T-1', name: 'Mesa Terraza 1', mapId: 'terraza', chairs: 4, capacity: 4, location: 'Terraza Exterior - Frente a Avenida', shape: 'round', x: 15, y: 20, isActive: true, status: 'available' },
      { id: 't_t2', number: 'T-2', name: 'Mesa Terraza 2', mapId: 'terraza', chairs: 4, capacity: 4, location: 'Terraza Exterior - Frente a Avenida', shape: 'round', x: 45, y: 20, isActive: true, status: 'available' },
      { id: 't_t3', number: 'T-3', name: 'Mesa Terraza 3', mapId: 'terraza', chairs: 6, capacity: 6, location: 'Terraza Exterior - Área Jardín', shape: 'rectangle', x: 75, y: 20, isActive: true, status: 'available' },
      { id: 't_t4', number: 'T-4', name: 'Mesa Terraza 4', mapId: 'terraza', chairs: 4, capacity: 4, location: 'Terraza Exterior - Zona Sombrillas', shape: 'round', x: 15, y: 65, isActive: true, status: 'available' },
      { id: 't_t5', number: 'T-5', name: 'Mesa Terraza 5', mapId: 'terraza', chairs: 4, capacity: 4, location: 'Terraza Exterior - Zona Sombrillas', shape: 'round', x: 45, y: 65, isActive: true, status: 'available' },
      { id: 't_t6', number: 'T-6', name: 'Mesa Terraza 6', mapId: 'terraza', chairs: 6, capacity: 6, location: 'Terraza Exterior - Área Jardín', shape: 'rectangle', x: 75, y: 65, isActive: true, status: 'available' },

      // Segundo Nivel VIP (VIP-1 a VIP-4)
      { id: 't_vip1', number: 'VIP-1', name: 'Mesa Presidencial', mapId: 'segundo-piso', chairs: 10, capacity: 10, location: 'Segundo Piso - Salón Presidencial', shape: 'rectangle', x: 25, y: 30, isActive: true, status: 'available' },
      { id: 't_vip2', number: 'VIP-2', name: 'Mesa Corporativa', mapId: 'segundo-piso', chairs: 8, capacity: 8, location: 'Segundo Piso - Sala de Eventos', shape: 'rectangle', x: 70, y: 30, isActive: true, status: 'available' },
      { id: 't_vip3', number: 'VIP-3', name: 'Salón Balcón A', mapId: 'segundo-piso', chairs: 4, capacity: 4, location: 'Segundo Piso - Balcón Panorámico A', shape: 'round', x: 25, y: 70, isActive: true, status: 'available' },
      { id: 't_vip4', number: 'VIP-4', name: 'Salón Balcón B', mapId: 'segundo-piso', chairs: 4, capacity: 4, location: 'Segundo Piso - Balcón Panorámico B', shape: 'round', x: 70, y: 70, isActive: true, status: 'available' },
    ];

    this.maps.set(defaultMaps);
    this.activeMapId.set('salon-principal');
    this.tables.set(defaultTables);
    this.saveToStorage();
  }

  private slugify(text: string): string {
    return text.toString().toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]+/g, '')
      .replace(/\-\-+/g, '-');
  }
}
