import { inject, Injectable, NgZone, effect } from '@angular/core';
import { Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class InactivityService {
  private readonly ngZone = inject(NgZone);
  private readonly router = inject(Router);
  private readonly toastr = inject(ToastrService);
  private readonly authService = inject(AuthService);

  private readonly INACTIVITY_LIMIT_MS = 10 * 60 * 1000; // 10 minutos (600,000 ms)
  private readonly CHECK_INTERVAL_MS = 10 * 1000; // Revisar cada 10 segundos
  private readonly THROTTLE_EVENT_MS = 2000; // Throttle de eventos para no sobrecargar el storage
  private readonly STORAGE_KEY = 'polleria_last_activity';

  private checkIntervalId: any = null;
  private lastRecordedActivity = Date.now();
  private isTracking = false;

  private readonly eventListeners: Array<{ target: EventTarget; type: string; listener: EventListener }> = [];

  constructor() {
    effect(() => {
      const user = this.authService.currentUser();
      if (user) {
        this.startTracking();
      } else {
        this.stopTracking();
      }
    });
  }

  private startTracking(): void {
    if (this.isTracking || typeof window === 'undefined') return;
    this.isTracking = true;
    this.recordActivity();

    // Ejecutar listeners fuera de Angular Zone para evitar disparar ciclos de ChangeDetection innecesarios
    this.ngZone.runOutsideAngular(() => {
      const throttledHandler = this.throttle(() => this.recordActivity(), this.THROTTLE_EVENT_MS);

      const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
      events.forEach(eventType => {
        window.addEventListener(eventType, throttledHandler, { passive: true });
        this.eventListeners.push({ target: window, type: eventType, listener: throttledHandler });
      });

      const onVisibilityOrFocus = () => {
        if (!document.hidden) {
          this.checkInactivity();
        }
      };

      document.addEventListener('visibilitychange', onVisibilityOrFocus);
      this.eventListeners.push({ target: document, type: 'visibilitychange', listener: onVisibilityOrFocus });

      window.addEventListener('focus', onVisibilityOrFocus);
      this.eventListeners.push({ target: window, type: 'focus', listener: onVisibilityOrFocus });

      // Verificación periódica
      this.checkIntervalId = setInterval(() => {
        this.checkInactivity();
      }, this.CHECK_INTERVAL_MS);
    });
  }

  private stopTracking(): void {
    if (!this.isTracking) return;
    this.isTracking = false;

    if (this.checkIntervalId) {
      clearInterval(this.checkIntervalId);
      this.checkIntervalId = null;
    }

    this.eventListeners.forEach(({ target, type, listener }) => {
      target.removeEventListener(type, listener);
    });
    this.eventListeners.length = 0;

    localStorage.removeItem(this.STORAGE_KEY);
  }

  private recordActivity(): void {
    const now = Date.now();
    this.lastRecordedActivity = now;
    try {
      localStorage.setItem(this.STORAGE_KEY, String(now));
    } catch {
      // Ignorar restricciones de storage si las hubiera
    }
  }

  private getLastActivity(): number {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!isNaN(parsed) && parsed > 0) {
          return Math.max(this.lastRecordedActivity, parsed);
        }
      }
    } catch {
      // Fallback a memoria
    }
    return this.lastRecordedActivity;
  }

  private checkInactivity(): void {
    if (!this.isTracking || !this.authService.isAuthenticated()) return;

    const now = Date.now();
    const lastActivity = this.getLastActivity();
    const elapsed = now - lastActivity;

    if (elapsed >= this.INACTIVITY_LIMIT_MS) {
      // Inactividad de 10 minutos cumplida -> Cerrar sesión dentro de Angular Zone
      this.ngZone.run(() => {
        this.handleInactivityLogout();
      });
    }
  }

  private handleInactivityLogout(): void {
    const wasInternalUser = this.authService.canAccessAdminDashboard() || this.authService.canAccessPos();

    this.stopTracking();
    this.authService.logout();

    this.toastr.warning(
      'Tu sesión ha expirado por inactividad (10 minutos sin actividad).',
      'SESIÓN CERRADA',
      { timeOut: 6000 }
    );

    if (wasInternalUser) {
      this.router.navigate(['/admin/login']);
    } else {
      this.router.navigate(['/']);
    }
  }

  private throttle(fn: () => void, limitMs: number): EventListener {
    let lastRan = 0;
    return () => {
      const now = Date.now();
      if (now - lastRan >= limitMs) {
        lastRan = now;
        fn();
      }
    };
  }
}
