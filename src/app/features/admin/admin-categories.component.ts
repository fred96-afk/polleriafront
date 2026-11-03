import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../services/category.service';
import { CategoryResponse, CategoryRequest } from '../../models/category.model';
import { AlertService } from '../../services/alert.service';
import { ToastrService } from 'ngx-toastr';
import { Observable, finalize } from 'rxjs';

@Component({
  selector: 'app-admin-categories',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-categories.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCategoriesComponent {
  private readonly categoryService = inject(CategoryService);
  private readonly fb = inject(FormBuilder);
  private readonly alertService = inject(AlertService);
  private readonly toastService = inject(ToastrService);

  categories = signal<CategoryResponse[]>([]);
  showModal = signal(false);
  loading = signal(false);
  editingId = signal<number | null>(null);
  submitted = signal(false);
  selectedFile: File | null = null;

  // Pagination
  currentPage = signal(1);
  pageSize = signal(10);
  totalPages = signal(1);
  totalCount = signal(0);

  categoryForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required]]
  });

  constructor() {
    this.loadCategories();
  }

  loadCategories() {
    this.loading.set(true);
    this.categoryService.getPagedCategories(this.currentPage(), this.pageSize()).pipe(
      finalize(() => this.loading.set(false))
    ).subscribe(data => {
      this.categories.set(data.items);
      this.totalPages.set(data.totalPages);
      this.totalCount.set(data.totalCount);
    });
  }

  changePage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      this.loadCategories();
    }
  }

  onFileChange(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
    }
  }

  openModal(category?: CategoryResponse) {
    this.submitted.set(false);
    if (category) {
      this.editingId.set(category.id);
      this.categoryForm.patchValue({
        name: category.name,
        description: category.description
      });
    } else {
      this.editingId.set(null);
      this.categoryForm.reset();
    }
    this.selectedFile = null;
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingId.set(null);
    this.submitted.set(false);
    this.categoryForm.reset();
    this.selectedFile = null;
  }

  saveCategory() {
    this.submitted.set(true);
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const request: CategoryRequest = {
      name: this.categoryForm.value.name,
      description: this.categoryForm.value.description,
      image: this.selectedFile
    };

    const operation: Observable<any> = this.editingId() 
      ? this.categoryService.updateCategory(this.editingId()!, request)
      : this.categoryService.createCategory(request);

    operation.subscribe({
      next: () => {
        this.toastService.success(
          this.editingId() ? 'Categoría actualizada' : 'Categoría creada', 
          '¡Éxito!'
        );
        this.loadCategories();
        this.closeModal();
        this.loading.set(false);
      },
      error: (err) => {
        console.error('Error al guardar categoría:', err);
        this.toastService.error('Ocurrió un error al guardar la categoría', 'Error');
        this.loading.set(false);
      }
    });
  }

  async deleteCategory(id: number): Promise<void> {
    const confirmed = await this.alertService.confirm({
      title: '¿Eliminar esta categoría?',
      text: 'Esta acción no se puede deshacer.',
      confirmButtonText: 'Sí, eliminar',
    });

    if (confirmed) {
      this.categoryService.deleteCategory(id).subscribe({
        next: () => {
          this.toastService.success('Categoría eliminada', '¡Éxito!');
          this.loadCategories();
        },
        error: (err) => {
          console.error('Error al eliminar categoría:', err);
          this.toastService.error('No se pudo eliminar la categoría', 'Error');
        }
      });
    }
  }
}
