export type Gender = "women" | "men" | "kids";

export interface ProductSize {
  size: string;
  inStock: boolean;
  quantity?: number;
}

export interface ProductColor {
  id: string;
  name: string;
  hex: string;
  images: string[];
  sizes: ProductSize[];
}

export interface StoreAvailability {
  storeId: string;
  available: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string;
  description: string;
  composition: string;
  care: string;
  category: string;
  gender: Gender;
  price: number;
  oldPrice?: number;
  colors: ProductColor[];
  stores: StoreAvailability[];
  isNew: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  workingHours: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  whatsapp: string;
  telegram: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  gender: Gender;
  parentId?: string;
}

export interface OrderItem {
  productId: string;
  name: string;
  brand: string;
  color: string;
  size: string;
  price: number;
  quantity: number;
  imageUrl: string;
}

export type PaymentMethod = "card" | "messenger" | "cash";
export type DeliveryType = "pickup" | "delivery";
export type OrderStatus = "new" | "processing" | "completed" | "cancelled";

export interface Order {
  id: string;
  orderNumber: string;
  items: OrderItem[];
  totalAmount: number;
  customer: {
    name: string;
    phone: string;
    email?: string;
    comment?: string;
  };
  delivery: DeliveryType;
  storeId: string;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  key: string;
  productId: string;
  slug: string;
  name: string;
  brand: string;
  colorId: string;
  colorName: string;
  size: string;
  price: number;
  quantity: number;
  imageUrl: string;
}

export interface CatalogFilters {
  sizes: string[];
  brands: string[];
  colors: string[];
  priceMin?: number;
  priceMax?: number;
  sort: "popular" | "price-asc" | "price-desc" | "new";
}
