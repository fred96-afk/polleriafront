import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { InactivityService } from './services/inactivity.service';
import { ChatComponent } from './chat/chat.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ChatComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private readonly inactivityService = inject(InactivityService);
  private readonly router = inject(Router);
  private routerSub?: Subscription;

  protected readonly title = signal('PolleriaFront');
  protected readonly isChatVisible = signal(true);

  ngOnInit(): void {
    // Comprobar ruta inicial
    this.updateRouteState(this.router.url || window.location.pathname);

    // Escuchar cambios de navegación
    this.routerSub = this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd)
    ).subscribe((event) => {
      this.updateRouteState(event.urlAfterRedirects || event.url);
    });
  }

  private updateRouteState(url: string): void {
    const pathname = url.split(/[?#]/, 1)[0];
    const isDeliveryRoute = pathname === '/admin/delivery';
    this.isChatVisible.set(!pathname.startsWith('/admin') || isDeliveryRoute);
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }
}
