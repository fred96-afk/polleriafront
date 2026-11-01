import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Input,
  computed,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../services/notification.service';
import { SystemNotification } from '../../models/notification.model';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative inline-block text-left" #container>
      <!-- ========================================== -->
      <!-- BOTÓN PRINCIPAL / ÍCONO DE NOTIFICACIÓN    -->
      <!-- ========================================== -->
      @if (showSummaryButton) {
        <!-- Modo Botón Resumen (para cabecera del Panel de Administración) -->
        <button
          type="button"
          (click)="toggleDropdown($event)"
          class="relative flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-xs border"
          [ngClass]="notificationService.hasUnread() 
            ? 'bg-amber-50 text-amber-950 border-amber-300 hover:bg-amber-100 ring-2 ring-amber-400/20' 
            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:text-gray-900'"
          title="Ver Lista de Notificaciones del Sistema"
        >
          <span class="material-icons-outlined text-xl" [ngClass]="notificationService.hasUnread() ? 'text-amber-600 animate-bounce' : 'text-gray-500'">
            {{ notificationService.hasUnread() ? 'notifications_active' : 'notifications' }}
          </span>
          <span class="hidden sm:inline">Lista de Notificaciones</span>
          @if (notificationService.unreadCount() > 0) {
            <span class="flex items-center justify-center bg-red-600 text-white font-black text-xs px-2 py-0.5 rounded-full shadow-xs animate-pulse">
              {{ notificationService.unreadCount() > 99 ? '99+' : notificationService.unreadCount() }}
            </span>
          } @else {
            <span class="text-xs text-gray-400 font-medium hidden sm:inline">
              ({{ notificationService.notifications().length }})
            </span>
          }
        </button>
      } @else {
        <!-- Modo Ícono Estándar (para Barra Superior / Móvil) -->
        <button
          type="button"
          (click)="toggleDropdown($event)"
          [class]="isMobile 
            ? 'relative p-2 rounded-lg text-white hover:bg-orange-600 transition-colors focus:outline-none'
            : 'relative p-2.5 rounded-xl text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all border border-transparent hover:border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20'"
          [attr.aria-label]="'Notificaciones (' + notificationService.unreadCount() + ' sin leer)'"
          title="Ver Lista de Notificaciones"
        >
          <span class="material-icons-outlined text-2xl leading-none">
            {{ notificationService.hasUnread() ? 'notifications_active' : 'notifications' }}
          </span>

          <!-- Badge de Notificaciones no leídas -->
          @if (notificationService.unreadCount() > 0) {
            <span
              class="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-black text-white shadow-md ring-2 ring-white animate-pulse"
            >
              {{ notificationService.unreadCount() > 99 ? '99+' : notificationService.unreadCount() }}
            </span>
          }
        </button>
      }

      <!-- ========================================== -->
      <!-- DROPDOWN / LISTA DESPLEGABLE               -->
      <!-- ========================================== -->
      @if (isOpen()) {
        <!-- Fondo oscuro semitransparente en móviles -->
        <div 
          class="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 sm:hidden"
          (click)="closeDropdown()"
        ></div>

        <div
          class="fixed sm:absolute right-2 sm:right-0 top-16 sm:top-full mt-2 w-[calc(100vw-1rem)] sm:w-96 md:w-[460px] max-w-[460px] bg-white rounded-2xl shadow-2xl border border-gray-200 z-50 overflow-hidden flex flex-col transition-all transform animate-in fade-in zoom-in-95 duration-150"
          style="max-height: calc(100vh - 5rem);"
        >
          <!-- CABECERA DE LA LISTA -->
          <div class="p-4 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white flex items-center justify-between shadow-md">
            <div class="flex items-center gap-2.5">
              <div class="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white shadow-inner">
                <span class="material-icons-outlined text-lg">format_list_bulleted</span>
              </div>
              <div>
                <h3 class="font-black text-sm tracking-tight flex items-center gap-2">
                  Lista de Notificaciones
                  @if (notificationService.unreadCount() > 0) {
                    <span class="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                      {{ notificationService.unreadCount() }} nuevas
                    </span>
                  }
                </h3>
                <p class="text-[11px] text-gray-300">
                  {{ notificationService.filteredNotifications().length }} elemento(s) en la lista
                </p>
              </div>
            </div>

            <!-- Botones Rápidos de Cabecera -->
            <div class="flex items-center gap-1">
              <!-- Botón Abrir Modal de Lista Completa -->
              <button
                type="button"
                (click)="openFullModal()"
                title="Abrir Lista Completa en Pantalla Grande"
                class="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
              >
                <span class="material-icons-outlined text-lg">open_in_full</span>
              </button>

              <!-- Mute/Unmute Sonido -->
              <button
                type="button"
                (click)="notificationService.toggleSound()"
                [title]="notificationService.soundEnabled() ? 'Silenciar sonido' : 'Activar sonido'"
                class="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
              >
                <span class="material-icons-outlined text-lg">
                  {{ notificationService.soundEnabled() ? 'volume_up' : 'volume_off' }}
                </span>
              </button>

              <!-- Marcar todas leídas -->
              @if (notificationService.unreadCount() > 0) {
                <button
                  type="button"
                  (click)="notificationService.markAllAsRead()"
                  title="Marcar todas como leídas"
                  class="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
                >
                  <span class="material-icons-outlined text-lg">done_all</span>
                </button>
              }

              <!-- Limpiar todo -->
              @if (notificationService.notifications().length > 0) {
                <button
                  type="button"
                  (click)="notificationService.clearAll()"
                  title="Limpiar todas las notificaciones"
                  class="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-red-400 transition-colors"
                >
                  <span class="material-icons-outlined text-lg">delete_sweep</span>
                </button>
              }

              <!-- Cerrar Dropdown -->
              <button
                type="button"
                (click)="closeDropdown()"
                title="Cerrar lista"
                class="p-1.5 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors ml-1"
              >
                <span class="material-icons-outlined text-lg">close</span>
              </button>
            </div>
          </div>

          <!-- PUSH PERMISSION PROMPT BANNER -->
          @if (notificationService.pushPermission() !== 'granted') {
            <div class="px-4 py-2 bg-amber-50 border-b border-amber-200 flex items-center justify-between text-xs text-amber-900">
              <div class="flex items-center gap-2">
                <span class="material-icons-outlined text-amber-600 text-sm">notification_important</span>
                <span>Activa notificaciones del navegador para recibir alertas al instante.</span>
              </div>
              <button
                type="button"
                (click)="notificationService.requestPushPermission()"
                class="font-black text-amber-800 underline hover:text-amber-950 shrink-0 ml-2"
              >
                Activar
              </button>
            </div>
          }

          <!-- FILTROS POR CATEGORÍA DE LISTA -->
          <div class="flex items-center gap-1 p-2 bg-gray-50 border-b border-gray-100 overflow-x-auto text-xs">
            <button
              type="button"
              (click)="notificationService.setFilter('all')"
              class="px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap"
              [ngClass]="notificationService.selectedCategory() === 'all' 
                ? 'bg-white text-gray-900 shadow-xs border border-gray-200' 
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'"
            >
              Todas ({{ notificationService.notifications().length }})
            </button>

            <button
              type="button"
              (click)="notificationService.setFilter('unread')"
              class="px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap"
              [ngClass]="notificationService.selectedCategory() === 'unread' 
                ? 'bg-white text-red-700 shadow-xs border border-red-200' 
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'"
            >
              No leídas ({{ notificationService.unreadCount() }})
            </button>

            <button
              type="button"
              (click)="notificationService.setFilter('order')"
              class="px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap"
              [ngClass]="notificationService.selectedCategory() === 'order' 
                ? 'bg-white text-emerald-700 shadow-xs border border-emerald-200' 
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'"
            >
              Pedidos
            </button>

            <button
              type="button"
              (click)="notificationService.setFilter('table')"
              class="px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap"
              [ngClass]="notificationService.selectedCategory() === 'table' 
                ? 'bg-white text-purple-700 shadow-xs border border-purple-200' 
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'"
            >
              Mesas
            </button>

            <button
              type="button"
              (click)="notificationService.setFilter('report')"
              class="px-2.5 py-1 rounded-lg font-bold transition-all whitespace-nowrap"
              [ngClass]="notificationService.selectedCategory() === 'report' 
                ? 'bg-white text-teal-700 shadow-xs border border-teal-200' 
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'"
            >
              Reportes
            </button>
          </div>

          <!-- ========================================== -->
          <!-- LISTA ESTRUCTURADA DE NOTIFICACIONES       -->
          <!-- ========================================== -->
          <ul role="list" class="overflow-y-auto divide-y divide-gray-100 max-h-[380px] bg-white m-0 p-0 list-none">
            @for (item of notificationService.filteredNotifications(); track item.id; let idx = $index) {
              <li
                (click)="onNotificationClick(item)"
                class="p-3.5 flex items-start gap-3 hover:bg-orange-50/50 transition-all cursor-pointer group relative border-l-4"
                [ngClass]="item.read ? 'border-transparent bg-white' : 'border-orange-500 bg-amber-50/30'"
              >
                <!-- Indicador de No Leído (punto azul brillante) -->
                @if (!item.read) {
                  <span class="absolute top-4 left-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white animate-pulse"></span>
                }

                <!-- Número de Lista / Índice -->
                <div class="flex flex-col items-center shrink-0">
                  <span class="text-[10px] font-black text-gray-400 mb-1">#{{ idx + 1 }}</span>
                  <div
                    class="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs"
                    [ngClass]="item.color || 'bg-gray-700'"
                  >
                    <span class="material-icons-outlined text-lg leading-none">
                      {{ item.icon || 'notifications' }}
                    </span>
                  </div>
                </div>

                <!-- Detalle de la Notificación en Lista -->
                <div class="flex-1 min-w-0 pr-6">
                  <!-- Fila 1: Categoría badge + Título + Tiempo relativo -->
                  <div class="flex items-center justify-between gap-2 mb-1">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <!-- Badge Categoría -->
                      <span 
                        class="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md"
                        [ngClass]="getCategoryBadgeClass(item.category)"
                      >
                        {{ getCategoryLabel(item.category) }}
                      </span>
                      <h4
                        class="text-xs truncate"
                        [ngClass]="!item.read ? 'text-gray-900 font-black' : 'text-gray-700 font-bold'"
                      >
                        {{ item.title }}
                      </h4>
                    </div>

                    <span class="text-[10px] text-gray-400 shrink-0 font-medium whitespace-nowrap">
                      {{ formatTimeAgo(item.timestamp) }}
                    </span>
                  </div>

                  <!-- Fila 2: Mensaje / Descripción -->
                  <p class="text-xs text-gray-600 leading-relaxed line-clamp-2">
                    {{ item.message }}
                  </p>

                  <!-- Fila 3: Chips de información y Acción rápida -->
                  <div class="mt-2 flex items-center flex-wrap gap-2 text-[10px]">
                    @if (item.tableNumber) {
                      <span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-200">
                        <span class="material-icons-outlined text-xs">table_restaurant</span>
                        Mesa {{ item.tableNumber }}
                      </span>
                    }

                    @if (item.amount) {
                      <span class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                        <span class="material-icons-outlined text-xs">payments</span>
                        S/ {{ item.amount.toFixed(2) }}
                      </span>
                    }

                    @if (item.actionText || item.routeLink) {
                      <span class="inline-flex items-center gap-1 font-bold text-orange-600 group-hover:text-orange-700 group-hover:underline ml-auto">
                        <span>{{ item.actionText || 'Ver en el sistema' }}</span>
                        <span class="material-icons-outlined text-xs">arrow_forward</span>
                      </span>
                    }
                  </div>
                </div>

                <!-- Botón eliminar notificación individual -->
                <button
                  type="button"
                  (click)="deleteNotification($event, item.id)"
                  title="Eliminar de la lista"
                  class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all absolute top-3 right-3"
                >
                  <span class="material-icons-outlined text-sm">close</span>
                </button>
              </li>
            } @empty {
              <!-- Estado vacío de la lista -->
              <li class="py-12 px-6 text-center text-gray-400 flex flex-col items-center justify-center list-none">
                <div class="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400 mb-3">
                  <span class="material-icons-outlined text-3xl">format_list_bulleted</span>
                </div>
                <p class="text-sm font-bold text-gray-700 mb-1">Lista de notificaciones vacía</p>
                <p class="text-xs text-gray-500 max-w-xs leading-relaxed">
                  @if (notificationService.selectedCategory() === 'unread') {
                    ¡Genial! Todas las notificaciones de la lista están leídas.
                  } @else {
                    Las alertas del sistema, pedidos y llamadas de mozo aparecerán listadas aquí en tiempo real.
                  }
                </p>
              </li>
            }
          </ul>

          <!-- FOOTER: BOTÓN DE LISTA COMPLETA Y SIMULADOR -->
          <div class="p-3 bg-gray-50 border-t border-gray-100 flex flex-col gap-2">
            <!-- Botón principal para abrir el Modal de Lista Completa -->
            <button
              type="button"
              (click)="openFullModal()"
              class="w-full py-2 px-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
            >
              <span class="material-icons-outlined text-sm">view_list</span>
              <span>Ver Lista Completa de Notificaciones</span>
            </button>

            <!-- Simulador de pruebas -->
            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center gap-1.5">
                <span class="text-[10px] font-black text-gray-400 uppercase tracking-wider">Simular:</span>
                <button
                  type="button"
                  (click)="notificationService.simulateTestNotification('order')"
                  title="Simular nuevo pedido en la lista"
                  class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 transition-colors"
                >
                  + Pedido
                </button>
                <button
                  type="button"
                  (click)="notificationService.simulateTestNotification('call_waiter')"
                  title="Simular llamada de mozo"
                  class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 hover:bg-purple-200 transition-colors"
                >
                  + Mozo
                </button>
                <button
                  type="button"
                  (click)="notificationService.simulateTestNotification('request_bill')"
                  title="Simular cuenta de mesa"
                  class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors"
                >
                  + Cuenta
                </button>
              </div>

              <button
                type="button"
                (click)="closeDropdown()"
                class="px-2.5 py-1 rounded-lg text-xs font-bold text-gray-500 hover:bg-gray-200 transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      }

      <!-- ==================================================== -->
      <!-- MODAL DE LISTA COMPLETA DE NOTIFICACIONES DEL SISTEMA -->
      <!-- ==================================================== -->
      @if (notificationService.isModalOpen()) {
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div class="bg-white rounded-3xl shadow-2xl max-w-4xl w-full border border-gray-100 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            
            <!-- CABECERA DEL MODAL -->
            <div class="p-6 bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 text-white flex justify-between items-center">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md">
                  <span class="material-icons-outlined text-2xl">format_list_bulleted</span>
                </div>
                <div>
                  <h3 class="font-black text-lg uppercase tracking-tight flex items-center gap-2">
                    Lista Completa de Notificaciones del Sistema
                  </h3>
                  <p class="text-xs text-gray-300">
                    Historial de eventos, comandas, solicitudes de mozo y reportes generados
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                @if (notificationService.unreadCount() > 0) {
                  <span class="bg-red-500 text-white text-xs px-2.5 py-1 rounded-full font-bold">
                    {{ notificationService.unreadCount() }} no leídas
                  </span>
                }
                <button 
                  type="button"
                  (click)="notificationService.closeModal()" 
                  class="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                  title="Cerrar modal"
                >
                  <span class="material-icons-outlined text-2xl">close</span>
                </button>
              </div>
            </div>

            <!-- BARRA DE HERRAMIENTAS: BÚSQUEDA Y FILTROS -->
            <div class="p-4 bg-gray-50 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <!-- Campo de Búsqueda -->
              <div class="relative flex-1 max-w-md">
                <span class="material-icons-outlined absolute left-3 top-2.5 text-gray-400 text-lg">search</span>
                <input
                  type="text"
                  [ngModel]="notificationService.searchQuery()"
                  (ngModelChange)="notificationService.setSearchQuery($event)"
                  placeholder="Buscar en la lista por cliente, mesa, # orden o detalle..."
                  class="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                @if (notificationService.searchQuery()) {
                  <button
                    type="button"
                    (click)="notificationService.setSearchQuery('')"
                    class="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600"
                  >
                    <span class="material-icons-outlined text-sm">clear</span>
                  </button>
                }
              </div>

              <!-- Acciones masivas -->
              <div class="flex items-center gap-2">
                @if (notificationService.unreadCount() > 0) {
                  <button
                    type="button"
                    (click)="notificationService.markAllAsRead()"
                    class="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <span class="material-icons-outlined text-sm text-emerald-600">done_all</span>
                    <span>Marcar todas leídas</span>
                  </button>
                }

                @if (notificationService.notifications().length > 0) {
                  <button
                    type="button"
                    (click)="notificationService.clearAll()"
                    class="px-3 py-2 rounded-xl text-xs font-bold bg-white border border-gray-200 text-red-600 hover:bg-red-50 flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <span class="material-icons-outlined text-sm">delete_sweep</span>
                    <span>Limpiar lista</span>
                  </button>
                }
              </div>
            </div>

            <!-- FILTROS POR CATEGORÍA -->
            <div class="px-6 py-2.5 bg-white border-b border-gray-100 flex items-center gap-2 overflow-x-auto text-xs">
              <span class="text-gray-400 font-black uppercase text-[10px] tracking-wider shrink-0">Filtrar:</span>
              <button
                type="button"
                (click)="notificationService.setFilter('all')"
                class="px-3 py-1 rounded-lg font-bold transition-all whitespace-nowrap"
                [ngClass]="notificationService.selectedCategory() === 'all' 
                  ? 'bg-gray-900 text-white shadow-xs' 
                  : 'text-gray-500 hover:bg-gray-100'"
              >
                Todas ({{ notificationService.notifications().length }})
              </button>

              <button
                type="button"
                (click)="notificationService.setFilter('unread')"
                class="px-3 py-1 rounded-lg font-bold transition-all whitespace-nowrap"
                [ngClass]="notificationService.selectedCategory() === 'unread' 
                  ? 'bg-red-600 text-white shadow-xs' 
                  : 'text-gray-500 hover:bg-gray-100'"
              >
                No leídas ({{ notificationService.unreadCount() }})
              </button>

              <button
                type="button"
                (click)="notificationService.setFilter('order')"
                class="px-3 py-1 rounded-lg font-bold transition-all whitespace-nowrap"
                [ngClass]="notificationService.selectedCategory() === 'order' 
                  ? 'bg-emerald-600 text-white shadow-xs' 
                  : 'text-gray-500 hover:bg-gray-100'"
              >
                Pedidos
              </button>

              <button
                type="button"
                (click)="notificationService.setFilter('table')"
                class="px-3 py-1 rounded-lg font-bold transition-all whitespace-nowrap"
                [ngClass]="notificationService.selectedCategory() === 'table' 
                  ? 'bg-purple-600 text-white shadow-xs' 
                  : 'text-gray-500 hover:bg-gray-100'"
              >
                Mesas
              </button>

              <button
                type="button"
                (click)="notificationService.setFilter('report')"
                class="px-3 py-1 rounded-lg font-bold transition-all whitespace-nowrap"
                [ngClass]="notificationService.selectedCategory() === 'report' 
                  ? 'bg-teal-600 text-white shadow-xs' 
                  : 'text-gray-500 hover:bg-gray-100'"
              >
                Reportes
              </button>
            </div>

            <!-- CUERPO DE LA LISTA MODAL -->
            <div class="flex-1 overflow-y-auto p-6 bg-gray-50/50">
              <ul role="list" class="space-y-3 m-0 p-0 list-none">
                @for (item of notificationService.modalFilteredNotifications(); track item.id; let idx = $index) {
                  <li 
                    class="bg-white rounded-2xl p-4 sm:p-5 border shadow-xs transition-all hover:shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                    [ngClass]="item.read ? 'border-gray-200' : 'border-orange-400 bg-orange-50/20 ring-1 ring-orange-200'"
                  >
                    <!-- Columna Izquierda: Número + Ícono + Título + Mensaje -->
                    <div class="flex items-start gap-4 flex-1 min-w-0">
                      <!-- Número de lista -->
                      <div class="flex flex-col items-center justify-center shrink-0 w-8">
                        <span class="text-xs font-black text-gray-400">#{{ idx + 1 }}</span>
                      </div>

                      <!-- Ícono de categoría -->
                      <div
                        class="w-12 h-12 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-sm"
                        [ngClass]="item.color || 'bg-gray-700'"
                      >
                        <span class="material-icons-outlined text-2xl leading-none">
                          {{ item.icon || 'notifications' }}
                        </span>
                      </div>

                      <!-- Texto -->
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1 flex-wrap">
                          <span 
                            class="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md"
                            [ngClass]="getCategoryBadgeClass(item.category)"
                          >
                            {{ getCategoryLabel(item.category) }}
                          </span>

                          <h4 class="text-sm font-black text-gray-900 leading-snug">
                            {{ item.title }}
                          </h4>

                          @if (!item.read) {
                            <span class="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black animate-pulse">
                              NUEVA
                            </span>
                          }
                        </div>

                        <p class="text-xs text-gray-600 leading-relaxed mb-2">
                          {{ item.message }}
                        </p>

                        <!-- Metadatos de la notificación en la lista -->
                        <div class="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
                          <span class="flex items-center gap-1 text-[11px] font-semibold text-gray-400">
                            <span class="material-icons-outlined text-sm">schedule</span>
                            {{ item.timestamp | date:'dd/MM/yyyy HH:mm' }} ({{ formatTimeAgo(item.timestamp) }})
                          </span>

                          @if (item.tableNumber) {
                            <span class="flex items-center gap-1 font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                              <span class="material-icons-outlined text-sm">table_restaurant</span>
                              Mesa {{ item.tableNumber }}
                            </span>
                          }

                          @if (item.amount) {
                            <span class="flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                              <span class="material-icons-outlined text-sm">payments</span>
                              S/ {{ item.amount.toFixed(2) }}
                            </span>
                          }
                        </div>
                      </div>
                    </div>

                    <!-- Columna Derecha: Botones de Acción -->
                    <div class="flex items-center gap-2 shrink-0 self-end sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 w-full sm:w-auto justify-end">
                      @if (item.routeLink) {
                        <button
                          type="button"
                          (click)="navigateToItem(item)"
                          class="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                        >
                          <span>{{ item.actionText || 'Ver en el sistema' }}</span>
                          <span class="material-icons-outlined text-sm">arrow_forward</span>
                        </button>
                      }

                      <!-- Marcar Leído / No Leído -->
                      <button
                        type="button"
                        (click)="notificationService.toggleReadStatus(item.id)"
                        [title]="item.read ? 'Marcar como no leída' : 'Marcar como leída'"
                        class="p-2 rounded-xl border border-gray-200 hover:bg-gray-100 text-gray-600 transition-colors"
                      >
                        <span class="material-icons-outlined text-base">
                          {{ item.read ? 'mark_email_unread' : 'check_circle' }}
                        </span>
                      </button>

                      <!-- Eliminar -->
                      <button
                        type="button"
                        (click)="notificationService.removeNotification(item.id)"
                        title="Eliminar de la lista"
                        class="p-2 rounded-xl border border-gray-200 hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors"
                      >
                        <span class="material-icons-outlined text-base">delete</span>
                      </button>
                    </div>
                  </li>
                } @empty {
                  <li class="py-16 text-center text-gray-400 flex flex-col items-center justify-center list-none">
                    <div class="w-16 h-16 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-gray-400 mb-3 shadow-xs">
                      <span class="material-icons-outlined text-4xl">search_off</span>
                    </div>
                    <p class="text-base font-bold text-gray-700 mb-1">No se encontraron notificaciones</p>
                    <p class="text-xs text-gray-500 max-w-sm">
                      No hay notificaciones en la lista que coincidan con los criterios de búsqueda o filtro seleccionados.
                    </p>
                  </li>
                }
              </ul>
            </div>

            <!-- PIE DEL MODAL -->
            <div class="p-4 bg-white border-t border-gray-200 flex items-center justify-between">
              <span class="text-xs text-gray-500 font-medium">
                Mostrando {{ notificationService.modalFilteredNotifications().length }} de {{ notificationService.notifications().length }} notificaciones en la lista
              </span>

              <button
                type="button"
                (click)="notificationService.closeModal()"
                class="px-5 py-2.5 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs transition-colors"
              >
                Cerrar Lista
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class NotificationBellComponent {
  public readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly elementRef = inject(ElementRef);

  @Input() isMobile = false;
  @Input() showSummaryButton = false;

  readonly isOpen = computed(() => this.notificationService.isPanelOpen());

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.notificationService.togglePanel();
  }

  closeDropdown(): void {
    this.notificationService.closePanel();
  }

  openFullModal(): void {
    this.notificationService.openModal();
  }

  onNotificationClick(item: SystemNotification): void {
    this.notificationService.markAsRead(item.id);
    if (item.routeLink) {
      this.closeDropdown();
      this.router.navigateByUrl(item.routeLink);
    }
  }

  navigateToItem(item: SystemNotification): void {
    this.notificationService.markAsRead(item.id);
    if (item.routeLink) {
      this.notificationService.closeModal();
      this.closeDropdown();
      this.router.navigateByUrl(item.routeLink);
    }
  }

  deleteNotification(event: MouseEvent, id: string): void {
    event.stopPropagation();
    this.notificationService.removeNotification(id);
  }

  getCategoryLabel(category: string): string {
    switch (category) {
      case 'order': return 'Pedido';
      case 'table': return 'Mesa';
      case 'report': return 'Reporte';
      case 'payment': return 'Pago';
      default: return 'Sistema';
    }
  }

  getCategoryBadgeClass(category: string): string {
    switch (category) {
      case 'order': return 'bg-emerald-100 text-emerald-800';
      case 'table': return 'bg-purple-100 text-purple-800';
      case 'report': return 'bg-teal-100 text-teal-800';
      case 'payment': return 'bg-blue-100 text-blue-800';
      default: return 'bg-orange-100 text-orange-800';
    }
  }

  formatTimeAgo(date: Date | string): string {
    const now = Date.now();
    const time = new Date(date).getTime();
    const diffSec = Math.floor((now - time) / 1000);

    if (isNaN(diffSec) || diffSec < 60) return 'Hace un momento';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `Hace ${diffHour} h`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `Hace ${diffDay} d`;
    return new Date(date).toLocaleDateString('es-PE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.isOpen()) return;
    const clickedInside = this.elementRef.nativeElement.contains(event.target);
    if (!clickedInside) {
      this.closeDropdown();
    }
  }

  @HostListener('document:keydown.escape')
  onEscapePress(): void {
    if (this.isOpen()) {
      this.closeDropdown();
    }
    if (this.notificationService.isModalOpen()) {
      this.notificationService.closeModal();
    }
  }
}
