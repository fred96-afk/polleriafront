export interface ProductRequest {
  name?: string | null;
  description?: string | null;
  basePrice: number;
  categoryId?: number | null;
  image?: File | null;
}

export interface ProductResponse {
  id: number;
  name?: string | null;
  description?: string | null;
  basePrice: number;
  categoryId?: number | null;
  categoryName?: string | null;
  imageUrl?: string | null;
}

export interface PagedResponse<T> {
  items: T[];
  pageNumber: number;
  totalPages: number;
  totalCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}
