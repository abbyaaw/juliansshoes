import type { Shoe, PriceSource, CollectionStats } from '../../../shared/types';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

export interface ShoeFilters {
  search?: string;
  brand?: string;
  type?: string;
  location?: string;
  sub_location?: string;
  status?: string;
  sort?: string;
}

export async function fetchShoes(filters?: ShoeFilters): Promise<Shoe[]> {
  const params = new URLSearchParams();
  if (filters) {
    if (filters.search) params.set('search', filters.search);
    if (filters.brand) params.set('brand', filters.brand);
    if (filters.type) params.set('type', filters.type);
    if (filters.location) params.set('location', filters.location);
    if (filters.status) params.set('status', filters.status);
    if (filters.sort) params.set('sort', filters.sort);
  }
  const query = params.toString();
  return request<Shoe[]>(`/shoes${query ? `?${query}` : ''}`);
}

export interface ShoeDetailResponse {
  shoe: Shoe;
  price_sources: PriceSource[];
}

export async function fetchShoe(id: number): Promise<ShoeDetailResponse> {
  const data = await request<Shoe & { price_sources: PriceSource[] }>(`/shoes/${id}`);
  const { price_sources, ...shoe } = data;
  return { shoe, price_sources: price_sources || [] };
}

export async function fetchStats(): Promise<CollectionStats> {
  return request<CollectionStats>('/shoes/stats');
}

export async function updateShoe(id: number, data: Partial<Shoe>): Promise<Shoe> {
  return request<Shoe>(`/shoes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteShoe(id: number): Promise<void> {
  await request<void>(`/shoes/${id}`, { method: 'DELETE' });
}

export async function startScan(): Promise<{ message: string; new_shoes: number; folders: string[] }> {
  return request('/scan', { method: 'POST' });
}

export function startIdentify(
  shoeId?: number,
  onEvent?: (event: string, data: Record<string, unknown>) => void,
  onDone?: () => void,
  onError?: (err: string) => void
): AbortController {
  const params = shoeId ? `?shoe_id=${shoeId}` : '';
  const url = `${API_BASE}/scan/identify${params}`;
  const controller = new AbortController();

  fetch(url, { method: 'POST', signal: controller.signal })
    .then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) { onError?.('No response body'); return; }
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let currentEvent = 'message';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent?.(currentEvent, data);
            } catch { /* ignore */ }
          }
        }
      }
      onDone?.();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError?.(err.message);
    });

  return controller;
}

export async function uploadPhotos(
  files: File[],
  options?: { type?: string; location?: string; sub_location?: string }
): Promise<{ uploaded: number; shoe_ids: number[]; errors: string[] }> {
  const formData = new FormData();
  files.forEach((f) => formData.append('photos', f));
  if (options?.type) formData.append('type', options.type);
  if (options?.location) formData.append('location', options.location);
  if (options?.sub_location) formData.append('sub_location', options.sub_location);

  const res = await fetch(`${API_BASE}/scan/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Upload failed ${res.status}: ${body}`);
  }
  return res.json();
}

export async function researchPrices(shoeId: number): Promise<{ message: string; sources: PriceSource[] }> {
  const data = await request<{ success: boolean; shoe: Shoe & { price_sources: PriceSource[] }; prices_found: number }>(`/research/${shoeId}`, { method: 'POST' });
  return { message: `Found ${data.prices_found} sources`, sources: data.shoe?.price_sources || [] };
}

export function bulkResearch(
  onEvent?: (event: string, data: Record<string, unknown>) => void,
  onDone?: () => void,
  onError?: (err: string) => void
): AbortController {
  const url = `${API_BASE}/research/bulk`;
  const controller = new AbortController();

  fetch(url, { method: 'POST', signal: controller.signal })
    .then(async (res) => {
      const reader = res.body?.getReader();
      if (!reader) { onError?.('No response body'); return; }
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        let currentEvent = 'message';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              onEvent?.(currentEvent, data);
            } catch { /* ignore */ }
          }
        }
      }
      onDone?.();
    })
    .catch((err) => {
      if (err.name !== 'AbortError') onError?.(err.message);
    });

  return controller;
}

export async function clearPrices(shoeId: number): Promise<void> {
  await request<void>(`/research/${shoeId}/prices`, { method: 'DELETE' });
}

export function exportCSV(): void {
  window.open(`${API_BASE}/export/csv`, '_blank');
}

export function exportJSON(): void {
  window.open(`${API_BASE}/export/json`, '_blank');
}

export async function fetchExportData(): Promise<Record<string, string | number | null>[]> {
  const res = await fetch(`${API_BASE}/export/json`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json();
}

export function getImageUrl(imagePath: string): string {
  return `/images/${encodeURIComponent(imagePath)}`;
}
