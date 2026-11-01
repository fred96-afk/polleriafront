import { Injectable } from '@angular/core';
import Pusher, { Channel } from 'pusher-js';
import { Observable, Subject } from 'rxjs';
import { enviroment } from '../../enviroments/enviroments.development';

@Injectable({
  providedIn: 'root'
})
export class PusherService {
  private pusher: Pusher;
  private subscribedChannels = new Map<string, Channel>();

  // Observable retrocompatible para notificaciones de órdenes
  private orderNotificationSource = new Subject<any>();
  orderNotifications$ = this.orderNotificationSource.asObservable();

  constructor() {
    Pusher.logToConsole = false;

    // Inicialización de la instancia singleton de Pusher con las credenciales requeridas
    this.pusher = new Pusher(enviroment.pusher.key || 'a442712ed0da505c97d1', {
      cluster: enviroment.pusher.cluster || 'us2',
      forceTLS: true
    });

    this.pusher.connection.bind('state_change', (states: any) => {
      console.log('Pusher State Change:', states);
    });

    this.pusher.connection.bind('error', (err: any) => {
      console.error('Pusher Connection Error:', err);
    });

    // Suscripciones globales automáticas para mantener compatibilidad
    const ordersChannel = this.subscribeToChannel('orders');
    ordersChannel.bind('new-order', (data: any) => {
      this.orderNotificationSource.next({ event: 'new-order', ...data });
    });
    ordersChannel.bind('status-updated', (data: any) => {
      this.orderNotificationSource.next({ event: 'status-updated', ...data });
    });
    ordersChannel.bind('payment-updated', (data: any) => {
      this.orderNotificationSource.next({ event: 'payment-updated', ...data });
    });
    ordersChannel.bind('order-accepted', (data: any) => {
      this.orderNotificationSource.next({ event: 'order-accepted', ...data });
    });
  }

  /**
   * Suscribe a un canal de Pusher retornando la instancia de Channel.
   * Si el canal ya fue suscrito, retorna la instancia existente para evitar suscripciones duplicadas.
   * Soporta llamada unaria subscribeToChannel(channelName) y ternaria subscribeToChannel(channelName, event, callback).
   */
  subscribeToChannel(channelName: string, eventName?: string, callback?: (data: any) => void): Channel {
    let channel = this.subscribedChannels.get(channelName);
    if (!channel) {
      channel = this.pusher.subscribe(channelName);
      this.subscribedChannels.set(channelName, channel);
    }
    if (eventName && callback) {
      channel.bind(eventName, callback);
    }
    return channel;
  }

  /**
   * Retorna un Observable RxJS tipado para un evento específico en un canal.
   * Al suscribirse se enlaza el callback con bind, y al desuscribirse del Observable
   * se desenlaza con unbind automáticamente para evitar fugas de memoria.
   */
  listenToEvent<T>(channelName: string, eventName: string): Observable<T> {
    return new Observable<T>(observer => {
      const channel = this.subscribeToChannel(channelName);

      const callback = (data: T) => {
        observer.next(data);
      };

      channel.bind(eventName, callback);

      return () => {
        channel.unbind(eventName, callback);
      };
    });
  }

  /**
   * Desuscribe de un canal de Pusher especificado.
   */
  unsubscribe(channelName: string): void {
    if (this.subscribedChannels.has(channelName)) {
      this.pusher.unsubscribe(channelName);
      this.subscribedChannels.delete(channelName);
    }
  }

  /**
   * Retorna la instancia nativa de Pusher.
   */
  getPusherInstance(): Pusher {
    return this.pusher;
  }

  /**
   * Emite un evento en el observable interno de pedidos (utilizado para pruebas locales o sincronización)
   */
  emitOrderEvent(data: any): void {
    this.orderNotificationSource.next(data);
  }

  /**
   * Reproduce un sonido de alerta suave para notificar al personal de cocina o caja
   * mediante Web Audio API sintetizado, sin depender de archivos de audio externos.
   */
  playSoftNotificationSound(): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      // Campana suave armónica de 2 tonos
      const now = ctx.currentTime;
      this.createSoftTone(ctx, 587.33, now, 0.4);       // Nota D5
      this.createSoftTone(ctx, 880.00, now + 0.12, 0.5); // Nota A5
    } catch (e) {
      console.warn('No se pudo reproducir el sonido suave:', e);
    }
  }

  private createSoftTone(ctx: AudioContext, frequency: number, startTime: number, duration: number) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, startTime);

    // Envolvente suave (ataque rápido no chasquido, decaimiento exponencial cálido)
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.2, startTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  }
}
