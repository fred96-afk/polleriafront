import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { ToastrService } from 'ngx-toastr';
import { MaintenanceService } from '../../services/maintenance.service';

@Component({
  selector: 'app-admin-maintenance',
  imports: [ReactiveFormsModule],
  templateUrl: './admin-maintenance.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminMaintenanceComponent {
  private readonly fb = inject(FormBuilder);
  private readonly maintenanceService = inject(MaintenanceService);
  private readonly toastService = inject(ToastrService);

  readonly loading = signal(false);
  readonly maintenanceForm = this.fb.group({
    scheduledDate: ['', Validators.required],
    estimatedDuration: [60, [Validators.required, Validators.min(1)]],
    details: ['', [Validators.required, Validators.maxLength(2000)]],
    supportContact: ['', Validators.maxLength(200)]
  });

  submit(): void {
    if (this.maintenanceForm.invalid || this.loading()) {
      this.maintenanceForm.markAllAsTouched();
      return;
    }

    const formValue = this.maintenanceForm.getRawValue();
    const scheduledDateValue = formValue.scheduledDate;
    const details = formValue.details?.trim();
    if (!scheduledDateValue || !details) {
      this.maintenanceForm.markAllAsTouched();
      return;
    }

    const scheduledDate = new Date(scheduledDateValue);
    if (Number.isNaN(scheduledDate.getTime())) {
      this.toastService.error('Selecciona una fecha de mantenimiento válida.', 'Fecha no válida');
      return;
    }

    this.loading.set(true);
    this.maintenanceService.notify({
      scheduledDate: scheduledDate.toISOString(),
      estimatedDuration: Number(formValue.estimatedDuration),
      details,
      ...(formValue.supportContact?.trim()
        ? { supportContact: formValue.supportContact.trim() }
        : {})
    }).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe({
      next: () => {
        this.toastService.success('Se notificó el mantenimiento programado.', 'Notificación enviada');
        this.maintenanceForm.reset({
          scheduledDate: '',
          estimatedDuration: 60,
          details: '',
          supportContact: ''
        });
      },
      error: (error) => {
        console.error('Error al notificar mantenimiento:', error);
        this.toastService.error(
          error.error?.message || 'No se pudo enviar la notificación de mantenimiento.',
          'Error'
        );
      }
    });
  }
}
