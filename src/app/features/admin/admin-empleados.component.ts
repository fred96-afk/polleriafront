import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EmpleadoService } from '../../services/empleado.service';
import { CatalogoService } from '../../services/catalogo.service';
import { EmpleadoResponse, EmpleadoRequest } from '../../models/empleado.model';
import { Cargo, TipoDocumento } from '../../models/catalogo.model';
import { AlertService } from '../../services/alert.service';
import { ToastrService } from 'ngx-toastr';
import { Observable, finalize } from 'rxjs';

@Component({
  selector: 'app-admin-empleados',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-empleados.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminEmpleadosComponent {
  private readonly empleadoService = inject(EmpleadoService);
  private readonly catalogoService = inject(CatalogoService);
  private readonly fb = inject(FormBuilder);
  private readonly alertService = inject(AlertService);
  private readonly toastService = inject(ToastrService);

  empleados = signal<EmpleadoResponse[]>([]);
  cargos = signal<Cargo[]>([]);
  documentTypes = signal<TipoDocumento[]>([]);
  loading = signal(false);
  showModal = signal(false);
  editingId = signal<number | null>(null);

  empleadosWithDetails = computed(() => {
    const emps = this.empleados();
    const cgs = this.cargos();
    const docs = this.documentTypes();
    
    return emps.map(e => ({
      ...e,
      cargoName: cgs.find(c => c.id === e.idCargo)?.nombre,
      docTypeName: docs.find(d => d.id === e.idTipoDocumento)?.nombre
    }));
  });

  empleadoForm = this.fb.group({
    idCargo: [null as number | null, [Validators.required]],
    idTipoDocumento: [null as number | null, [Validators.required]],
    numeroDocumento: ['', [Validators.required, Validators.minLength(8)]],
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    nombreUsuario: ['', [Validators.required, Validators.minLength(4)]],
    contrasena: ['', [Validators.minLength(6)]], // Optional for update
    estadoLogico: [true]
  });

  constructor() {
    this.loadEmpleados();
    this.loadCatalogos();
  }

  loadEmpleados() {
    this.loading.set(true);
    this.empleadoService.getEmpleados().pipe(
      finalize(() => this.loading.set(false))
    ).subscribe(data => this.empleados.set(data));
  }

  loadCatalogos() {
    this.catalogoService.getCargos().subscribe(data => this.cargos.set(data));
    this.catalogoService.getTiposDocumento().subscribe(data => this.documentTypes.set(data));
  }

  openModal(emp?: EmpleadoResponse) {
    if (emp) {
      this.editingId.set(emp.id);
      this.empleadoForm.patchValue({
        idCargo: emp.idCargo,
        idTipoDocumento: emp.idTipoDocumento,
        numeroDocumento: emp.numeroDocumento,
        nombre: emp.nombre,
        nombreUsuario: emp.nombreUsuario,
        contrasena: '',
        estadoLogico: emp.estadoLogico
      });
      // Removing required validator from password when editing
      this.empleadoForm.get('contrasena')?.clearValidators();
    } else {
      this.editingId.set(null);
      this.empleadoForm.reset({ estadoLogico: true });
      this.empleadoForm.get('contrasena')?.setValidators([Validators.required, Validators.minLength(6)]);
    }
    this.empleadoForm.get('contrasena')?.updateValueAndValidity();
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingId.set(null);
    this.empleadoForm.reset({ estadoLogico: true });
  }

  saveEmpleado() {
    if (this.empleadoForm.invalid) return;

    this.loading.set(true);
    const request: EmpleadoRequest = {
      idCargo: this.empleadoForm.value.idCargo,
      idTipoDocumento: this.empleadoForm.value.idTipoDocumento,
      numeroDocumento: this.empleadoForm.value.numeroDocumento,
      nombre: this.empleadoForm.value.nombre,
      nombreUsuario: this.empleadoForm.value.nombreUsuario,
      contrasena: this.empleadoForm.value.contrasena || undefined,
      estadoLogico: this.empleadoForm.value.estadoLogico ?? true
    };

    const operation: Observable<any> = this.editingId() 
      ? this.empleadoService.updateEmpleado(this.editingId()!, request)
      : this.empleadoService.createEmpleado(request);

    operation.subscribe({
      next: () => {
        this.toastService.success(
          this.editingId() ? 'Empleado actualizado' : 'Empleado registrado', 
          '¡Éxito!'
        );
        this.loadEmpleados();
        this.closeModal();
      },
      error: (err) => {
        console.error('Error al guardar empleado:', err);
        this.toastService.error('Ocurrió un error al guardar', 'Error');
        this.loading.set(false);
      }
    });
  }

  async deleteEmpleado(id: number): Promise<void> {
    const confirmed = await this.alertService.confirm({
      title: '¿Inhabilitar este empleado?',
      text: 'El empleado dejará de estar disponible.',
      confirmButtonText: 'Sí, inhabilitar',
    });

    if (confirmed) {
      this.empleadoService.deleteEmpleado(id).subscribe({
        next: () => {
          this.toastService.success('Empleado inhabilitado', '¡Éxito!');
          this.loadEmpleados();
        },
        error: (err) => {
          console.error('Error al eliminar empleado:', err);
          this.toastService.error('No se pudo eliminar el empleado', 'Error');
        }
      });
    }
  }
}
