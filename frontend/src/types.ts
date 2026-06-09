export type Food = {
  id: number;
  name: string;
  image_url: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PickLog = {
  id: number;
  food_id: number;
  picked_at: string;
  food: Food;
};

export type RandomPickResponse = {
  food: Food;
  log: PickLog;
};

export type FoodImageCandidate = {
  title: string;
  url: string;
  thumb_url: string;
  source: string;
};

export type User = {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type AuthResponse = {
  access_token: string;
  token_type: 'bearer';
  user: User;
};

export type AdminUserListItem = {
  id: number;
  username: string;
  created_at: string;
  food_count: number;
  pick_log_count: number;
  is_active: boolean;
};
