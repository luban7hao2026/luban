import type {
  AdminDashboardStats,
  AdminUserListItem,
  AdminUserFoodListItem,
  AuthResponse,
  Food,
  FoodImageCandidate,
  PickLog,
  RandomPickResponse,
  User,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const AUTH_TOKEN_KEY = 'random_lunch_auth_token';

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthToken(token: string) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearAuthToken() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    const rawMessage = await response.text();
    let message = rawMessage;
    try {
      const parsed = JSON.parse(rawMessage) as { detail?: string };
      message = parsed.detail || rawMessage;
    } catch {
      message = rawMessage;
    }
    if (response.status === 401) {
      clearAuthToken();
      window.dispatchEvent(new Event('auth:expired'));
    }
    throw new Error(message || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function registerUser(payload: { username: string; password: string }) {
  return request<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loginUser(payload: { username: string; password: string }) {
  return request<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loginAdmin(payload: { username: string; password: string }) {
  return request<AuthResponse>('/auth/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getCurrentUser() {
  return request<User>('/auth/me');
}

export async function changeCurrentPassword(payload: { current_password: string; new_password: string }) {
  return request<User>('/auth/password', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function getAdminUsers() {
  return request<AdminUserListItem[]>('/admin/users');
}

export async function getAdminDashboard() {
  return request<AdminDashboardStats>('/admin/dashboard');
}

export async function updateAdminUserStatus(id: number, isActive: boolean) {
  return request<User>(`/admin/users/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: isActive }),
  });
}

export async function updateAdminUserRole(id: number, role: 'admin' | 'user') {
  return request<User>(`/admin/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
}

export async function resetAdminUserPassword(id: number, newPassword: string) {
  return request<User>(`/admin/users/${id}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ new_password: newPassword }),
  });
}

export async function deleteAdminUser(id: number) {
  return request<void>(`/admin/users/${id}`, { method: 'DELETE' });
}

export async function getAdminDefaultFoods(query = '') {
  const search = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  return request<Food[]>(`/admin/default-foods${search}`);
}

export async function createAdminDefaultFood(payload: {
  name: string;
  image_url?: string | null;
  category?: string | null;
  is_active?: boolean;
}) {
  return request<Food>('/admin/default-foods', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateAdminDefaultFood(
  id: number,
  payload: Partial<Pick<Food, 'name' | 'image_url' | 'category' | 'is_active'>>,
) {
  return request<Food>(`/admin/default-foods/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminDefaultFood(id: number) {
  return request<void>(`/admin/default-foods/${id}`, { method: 'DELETE' });
}

export async function getAdminUserFoods(query = '') {
  const search = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
  return request<AdminUserFoodListItem[]>(`/admin/user-foods${search}`);
}

export async function updateAdminUserFood(
  id: number,
  payload: Partial<Pick<Food, 'name' | 'image_url' | 'category' | 'is_active'>>,
) {
  return request<AdminUserFoodListItem>(`/admin/user-foods/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminUserFood(id: number) {
  return request<void>(`/admin/user-foods/${id}`, { method: 'DELETE' });
}

export async function getFoods() {
  return request<Food[]>('/foods');
}

export async function createFood(payload: {
  name: string;
  image_url?: string | null;
  category?: string | null;
  is_active?: boolean;
}) {
  return request<Food>('/foods', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateFood(id: number, payload: Partial<Pick<Food, 'name' | 'image_url' | 'category' | 'is_active'>>) {
  return request<Food>(`/foods/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteFood(id: number) {
  return request<void>(`/foods/${id}`, { method: 'DELETE' });
}

export async function uploadFoodImage(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  return request<{ image_url: string }>('/foods/upload', {
    method: 'POST',
    body: formData,
  });
}

export async function searchFoodImages(query: string) {
  return request<FoodImageCandidate[]>(`/foods/search-images?q=${encodeURIComponent(query)}&limit=6`);
}

export async function downloadFoodImage(url: string) {
  return request<{ image_url: string }>('/foods/download-image', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export async function pickRandomFood() {
  return request<RandomPickResponse>('/picks/random', { method: 'POST' });
}

export async function getPickLogs(limit = 50) {
  return request<PickLog[]>(`/picks/logs?limit=${limit}`);
}

export async function deletePickLogs(ids: number[]) {
  return request<{ deleted: number }>('/picks/logs/delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}
