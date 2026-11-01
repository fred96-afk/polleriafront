export interface CategoryRequest {
  name?: string | null;
  description?: string | null;
  image?: File | null;
}

export interface CategoryResponse {
  id: number;
  name?: string | null;
  description?: string | null;
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
