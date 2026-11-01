import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ProductService } from '../../services/product.service';
import { OrderService } from '../../services/order.service';
import { AuthService } from '../../services/auth.service';
import { BannerService } from '../../services/banner.service';
import { CatalogoService } from '../../services/catalogo.service';
import { DniService } from '../../services/dni.service';
import { ProductResponse } from '../../models/product.model';
import { Banner } from '../../models/banner.model';
import { OrderDetailRequest } from '../../models/order.model';
import { TipoDocumento } from '../../models/catalogo.model';
import { TableMapService } from '../../services/table-map.service';
import { RestaurantTable, TableShape } from '../../models/table-map.model';
import { RouterLink, Router } from '@angular/router';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';

interface CartItem extends ProductResponse {
  quantity: number;
}

@Component({
  selector: 'app-customer',
  imports: [CommonModule, RouterLink, ReactiveFormsModule],
  templateUrl: './customer.component.html',
  styles: [`
    @keyframes slide-in {
      from { transform: translateX(100%); }
      to { transform: translateX(0); }
    }
    .animate-slide-in {
      animation: slide-in 0.3s ease-out forwards;
    }
    @keyframes fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    .animate-fade-in {
      animation: fade-in 0.7s ease-out forwards;
    }
    @keyframes slide-up {
      from { transform: translateY(20px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .animate-slide-up {
      animation: slide-up 0.7s ease-out forwards;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomerComponent implements OnInit, OnDestroy {
  private readonly productService = inject(ProductService);
  private readonly orderService = inject(OrderService);
  public readonly authService = inject(AuthService);
  private readonly bannerService = inject(BannerService);
  private readonly catalogoService = inject(CatalogoService);
  private readonly dniService = inject(DniService);
  private readonly router = inject(Router);
  private readonly toastService = inject(ToastrService);
  private readonly fb = inject(FormBuilder);
  private readonly sanitizer = inject(DomSanitizer);

  products = signal<ProductResponse[]>([]);
  banners = signal<Banner[]>([]);
  loadingBanners = signal(true);
  tiposDocumento = signal<TipoDocumento[]>([]);
  currentBannerIndex = signal(0);
  private bannerInterval: any;

  // Pagination and Search
  searchTerm = signal('');
  currentPage = signal(1);
  pageSize = signal(8);
  totalPages = signal(1);
  totalCount = signal(0);

  cart = signal<CartItem[]>([]);
  loading = signal(false);
  loadingProducts = signal(true);
  loadingDni = signal(false);
  isCartOpen = signal(false);
  showCheckoutModal = signal(false);
  showUserDropdown = signal(false);

  public readonly tableMapService = inject(TableMapService);

  // Modalidad de pedido: Delivery o Comer en el Salón (Elegir Mesa)
  orderType = signal<'delivery' | 'dine_in'>('delivery');
  selectedCustomerTable = signal<RestaurantTable | null>(null);
  customerActiveMapId = signal<string>('salon-principal');

  customerActiveTables = computed(() => {
    const mapId = this.customerActiveMapId();
    return this.tableMapService.tables().filter(t => t.mapId === mapId);
  });

  // Maps properties
  businessLocation = { lat: -12.784433, lng: -74.975442 };
  detectedCoords = signal<{lat: number, lng: number} | null>(null);
  searchQuery = signal<string>('');

  currentMapUrl = computed(() => {
    let query = '';
    if (this.searchQuery()) {
      query = encodeURIComponent(this.searchQuery());
    } else if (this.detectedCoords()) {
      query = `${this.detectedCoords()?.lat},${this.detectedCoords()?.lng}`;
    } else {
      query = `${this.businessLocation.lat},${this.businessLocation.lng}`;
    }
    
    return this.sanitizer.bypassSecurityTrustResourceUrl(
      `https://maps.google.com/maps?q=${query}&z=17&ie=UTF8&iwloc=&output=embed`
    );
  });

  cartCount = computed(() => this.cart().reduce((acc, item) => acc + item.quantity, 0));
  totalPrice = computed(() => this.cart().reduce((acc, item) => acc + (item.basePrice * item.quantity), 0));

  checkoutForm = this.fb.group({
    idTipoDocumento: [null as number | null, [Validators.required]],
    numeroDocumento: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(11)]],
    name: ['', [Validators.required, Validators.minLength(3)]],
    phone: ['', [Validators.required, Validators.pattern(/^[0-9]{9}$/)]],
    address: ['', [Validators.required, Validators.minLength(5)]],
    notes: ['']
  });

  constructor() {
    this.loadProducts();
    this.loadBanners();

    this.catalogoService.getTiposDocumento().subscribe(data => {
      this.tiposDocumento.set(data);
      if (data.length > 0) {
        this.checkoutForm.patchValue({ idTipoDocumento: data[0].id });
      }
    });

    if (this.authService.isAuthenticated()) {
      this.checkoutForm.patchValue({ name: this.authService.displayName });
    }

    this.loadCatalogos();
  }

  loadBanners() {
    this.loadingBanners.set(true);
    this.bannerService.getBanners().pipe(
      finalize(() => this.loadingBanners.set(false))
    ).subscribe({
      next: (data) => {
        this.banners.set(data.filter(b => b.isActive).sort((a, b) => a.order - b.order));
      },
      error: (err) => {
        console.error('Error al cargar banners:', err);
      }
    });
  }

  loadProducts() {
    this.loadingProducts.set(true);
    this.productService.getPagedProducts(this.currentPage(), this.pageSize(), this.searchTerm()).pipe(
      finalize(() => this.loadingProducts.set(false))
    ).subscribe(data => {
      this.products.set(data.items);
      this.totalPages.set(data.totalPages);
      this.totalCount.set(data.totalCount);
    });
  }

  onSearch(term: string) {
    this.searchTerm.set(term);
    this.currentPage.set(1);
    this.loadProducts();
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadProducts();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  loadCatalogos() {
    this.catalogoService.getTiposDocumento().subscribe(data => {
      this.tiposDocumento.set(data);
      if (data.length > 0 && !this.checkoutForm.value.idTipoDocumento) {
        this.checkoutForm.patchValue({ idTipoDocumento: data[0].id });
      }
    });
  }

  ngOnInit() {
    this.startBannerInterval();
  }

  ngOnDestroy() {
    this.stopBannerInterval();
  }

  private startBannerInterval() {
    this.bannerInterval = setInterval(() => {
      this.nextBanner();
    }, 5000);
  }

  private stopBannerInterval() {
    if (this.bannerInterval) {
      clearInterval(this.bannerInterval);
    }
  }

  nextBanner() {
    if (this.banners().length === 0) return;
    this.currentBannerIndex.update(idx => (idx + 1) % this.banners().length);
  }

  prevBanner() {
    if (this.banners().length === 0) return;
    this.currentBannerIndex.update(idx => (idx - 1 + this.banners().length) % this.banners().length);
  }

  setBanner(index: number) {
    this.currentBannerIndex.set(index);
    this.stopBannerInterval();
    this.startBannerInterval();
  }

  searchAddress(address: string) {
    if (address.length > 5) {
      this.searchQuery.set(address);
    }
  }

  getCurrentLocation() {
    if (!navigator.geolocation) {
      this.toastService.error('Tu navegador no soporta geolocalización', 'Error');
      return;
    }

    this.toastService.info('Detectando ubicación...', 'Geolocalización');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.searchQuery.set(''); 
        this.detectedCoords.set({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
        this.toastService.success('Ubicación detectada por GPS', '¡Éxito!');
      },
      (error) => {
        console.warn('GPS falló, intentando por IP...', error);
        fetch('https://ipapi.co/json/')
          .then(res => res.json())
          .then(data => {
            if (data.latitude && data.longitude) {
              this.detectedCoords.set({ lat: data.latitude, lng: data.longitude });
              this.toastService.success(`Ubicación aproximada detectada (${data.city})`, '¡Listo!');
            } else {
              throw new Error('IP Geolocation falló');
            }
          })
          .catch(() => {
            this.toastService.warning('No pudimos detectarte automáticamente. Por favor, escribe tu dirección.', 'Ubicación no disponible');
          });
      },
      { enableHighAccuracy: false, timeout: 5000, maximumAge: Infinity }
    );
  }

  buscarDocumento() {
    const num = this.checkoutForm.value.numeroDocumento;
    if (!num || (num.length !== 8 && num.length !== 11)) {
      this.toastService.warning('Ingresa un DNI (8 dígitos) o RUC (11 dígitos) válido', 'Aviso');
      return;
    }

    this.loadingDni.set(true);
    this.dniService.consultarDocumento(num).pipe(
      finalize(() => this.loadingDni.set(false))
    ).subscribe({
      next: (res) => {
        if (res.success && res.nombre) {
          this.checkoutForm.patchValue({ name: res.nombre });
          this.toastService.success('Datos encontrados', '¡Éxito!');
        } else {
          this.toastService.warning(res.message || 'No se encontraron resultados', 'Aviso');
        }
      },
      error: () => this.toastService.error('Error al consultar el documento', 'Error')
    });
  }

  toggleCart() {
    this.isCartOpen.update(v => !v);
  }

  addToCart(product: ProductResponse) {
    this.cart.update(current => {
      const existing = current.find(i => i.id === product.id);
      if (existing) {
        return current.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...current, { ...product, quantity: 1 }];
    });
    if (!this.isCartOpen() && !this.showCheckoutModal()) {
      this.isCartOpen.set(true);
    }
  }

  removeFromCart(productId: number) {
    this.cart.update(current => {
      const existing = current.find(i => i.id === productId);
      if (existing && existing.quantity > 1) {
        return current.map(i => i.id === productId ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return current.filter(i => i.id !== productId);
    });
  }

  openCheckout() {
    if (!this.authService.isAuthenticated()) {
      this.toastService.info('Por favor, inicia sesión para completar tu pedido', 'Autenticación Requerida');
      this.router.navigate(['/login']);
      return;
    }
    this.loadCatalogos();
    this.isCartOpen.set(false);
    this.showCheckoutModal.set(true);
  }

  openTrackingDialog() {
    const orderId = prompt('Por favor, ingresa el número de tu pedido (ID):');
    if (orderId && !isNaN(Number(orderId))) {
      this.router.navigate(['/order-tracking', orderId]);
    } else if (orderId) {
      this.toastService.warning('Por favor, ingresa un número de pedido válido.', 'Aviso');
    }
  }

  onLogout() {
    this.authService.logout();
    this.showUserDropdown.set(false);
    this.toastService.info('Sesión cerrada correctamente', 'Adiós');
  }

  setOrderType(type: 'delivery' | 'dine_in') {
    this.orderType.set(type);
    if (type === 'dine_in') {
      this.checkoutForm.get('address')?.clearValidators();
      this.checkoutForm.get('address')?.updateValueAndValidity();
      if (this.selectedCustomerTable()) {
        const t = this.selectedCustomerTable()!;
        this.checkoutForm.patchValue({ address: `Mesa ${t.number} (${t.location || 'Salón'})` });
      }
    } else {
      this.checkoutForm.get('address')?.setValidators([Validators.required, Validators.minLength(5)]);
      this.checkoutForm.get('address')?.updateValueAndValidity();
    }
  }

  selectCustomerTable(table: RestaurantTable) {
    if (table.status === 'occupied') {
      this.toastService.warning(`La Mesa ${table.number} se encuentra ocupada actualmente. Por favor elige una mesa disponible.`);
      return;
    }
    this.selectedCustomerTable.set(table);
    this.checkoutForm.patchValue({ address: `Mesa ${table.number} (${table.location || 'Salón'})` });
    this.toastService.success(`Mesa ${table.number} seleccionada (${table.chairs || table.capacity} sillas en ${table.location})`, 'Mesa Elegida');
  }

  getChairSlots(table: { chairs?: number; capacity?: number; shape?: TableShape }) {
    return this.tableMapService.getChairSlots(table);
  }

  processOrder() {
    if (this.orderType() === 'dine_in' && !this.selectedCustomerTable()) {
      this.toastService.warning('Por favor selecciona una mesa disponible en el mapa del local para tu pedido en salón.', 'Mesa Requerida');
      return;
    }

    if (this.checkoutForm.invalid) {
      this.checkoutForm.markAllAsTouched();
      return;
    }

    const userId = this.authService.userId;
    if (!userId) {
      this.toastService.error('Información de usuario no encontrada', 'Error');
      return;
    }

    this.loading.set(true);

    const isDineIn = this.orderType() === 'dine_in';
    const chosenTable = this.selectedCustomerTable();
    const finalAddress = isDineIn 
      ? `Mesa ${chosenTable?.number} (${chosenTable?.location || 'Salón'})`
      : (this.checkoutForm.value.address || '');

    const tipoDocId = this.checkoutForm.value.idTipoDocumento;
    const tipoDocNombre = this.tiposDocumento().find(t => t.id === tipoDocId)?.nombre || 'DNI';

    const details: OrderDetailRequest[] = this.cart().map(item => ({
      productId: item.id,
      quantity: item.quantity
    }));

    this.orderService.createOrder({
      userId,
      clientId: null,
      isPos: false,
      details,
      customerName: this.checkoutForm.value.name,
      documentNumber: this.checkoutForm.value.numeroDocumento,
      documentType: tipoDocNombre,
      customerEmail: this.authService.email,
      customerAddress: finalAddress,
      customerPhone: this.checkoutForm.value.phone,
      tableNumber: isDineIn ? chosenTable?.number : undefined
    }).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: (order) => {
        if (order.paymentUrl) {
          // Abrir Mercado Pago en una nueva pestaña
          const win = window.open(order.paymentUrl, '_blank', 'noopener,noreferrer');
          if (win) {
            win.focus();
            this.toastService.success('Se ha abierto una nueva pestaña para el pago.', '¡Pedido Creado!');
          } else {
            // Si el navegador bloquea el popup, fallback en la misma pestaña
            window.location.href = order.paymentUrl;
            return;
          }
        }
        
        this.toastService.success(`Pedido #${order.id} enviado con éxito!`, '¡Éxito!');
        this.cart.set([]);
        this.showCheckoutModal.set(false);
        
        // Redirigir a la página de seguimiento en la pestaña actual
        this.router.navigate(['/order-tracking', order.id]);
      },
      error: (err) => {
        const timestamp = new Date().toISOString();
        console.group(`%c [DELIVERY ORDER ERROR] ${timestamp} `, 'background: #d32f2f; color: #fff; font-weight: bold; padding: 4px;');
        console.error('%cDetalle del Error:%c', 'font-weight: bold', '', err);
        console.warn('%cEstado del Proceso:%c', 'font-weight: bold', '', {
          userId,
          clientId: null,
          formData: this.checkoutForm.value,
          cartCount: this.cartCount(),
          total: this.totalPrice(),
          customerEmail: this.authService.email
        });
        console.groupEnd();

        this.toastService.error('No se pudo procesar el pedido', 'Error');
      }
    });
  }
}
