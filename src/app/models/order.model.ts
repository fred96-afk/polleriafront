export interface OrderDetailResponse {
  id: number;
  productId: number;
  productName: string;
  sideId?: number | null;
  sideName?: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface OrderResponse {
  id: number;
  orderDate: string;
  clientId?: number | null;
  customerName?: string | null;
  customerAddress?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  userId: number;
  employeeName?: string | null;
  deliveryUserId?: number | null;
  deliveryName?: string | null;
  totalAmount: number;
  type?: string;
  details: OrderDetailResponse[];
  tableNumber?: string | null;
  status: string;
  paymentStatus: string;
  paymentUrl?: string | null;
  pdfUrl?: string | null;
  notas?: string | null;
}

export interface OrderDetailRequest {
  productId: number;
  sideId?: number | null;
  quantity: number;
}

export interface OrderRequest {
  clientId?: number | null;
  userId: number;
  deliveryUserId?: number | null;
  isPos?: boolean;
  details: OrderDetailRequest[];
  customerName?: string | null;
  documentNumber?: string | null;
  documentType?: string | null;
  customerEmail?: string | null;
  customerAddress?: string | null;
  customerPhone?: string | null;
  isPickup?: boolean;
  tableNumber?: string | null;
}
