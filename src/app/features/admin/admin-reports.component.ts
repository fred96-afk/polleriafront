import { ChangeDetectionStrategy, Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ReportService } from '../../services/report.service';
import { ToastrService } from 'ngx-toastr';
import { finalize } from 'rxjs';

@Component({
  selector: 'app-admin-reports',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-reports.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminReportsComponent implements OnInit {
  public readonly reportService = inject(ReportService);
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastrService);

  // Estados de carga síncrona tradicional
  loadingPdf = this.fb.control(false);
  loadingExcel = this.fb.control(false);

  // Referencias a los estados reactivos globales del servicio
  completedReports = this.reportService.completedReports;
  activeJobs = this.reportService.activeJobs;
  isGenerating = this.reportService.isGenerating;
  isLoadingHistory = this.reportService.isLoadingHistory;

  // Fecha de hoy por defecto
  today = new Date().toISOString().split('T')[0];

  reportForm = this.fb.group({
    startDate: [this.today, [Validators.required]],
    endDate: [this.today, [Validators.required]]
  });

  ngOnInit(): void {
    // Al abrir la vista, sincronizar con el historial guardado en el servidor
    this.reportService.loadReportHistory();
  }

  // ==========================================
  // GENERACIÓN ASÍNCRONA EN SEGUNDO PLANO (RABBITMQ + PUSHER)
  // ==========================================
  generateAsyncExcel(): void {
    if (this.reportForm.invalid) return;

    const { startDate, endDate } = this.reportForm.value;

    this.reportService.queueSalesExcel(startDate!, endDate!).subscribe({
      next: (resp) => {
        this.toastService.info(
          'Generación de reporte Excel iniciada en segundo plano con RabbitMQ. Puedes continuar usando el sistema, te avisaremos cuando termine.',
          'Procesando en segundo plano...',
          { timeOut: 7000 }
        );
      },
      error: (err) => {
        console.error('Error al encolar reporte Excel:', err);
        this.toastService.error('No se pudo enviar la solicitud de reporte a la cola de RabbitMQ');
      }
    });
  }

  generateAsyncPdf(): void {
    if (this.reportForm.invalid) return;

    const { startDate, endDate } = this.reportForm.value;

    this.reportService.queueSalesPdf(startDate!, endDate!).subscribe({
      next: (resp) => {
        this.toastService.info(
          'Generación de reporte PDF iniciada en segundo plano con RabbitMQ. Puedes continuar usando el sistema, te avisaremos cuando termine.',
          'Procesando en segundo plano...',
          { timeOut: 7000 }
        );
      },
      error: (err) => {
        console.error('Error al encolar reporte PDF:', err);
        this.toastService.error('No se pudo enviar la solicitud de reporte a la cola de RabbitMQ');
      }
    });
  }

  // ==========================================
  // DESCARGAS SÍNCRONAS DIRECTAS (MÉTODO ALTERNATIVO)
  // ==========================================
  downloadPdfDirect(): void {
    if (this.reportForm.invalid) return;

    this.loadingPdf.setValue(true);
    const { startDate, endDate } = this.reportForm.value;

    this.reportService.downloadSalesPdf(startDate!, endDate!).pipe(
      finalize(() => this.loadingPdf.setValue(false))
    ).subscribe({
      next: (blob) => {
        this.downloadBlobFile(blob, `reporte_ventas_${startDate}_${endDate}.pdf`);
        this.toastService.success('Reporte PDF descargado directamente');
      },
      error: (err) => {
        console.error('Error descargando PDF directo:', err);
        this.toastService.error('No se pudo generar el reporte PDF directo');
      }
    });
  }

  downloadExcelDirect(): void {
    if (this.reportForm.invalid) return;

    this.loadingExcel.setValue(true);
    const { startDate, endDate } = this.reportForm.value;

    this.reportService.downloadSalesExcel(startDate!, endDate!).pipe(
      finalize(() => this.loadingExcel.setValue(false))
    ).subscribe({
      next: (blob) => {
        this.downloadBlobFile(blob, `reporte_ventas_${startDate}_${endDate}.xlsx`);
        this.toastService.success('Reporte Excel descargado directamente');
      },
      error: (err) => {
        console.error('Error descargando Excel directo:', err);
        this.toastService.error('No se pudo generar el reporte Excel directo');
      }
    });
  }

  // Descarga directa a través de URL generada
  triggerDownload(url: string, fileName?: string): void {
    this.reportService.triggerDownload(url, fileName);
  }

  // Eliminar un reporte generado
  deleteReport(fileName: string): void {
    if (confirm(`¿Estás seguro de eliminar el reporte "${fileName}"?`)) {
      this.reportService.deleteReport(fileName).subscribe();
    }
  }

  // Refrescar historial
  refreshHistory(): void {
    this.reportService.loadReportHistory();
  }

  private downloadBlobFile(blob: Blob, fileName: string): void {
    if (!blob) return;
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'reporte.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }
}
