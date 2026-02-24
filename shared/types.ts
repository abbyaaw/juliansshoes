export interface Shoe {
  id: number;
  image_path: string;
  image_filename: string;
  type: string | null;
  location: string | null;
  sub_location: string | null;
  brand: string | null;
  model: string | null;
  colorway: string | null;
  size: string | null;
  year: string | null;
  shoe_condition: ShoeCondition | null;
  box_condition: BoxCondition | null;
  my_price: number | null;
  identified: boolean;
  created_at: string;
  updated_at: string;
}

export type ShoeCondition = 'New/DS' | 'Excellent' | 'Good' | 'Fair';
export type BoxCondition = 'Pristine' | 'Damaged' | 'Missing';

export interface PriceSource {
  id: number;
  shoe_id: number;
  source_name: string;
  url: string;
  price: number;
  shoe_condition: ShoeCondition | null;
  box_condition: BoxCondition | null;
  created_at: string;
}

export interface VisionResult {
  brand: string;
  model: string;
  colorway: string;
  size: string | null;
  year: string | null;
  shoe_condition: ShoeCondition;
  confidence: number;
}

export interface PriceResult {
  source_name: string;
  url: string;
  price: number;
  shoe_condition: ShoeCondition;
  box_condition: BoxCondition;
}

export interface CollectionStats {
  total_shoes: number;
  identified_count: number;
  unidentified_count: number;
  priced_count: number;
  unpriced_count: number;
  total_value: number;
  by_type: Record<string, { count: number; value: number }>;
  by_location: Record<string, { count: number; value: number }>;
  by_brand: Record<string, { count: number; value: number }>;
}

export interface ScanProgress {
  total: number;
  completed: number;
  current_file: string;
  status: 'idle' | 'scanning' | 'done' | 'error';
  errors: string[];
}
