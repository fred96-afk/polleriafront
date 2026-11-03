import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { BannerService } from '../../services/banner.service';
import { Banner } from '../../models/banner.model';
import { AlertService } from '../../services/alert.service';
import { ToastrService } from 'ngx-toastr';
import { Observable, finalize } from 'rxjs';

@Component({
  selector: 'app-admin-banners',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-banners.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminBannersComponent {
  private readonly bannerService = inject(BannerService);
  private readonly fb = inject(FormBuilder);
  private readonly alertService = inject(AlertService);
  private readonly toastService = inject(ToastrService);

  banners = signal<Banner[]>([]);
  showModal = signal(false);
  loading = signal(false);
  editingId = signal<number | null>(null);
  selectedFile: File | null = null;

  // Pagination
  currentPage = signal(1);
  pageSize = signal(5);
  totalPages = signal(1);
  totalCount = signal(0);

  bannerForm = this.fb.group({
    title: ['', [Validators.required, Validators.minLength(3)]],
    subtitle: [''],
    linkUrl: [''],
    order: [0, [Validators.required, Validators.min(0)]],
    isActive: [true]
  });

  constructor() {
    this.loadBanners();
  }

  loadBanners() {
    this.loading.set(true);
    this.bannerService.getPagedBanners(this.currentPage(), this.pageSize()).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe(data => {
      this.banners.set(data.items);
      this.totalPages.set(data.totalPages);
      this.totalCount.set(data.totalCount);
    });
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadBanners();
    }
  }

  onFileChange(event: any) {
    const file = event.target.files[0];
    if (file) this.selectedFile = file;
  }

  openModal(banner?: Banner) {
    if (banner) {
      this.editingId.set(banner.id);
      this.bannerForm.patchValue({
        title: banner.title,
        subtitle: banner.subtitle,
        linkUrl: banner.linkUrl,
        order: banner.order,
        isActive: banner.isActive
      });
    } else {
      this.editingId.set(null);
      this.bannerForm.reset({ isActive: true, order: 0 });
    }
    this.selectedFile = null;
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingId.set(null);
    this.bannerForm.reset();
    this.selectedFile = null;
  }

  saveBanner() {
    if (this.bannerForm.invalid) return;

    this.loading.set(true);
    const formData = new FormData();
    formData.append('Title', this.bannerForm.value.title || '');
    formData.append('Subtitle', this.bannerForm.value.subtitle || '');
    formData.append('LinkUrl', this.bannerForm.value.linkUrl || '');
    formData.append('Order', (this.bannerForm.value.order || 0).toString());
    formData.append('IsActive', (this.bannerForm.value.isActive || false).toString());
    
    if (this.selectedFile) {
      formData.append('Image', this.selectedFile);
    }

    const operation: Observable<void> = this.editingId() 
      ? this.bannerService.updateBanner(this.editingId()!, formData)
      : this.bannerService.createBanner(formData);

    operation.subscribe({
      next: () => {
        this.toastService.success('Operación exitosa');
        this.loadBanners();
        this.closeModal();
      },
      error: (err) => {
        console.error('Error al guardar banner:', err);
        this.toastService.error('Error al guardar el banner');
        this.loading.set(false);
      }
    });
  }

  async deleteBanner(id: number): Promise<void> {
    const confirmed = await this.alertService.confirm({
      title: '¿Eliminar este banner?',
      text: 'Esta acción no se puede deshacer.',
      confirmButtonText: 'Sí, eliminar',
    });

    if (confirmed) {
      this.bannerService.deleteBanner(id).subscribe(() => this.loadBanners());
    }
  }
}
