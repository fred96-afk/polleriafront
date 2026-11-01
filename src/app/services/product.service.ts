import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { enviroment } from '../../enviroments/enviroments.development';
import { ProductRequest, ProductResponse, PagedResponse } from '../models/product.model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${enviroment.backenbaseurl}/api/Products`;

  getProducts(): Observable<ProductResponse[]> {
    return this.http.get<ProductResponse[]>(this.apiUrl);
  }

  getPagedProducts(pageNumber: number, pageSize: number, term?: string): Observable<PagedResponse<ProductResponse>> {
    let params = new HttpParams()
      .set('PageNumber', pageNumber.toString())
      .set('PageSize', pageSize.toString());
    
    if (term) {
      params = params.set('term', term);
    }

    return this.http.get<PagedResponse<ProductResponse>>(`${this.apiUrl}/paged`, { params });
  }

  searchProducts(term: string): Observable<ProductResponse[]> {
    const params = new HttpParams().set('term', term);
    return this.http.get<ProductResponse[]>(`${this.apiUrl}/search`, { params });
  }

  getProductById(id: number): Observable<ProductResponse> {
    return this.http.get<ProductResponse>(`${this.apiUrl}/${id}`);
  }

  createProduct(request: ProductRequest): Observable<ProductResponse> {
    const formData = new FormData();
    if (request.name) formData.append('Name', request.name);
    if (request.description) formData.append('Description', request.description);
    
    // Asegurar que el precio se envíe como string pero sea un número válido
    const price = request.basePrice !== undefined && request.basePrice !== null ? request.basePrice.toString() : '0';
    formData.append('BasePrice', price);
    
    if (request.categoryId) formData.append('CategoryId', request.categoryId.toString());
    if (request.image) formData.append('Image', request.image);

    return this.http.post<ProductResponse>(this.apiUrl, formData);
  }

  updateProduct(id: number, request: ProductRequest): Observable<void> {
    const formData = new FormData();
    if (request.name) formData.append('Name', request.name);
    if (request.description) formData.append('Description', request.description);
    
    const price = request.basePrice !== undefined && request.basePrice !== null ? request.basePrice.toString() : '0';
    formData.append('BasePrice', price);
    
    if (request.categoryId) formData.append('CategoryId', request.categoryId.toString());
    if (request.image) formData.append('Image', request.image);

    return this.http.put<void>(`${this.apiUrl}/${id}`, formData);
  }

  deleteProduct(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
