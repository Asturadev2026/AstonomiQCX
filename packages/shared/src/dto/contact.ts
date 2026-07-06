import type { ContactSource, CustomerSegment, CustomerType } from '../constants';

/** Guide §10 pattern, applied to contacts (Customer 360 → Add Customer). */

export interface ContactConsentDto {
  whatsapp: boolean;
  sms: boolean;
  email: boolean;
  call: boolean;
}

export interface CreateContactOrderDto {
  product: string;
  orderRef?: string;
  purchaseDate?: string;
  qty: number;
  amount: number;
}

export interface CreateContactDto {
  customerType: CustomerType;
  name: string;
  mobile: string;
  altMobile?: string;
  email?: string;
  company?: string;
  industry?: string;
  gstin?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  landmark?: string;
  language?: string;
  segment?: CustomerSegment;
  source?: ContactSource;
  assignedTo?: string;
  tags: string[];
  consent: ContactConsentDto;
  notes?: string;
  orders: CreateContactOrderDto[];
}

export interface ContactDto {
  id: string;
  customerType: CustomerType;
  name: string;
  mobile: string;
  email: string | null;
  company: string | null;
  segment: CustomerSegment | null;
  tags: string[];
  lifetimeValue: number;
  createdAt: string;
}
