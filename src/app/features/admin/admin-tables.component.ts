import { ChangeDetectionStrategy, Component, inject, signal, computed, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { TableMapService } from '../../services/table-map.service';
import { FloorMap, RestaurantTable, TableShape, ChairSlot } from '../../models/table-map.model';
import { OrderService } from '../../services/order.service';
import { AlertService } from '../../services/alert.service';
import { ToastrService } from 'ngx-toastr';

@Component({
  selector: 'app-admin-tables',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './admin-tables.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminTablesComponent implements OnInit {
  public readonly tableMapService = inject(TableMapService);
  private readonly orderService = inject(OrderService);
  private readonly alertService = inject(AlertService);
  private readonly toastService = inject(ToastrService);
  private readonly fb = inject(FormBuilder);

  @ViewChild('canvasContainer') canvasContainer!: ElementRef<HTMLDivElement>;

  // Modos de visualización
  isDesignerMode = signal<boolean>(false);
  showTableModal = signal<boolean>(false);
  showMapModal = signal<boolean>(false);
  showPushTesterModal = signal<boolean>(false);
  selectedTableForDetails = signal<RestaurantTable | null>(null);

  // Filtro de búsqueda para la tabla
  tableSearchTerm = signal<string>('');
  filterChairs = signal<number | 'all'>('all');
  
  // Elemento en edición
  editingTable = signal<RestaurantTable | null>(null);
  editingMap = signal<FloorMap | null>(null);

  // Drag & drop state
  draggingTableId = signal<string | null>(null);
  dragOffset = { x: 0, y: 0 };

  // Formulario de Mesa (con número de sillas y ubicación en el local)
  tableForm = this.fb.group({
    number: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9\-_ ]+$/)]],
    name: [''],
    mapId: ['', Validators.required],
    chairs: [4, [Validators.required, Validators.min(1), Validators.max(30)]],
    location: ['', [Validators.required, Validators.minLength(3)]],
    shape: ['square' as TableShape, Validators.required],
    x: [20],
    y: [20]
  });

  // Formulario de Plano / Sector
  mapForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    description: [''],
    color: ['#f97316'],
    icon: ['table_restaurant']
  });

  // Tester Form
  testerForm = this.fb.group({
    tableNumber: ['1', Validators.required],
    type: ['call_waiter' as 'call_waiter' | 'request_bill' | 'new_order', Validators.required],
    message: ['El cliente solicita atención inmediata']
  });

  // Estadísticas computadas
  totalChairsInVenue = computed(() => {
    return this.tableMapService.tables().reduce((sum, t) => sum + (t.chairs || t.capacity || 4), 0);
  });

  activeMapTotalChairs = computed(() => {
    return this.tableMapService.activeMapTables().reduce((sum, t) => sum + (t.chairs || t.capacity || 4), 0);
  });

  filteredTablesList = computed(() => {
    const term = this.tableSearchTerm().trim().toLowerCase();
    const chairsFilter = this.filterChairs();
    const activeMapId = this.tableMapService.activeMapId();

    return this.tableMapService.tables().filter(t => {
      const matchesMap = !activeMapId || t.mapId === activeMapId;
      const matchesTerm = !term || 
        t.number.toLowerCase().includes(term) || 
        (t.name && t.name.toLowerCase().includes(term)) ||
        (t.location && t.location.toLowerCase().includes(term));
      const matchesChairs = chairsFilter === 'all' || (t.chairs || t.capacity) === chairsFilter;

      return matchesMap && matchesTerm && matchesChairs;
    });
  });

  ngOnInit() {
    this.refreshOrders();
  }

  refreshOrders() {
    this.orderService.getOrders().subscribe({
      next: (orders) => {
        this.tableMapService.syncTablesWithOrders(orders);
      },
      error: (err) => console.warn('Error al sincronizar órdenes con mesas:', err)
    });
  }

  // ==========================================
  // CÁLCULO VISUAL DE SILLAS
  // ==========================================
  getChairSlots(table: { chairs?: number; capacity?: number; shape?: TableShape }): ChairSlot[] {
    return this.tableMapService.getChairSlots(table);
  }

  getModalPreviewTable(): { chairs: number; shape: TableShape } {
    return {
      chairs: Number(this.tableForm.get('chairs')?.value || 4),
      shape: (this.tableForm.get('shape')?.value as TableShape) || 'square'
    };
  }

  setChairs(count: number) {
    this.tableForm.patchValue({ chairs: count });
  }

  // ==========================================
  // GESTIÓN DE PLANOS / SECTORES
  // ==========================================
  openCreateMapModal() {
    this.editingMap.set(null);
    this.mapForm.reset({
      name: '',
      description: '',
      color: '#f97316',
      icon: 'table_restaurant'
    });
    this.showMapModal.set(true);
  }

  openEditMapModal(map: FloorMap) {
    this.editingMap.set(map);
    this.mapForm.patchValue({
      name: map.name,
      description: map.description || '',
      color: map.color || '#f97316',
      icon: map.icon || 'table_restaurant'
    });
    this.showMapModal.set(true);
  }

  saveMap() {
    if (this.mapForm.invalid) {
      this.mapForm.markAllAsTouched();
      return;
    }

    const val = this.mapForm.getRawValue();
    const current = this.editingMap();

    if (current) {
      this.tableMapService.updateMap(current.id, {
        name: val.name!,
        description: val.description || '',
        color: val.color || '#f97316',
        icon: val.icon || 'table_restaurant'
      });
    } else {
      this.tableMapService.createMap({
        name: val.name!,
        description: val.description || '',
        color: val.color || '#f97316',
        icon: val.icon || 'table_restaurant',
        order: this.tableMapService.maps().length + 1
      });
    }

    this.showMapModal.set(false);
  }

  async deleteMap(map: FloorMap): Promise<void> {
    const confirmed = await this.alertService.confirm({
      title: `¿Eliminar el plano "${map.name}"?`,
      text: 'También se eliminarán todas las mesas asociadas.',
      confirmButtonText: 'Sí, eliminar',
    });

    if (confirmed) {
      this.tableMapService.deleteMap(map.id);
    }
  }

  selectMap(mapId: string) {
    this.tableMapService.setActiveMap(mapId);
  }

  // ==========================================
  // GESTIÓN DE MESAS (CON SILLAS Y UBICACIÓN)
  // ==========================================
  openCreateTableModal() {
    this.editingTable.set(null);
    const currentMapId = this.tableMapService.activeMapId() || 'salon-principal';
    
    // Sugerir el siguiente número de mesa
    const existing = this.tableMapService.tables();
    const nextNum = (existing.length + 1).toString();
    const defaultLocation = this.tableMapService.getSectorDefaultLocation(currentMapId, nextNum);

    this.tableForm.reset({
      number: nextNum,
      name: `Mesa ${nextNum}`,
      mapId: currentMapId,
      chairs: 4,
      location: defaultLocation,
      shape: 'square',
      x: 35,
      y: 35
    });
    this.showTableModal.set(true);
  }

  openEditTableModal(table: RestaurantTable) {
    this.editingTable.set(table);
    this.tableForm.patchValue({
      number: table.number,
      name: table.name || `Mesa ${table.number}`,
      mapId: table.mapId,
      chairs: table.chairs || table.capacity || 4,
      location: table.location || this.tableMapService.getSectorDefaultLocation(table.mapId, table.number),
      shape: table.shape || 'square',
      x: table.x,
      y: table.y
    });
    this.showTableModal.set(true);
  }

  saveTable() {
    if (this.tableForm.invalid) {
      this.tableForm.markAllAsTouched();
      return;
    }

    const val = this.tableForm.getRawValue();
    const current = this.editingTable();
    const chairsCount = Number(val.chairs) || 4;
    const locationVal = val.location || `Salón Principal - Mesa ${val.number}`;

    if (current) {
      this.tableMapService.updateTable(current.id, {
        number: val.number!,
        name: val.name || `Mesa ${val.number}`,
        mapId: val.mapId!,
        chairs: chairsCount,
        capacity: chairsCount,
        location: locationVal,
        shape: val.shape as TableShape
      });
    } else {
      this.tableMapService.createTable({
        number: val.number!,
        name: val.name || `Mesa ${val.number}`,
        mapId: val.mapId!,
        chairs: chairsCount,
        capacity: chairsCount,
        location: locationVal,
        shape: val.shape as TableShape,
        x: Number(val.x) || 30,
        y: Number(val.y) || 30,
        isActive: true
      });
    }

    this.showTableModal.set(false);
  }

  async deleteTable(table: RestaurantTable): Promise<void> {
    const confirmed = await this.alertService.confirm({
      title: `¿Eliminar la Mesa ${table.number}?`,
      text: `Esta mesa tiene ${table.chairs || table.capacity} sillas.`,
      confirmButtonText: 'Sí, eliminar',
    });

    if (confirmed) {
      this.tableMapService.deleteTable(table.id);
    }
  }

  viewTableDetails(table: RestaurantTable) {
    this.selectedTableForDetails.set(table);
  }

  // ==========================================
  // ARRASTRE Y COLOCACIÓN VISUAL (DRAG & DROP)
  // ==========================================
  startDrag(event: MouseEvent | TouchEvent, table: RestaurantTable) {
    if (!this.isDesignerMode()) return;
    event.preventDefault();
    this.draggingTableId.set(table.id);

    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;

    if (this.canvasContainer) {
      const rect = this.canvasContainer.nativeElement.getBoundingClientRect();
      const currentXpx = (table.x / 100) * rect.width;
      const currentYpx = (table.y / 100) * rect.height;
      this.dragOffset = {
        x: (clientX - rect.left) - currentXpx,
        y: (clientY - rect.top) - currentYpx
      };
    }
  }

  onCanvasMouseMove(event: MouseEvent | TouchEvent) {
    const draggingId = this.draggingTableId();
    if (!draggingId || !this.isDesignerMode() || !this.canvasContainer) return;

    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX;
    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    const rect = this.canvasContainer.nativeElement.getBoundingClientRect();

    const mouseX = clientX - rect.left - this.dragOffset.x;
    const mouseY = clientY - rect.top - this.dragOffset.y;

    let pctX = (mouseX / rect.width) * 100;
    let pctY = (mouseY / rect.height) * 100;

    pctX = Math.max(2, Math.min(92, pctX));
    pctY = Math.max(2, Math.min(88, pctY));

    pctX = Math.round(pctX / 2) * 2;
    pctY = Math.round(pctY / 2) * 2;

    this.tableMapService.updateTablePosition(draggingId, pctX, pctY);
  }

  stopDrag() {
    this.draggingTableId.set(null);
  }

  // ==========================================
  // PUSH NOTIFICATIONS & TESTER
  // ==========================================
  requestPushPermissions() {
    this.tableMapService.requestPushPermission();
  }

  openPushTester() {
    const firstTable = this.tableMapService.activeMapTables()[0];
    if (firstTable) {
      this.testerForm.patchValue({
        tableNumber: firstTable.number
      });
    }
    this.showPushTesterModal.set(true);
  }

  sendTestPushAlert() {
    const val = this.testerForm.getRawValue();
    this.tableMapService.triggerTableAlert(
      val.tableNumber || '1',
      val.type || 'call_waiter',
      val.message || 'Notificación de prueba'
    );
    this.showPushTesterModal.set(false);
  }

  async resetLayout(): Promise<void> {
    const confirmed = await this.alertService.confirm({
      title: '¿Restaurar la distribución inicial?',
      text: 'Se restablecerán los planos y las mesas por defecto.',
      confirmButtonText: 'Sí, restaurar',
    });

    if (confirmed) {
      this.tableMapService.resetToDefaultLayout();
    }
  }

  getSectorName(mapId: string): string {
    const m = this.tableMapService.maps().find(map => map.id === mapId);
    return m ? m.name : 'Salón Principal';
  }
}
