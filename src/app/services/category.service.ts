import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { enviroment } from '../../enviroments/enviroments.development';
import { CategoryRequest, CategoryResponse, PagedResponse } from '../models/category.model';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class CategoryService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${enviroment.backenbaseurl}/api/Categories`;

  getCategories(): Observable<CategoryResponse[]> {
    return this.http.get<CategoryResponse[]>(this.apiUrl);
  }

  getPagedCategories(pageNumber: number, pageSize: number): Observable<PagedResponse<CategoryResponse>> {
    const params = new HttpParams()
      .set('PageNumber', pageNumber.toString())
      .set('PageSize', pageSize.toString());
    return this.http.get<PagedResponse<CategoryResponse>>(`${this.apiUrl}/paged`, { params });
  }

  getCategoryById(id: number): Observable<CategoryResponse> {
    return this.http.get<CategoryResponse>(`${this.apiUrl}/${id}`);
  }

  createCategory(request: CategoryRequest): Observable<CategoryResponse> {
    const formData = new FormData();
    if (request.name) formData.append('Name', request.name);
    if (request.description) formData.append('Description', request.description);
    if (request.image) formData.append('Image', request.image);

    return this.http.post<CategoryResponse>(this.apiUrl, formData);
  }

  updateCategory(id: number, request: CategoryRequest): Observable<void> {
    const formData = new FormData();
    if (request.name) formData.append('Name', request.name);
    if (request.description) formData.append('Description', request.description);
    if (request.image) formData.append('Image', request.image);

    return this.http.put<void>(`${this.apiUrl}/${id}`, formData);
  }

  deleteCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}
