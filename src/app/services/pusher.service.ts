import { Injectable } from '@angular/core';
import Pusher from 'pusher-js';
import { enviroment } from '../../enviroments/enviroments.development';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class PusherService {
  private pusher: Pusher;
  private channel: any;
  private ordersChannel: any;
  
  // Observable para notificaciones de pedidos
  private orderNotificationSource = new Subject<any>();
  orderNotifications$ = this.orderNotificationSource.asObservable();

  constructor() {
    Pusher.logToConsole = true;

    this.pusher = new Pusher(enviroment.pusher.key, {
      cluster: enviroment.pusher.cluster,
      forceTLS: true,
      enabledTransports: ['ws', 'wss']
    });

    this.pusher.connection.bind('state_change', (states: any) => {
      console.log('Pusher Connection State changed:', states);
    });

    this.pusher.connection.bind('error', (err: any) => {
      console.error('Pusher Connection Error:', err);
    });

    // Suscribirse al canal de administración
    this.channel = this.pusher.subscribe('admin-channel');
    this.channel.bind('new-order', (data: any) => {
      this.orderNotificationSource.next(data);
    });

    // Suscribirse al canal 'orders' del backend
    this.ordersChannel = this.pusher.subscribe('orders');
    this.ordersChannel.bind('new-order', (data: any) => {
      this.orderNotificationSource.next({ event: 'new-order', ...data });
    });
    this.ordersChannel.bind('status-updated', (data: any) => {
      this.orderNotificationSource.next({ event: 'status-updated', ...data });
    });
    this.ordersChannel.bind('payment-updated', (data: any) => {
      this.orderNotificationSource.next({ event: 'payment-updated', ...data });
    });
    this.ordersChannel.bind('order-accepted', (data: any) => {
      this.orderNotificationSource.next({ event: 'order-accepted', ...data });
    });
  }

  subscribeToChannel(channelName: string, eventName: string, callback: (data: any) => void) {
    const channel = this.pusher.subscribe(channelName);
    channel.bind(eventName, callback);
    return channel;
  }

  unsubscribe(channelName: string) {
    this.pusher.unsubscribe(channelName);
  }
}
