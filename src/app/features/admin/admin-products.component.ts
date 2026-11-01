import { ChangeDetectionStrategy, Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ProductService } from '../../services/product.service';
import { CategoryService } from '../../services/category.service';
import { ProductResponse, ProductRequest } from '../../models/product.model';
import { CategoryResponse } from '../../models/category.model';
import { ToastrService } from 'ngx-toastr';
import { Observable, finalize } from 'rxjs';

@Component({
  selector: 'app-admin-products',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-products.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductsComponent {
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastrService);

  products = signal<ProductResponse[]>([]);
  categories = signal<CategoryResponse[]>([]);
  showModal = signal(false);
  loading = signal(false);
  editingId = signal<number | null>(null);
  submitted = signal(false);
  selectedFile: File | null = null;

  // Pagination and Search
  searchTerm = signal('');
  currentPage = signal(1);
  pageSize = signal(10);
  totalPages = signal(1);
  totalCount = signal(0);

  productsWithCategory = computed(() => {
    const prods = this.products();
    const cats = this.categories();
    return prods.map(p => ({
      ...p,
      categoryName: p.categoryName || cats.find(c => c.id === p.categoryId)?.name
    }));
  });

  productForm = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3)]],
    description: ['', [Validators.required]],
    basePrice: [0, [Validators.required, Validators.min(0.1)]],
    categoryId: [null as number | null, [Validators.required]]
  });

  constructor() {
    this.loadProducts();
    this.loadCategories();
  }

  loadProducts() {
    this.loading.set(true);
    this.productService.getPagedProducts(this.currentPage(), this.pageSize(), this.searchTerm()).pipe(
      finalize(() => this.loading.set(false))
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
    }
  }

  loadCategories() {
    this.categoryService.getCategories().subscribe(data => this.categories.set(data));
  }

  onFileChange(event: any) {
    const file = event.target.files[0];
    if (file) this.selectedFile = file;
  }

  openModal(product?: ProductResponse) {
    this.submitted.set(false);
    if (product) {
      this.editingId.set(product.id);
      this.productForm.patchValue({
        name: product.name,
        description: product.description,
        basePrice: product.basePrice,
        categoryId: product.categoryId
      });
    } else {
      this.editingId.set(null);
      this.productForm.reset({ basePrice: 0, categoryId: null });
    }
    this.selectedFile = null;
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingId.set(null);
    this.submitted.set(false);
    this.productForm.reset();
    this.selectedFile = null;
  }

  saveProduct() {
    this.submitted.set(true);
    if (this.productForm.invalid) {
      this.productForm.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const request: ProductRequest = {
      name: this.productForm.value.name,
      description: this.productForm.value.description,
      basePrice: this.productForm.value.basePrice ?? 0,
      categoryId: this.productForm.value.categoryId,
      image: this.selectedFile
    };

    const operation: Observable<unknown> = this.editingId() 
      ? this.productService.updateProduct(this.editingId()!, request)
      : this.productService.createProduct(request);

    operation.subscribe({
      next: () => {
        this.toastService.success('Operación exitosa');
        this.loadProducts();
        this.closeModal();
      },
      error: (err: unknown) => {
        console.error('Error al guardar:', err);
        this.toastService.error('Error al guardar. Revisa el formato de imagen o campos.');
        this.loading.set(false);
      }
    });
  }

  deleteProduct(id: number) {
    if (confirm('¿Eliminar producto?')) {
      this.productService.deleteProduct(id).subscribe(() => this.loadProducts());
    }
  }
}
