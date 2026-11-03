import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ClientService } from '../../services/client.service';
import { ClientResponse, ClientRequest } from '../../models/client.model';
import { AlertService } from '../../services/alert.service';
import { ToastrService } from 'ngx-toastr';
import { Observable, finalize } from 'rxjs';

@Component({
  selector: 'app-admin-clients',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-clients.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminClientsComponent {
  private readonly clientService = inject(ClientService);
  private readonly fb = inject(FormBuilder);
  private readonly alertService = inject(AlertService);
  private readonly toastService = inject(ToastrService);

  clients = signal<ClientResponse[]>([]);
  loading = signal(false);
  showModal = signal(false);
  editingId = signal<number | null>(null);

  clientForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    documentNumber: ['', [Validators.required, Validators.pattern(/^[0-9]{8,11}$/)]],
    phone: [''],
    address: ['', [Validators.required]]
  });

  constructor() {
    this.loadClients();
  }

  loadClients() {
    this.loading.set(true);
    this.clientService.getClients().pipe(
      finalize(() => this.loading.set(false))
    ).subscribe(data => this.clients.set(data));
  }

  openModal(client?: ClientResponse) {
    if (client) {
      this.editingId.set(client.id);
      this.clientForm.patchValue({
        name: client.name,
        documentNumber: client.documentNumber,
        phone: client.phone,
        address: client.address
      });
    } else {
      this.editingId.set(null);
      this.clientForm.reset();
    }
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingId.set(null);
    this.clientForm.reset();
  }

  saveClient() {
    if (this.clientForm.invalid) return;

    this.loading.set(true);
    const formVal = this.clientForm.value;
    const request: ClientRequest = {
      name: formVal.name,
      documentNumber: formVal.documentNumber,
      documentType: formVal.documentNumber?.length === 11 ? 'RUC' : 'DNI',
      phone: formVal.phone,
      address: formVal.address
    };

    const operation: Observable<unknown> = this.editingId() 
      ? this.clientService.updateClient(this.editingId()!, request)
      : this.clientService.createClient(request);

    operation.subscribe({
      next: () => {
        this.toastService.success('Operación exitosa');
        this.loadClients();
        this.closeModal();
      },
      error: (err: unknown) => {
        console.error('Error al guardar cliente:', err);
        this.toastService.error('Error al guardar cliente');
        this.loading.set(false);
      }
    });
  }

  async deleteClient(id: number): Promise<void> {
    const confirmed = await this.alertService.confirm({
      title: '¿Eliminar cliente?',
      text: 'Esta acción no se puede deshacer.',
      confirmButtonText: 'Sí, eliminar',
    });

    if (confirmed) {
      this.clientService.deleteClient(id).subscribe(() => this.loadClients());
    }
  }
}
