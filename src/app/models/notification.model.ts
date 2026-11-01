export type NotificationCategory = 'order' | 'table' | 'report' | 'system' | 'payment';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface SystemNotification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  type?: string;
  timestamp: Date;
  read: boolean;
  orderId?: number | string;
  tableNumber?: string;
  amount?: number;
  routeLink?: string;
  actionText?: string;
  icon?: string;
  color?: string;
  priority?: NotificationPriority;
  data?: any;
}
