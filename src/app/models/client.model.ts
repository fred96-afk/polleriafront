export interface ClientRequest {
  name?: string | null;
  phone?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  address?: string | null;
}

export interface ClientResponse extends ClientRequest {
  id: number;
}
