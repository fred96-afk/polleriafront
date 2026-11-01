import { OrderResponse } from './order.model';

export type TableShape = 'round' | 'square' | 'rectangle';
export type TableStatus = 'available' | 'occupied' | 'billing' | 'calling' | 'reserved';

export interface FloorMap {
  id: string;
  name: string;
  description?: string;
  order: number;
  width?: number; // ancho base del canvas porcentual o pixel
  height?: number; // alto base del canvas
  icon?: string;
  color?: string;
  isActive?: boolean;
}

export interface ChairSlot {
  id: number;
  side: 'top' | 'bottom' | 'left' | 'right' | 'radial';
  percent: number; // Porcentaje a lo largo del lado o ángulo para circular
  angle?: number;
  style: { [key: string]: string };
}

export interface RestaurantTable {
  id: string;
  backendId?: number;
  number: string; // Ej: '1', '2', 'T-1', 'VIP-2'
  name?: string; // Ej: 'Mesa Familiar Ventana'
  label?: string; // Alias para compatibilidad de vistas
  isOccupied?: boolean; // Alias para compatibilidad de vistas
  
  /**
   * Número de sillas en la mesa
   */
  chairs: number;
  
  /**
   * Capacidad de personas (alias retrocompatible de chairs)
   */
  capacity: number;

  /**
   * Ubicación física dentro del local (ej. "Salón Principal - Frente a Entrada", "Terraza - Vista a Avenida")
   */
  location: string;

  /**
   * ID del plano o sector al que pertenece (ej: 'salon-principal', 'terraza', 'segundo-piso')
   */
  mapId: string;

  /**
   * Forma geométrica de la mesa ('round' | 'square' | 'rectangle')
   */
  shape: TableShape;

  /**
   * Posición horizontal porcentual (0 a 100%) dentro del mapa
   */
  x: number;

  /**
   * Posición vertical porcentual (0 a 100%) dentro del mapa
   */
  y: number;

  width?: number; // Ancho visual
  height?: number; // Alto visual
  rotation?: number; // Rotación en grados
  isActive: boolean;
  status?: TableStatus; // 'available' | 'occupied' | 'billing' | 'calling' | 'reserved'
  currentOrderId?: number;
  order?: OrderResponse | null;
  lastCallTime?: string;
  notes?: string;
}

export interface TableNotification {
  id: string;
  tableNumber: string;
  tableName?: string;
  type: 'new_order' | 'call_waiter' | 'request_bill' | 'status_change' | 'payment_completed' | 'custom';
  title: string;
  message: string;
  timestamp: Date;
  orderId?: number;
  amount?: number;
  read: boolean;
}
