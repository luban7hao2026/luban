import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Check,
  LayoutDashboard,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  ImageIcon,
  KeyRound,
  Link,
  LogOut,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  Users,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import {
  changeCurrentPassword,
  clearAuthToken,
  createAdminDefaultFood,
  createAdminUser,
  createFood,
  deleteAdminDefaultFood,
  deleteAdminUserFood,
  deleteAdminUser,
  deleteFood,
  deletePickLogs,
  downloadFoodImage,
  getAdminUsers,
  getAdminDefaultFoods,
  getAdminDashboard,
  getAdminUserFoods,
  getAuthToken,
  getCurrentUser,
  getFoods,
  getPickLogs,
  loginAdmin,
  loginUser,
  pickRandomFood,
  registerUser,
  resetAdminUserPassword,
  searchFoodImages,
  setAuthToken,
  updateAdminUserRole,
  updateAdminUserStatus,
  updateAdminDefaultFood,
  updateAdminUserFood,
  updateFood,
  uploadFoodImage,
} from './api';
import type {
  AdminDashboardStats,
  AdminUserFoodListItem,
  AdminUserListItem,
  Food,
  FoodImageCandidate,
  PickLog,
  User,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000';
const DEFAULT_FOOD_IMAGE = '/default-food.svg';
const DEFAULT_FOOD_IMAGE_RULES = [
  { image: '/food-images/fish.jpg', keywords: ['鱼', '烤鱼', '红烧鱼', '清蒸鱼', 'fish'] },
  { image: '/food-images/rice.jpg', keywords: ['饭', '米饭', '盖饭', '炒饭', 'rice'] },
  { image: '/food-images/noodles.jpg', keywords: ['面', '面条', '拉面', '牛肉面', '拌面', 'noodle'] },
  { image: '/food-images/dumplings.jpg', keywords: ['饺', '饺子', '馄饨', 'dumpling'] },
  { image: '/food-images/hotpot.jpg', keywords: ['火锅', '冒菜', '麻辣烫', 'hotpot', 'hot pot'] },
  { image: '/food-images/chicken.jpg', keywords: ['鸡', '鸡腿', '炸鸡', 'chicken'] },
  { image: '/food-images/beef.jpg', keywords: ['牛', '牛肉', 'beef'] },
  { image: '/food-images/pork.jpg', keywords: ['猪', '猪肉', '排骨', 'pork'] },
  { image: '/food-images/burger.jpg', keywords: ['汉堡', 'burger'] },
  { image: '/food-images/pizza.jpg', keywords: ['披萨', 'pizza'] },
  { image: '/food-images/sushi.jpg', keywords: ['寿司', 'sushi'] },
  { image: '/food-images/vegetables.jpg', keywords: ['菜', '蔬菜', '青菜', '沙拉', 'vegetable', 'salad'] },
  { image: '/food-images/soup.jpg', keywords: ['汤', '粥', 'soup', 'congee'] },
  { image: '/food-images/bbq.jpg', keywords: ['烧烤', '烤串', '串', 'bbq', 'barbecue'] },
];

const WHEEL_COLORS = [
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
  '#84cc16',
  '#f59e0b',
  '#ef4444',
  '#a855f7',
  '#06b6d4',
  '#10b981',
  '#f97316',
];

const THEME_OPTIONS = [
  { id: 'glass', title: '毛玻璃渐变', subtitle: 'Glassmorphism' },
  { id: 'aurora', title: '极光蓝紫', subtitle: 'Aurora' },
  { id: 'sunset', title: '暖橙黄昏', subtitle: 'Sunset' },
  { id: 'dark', title: '暗色极简', subtitle: 'Dark Minimal' },
  { id: 'bento', title: 'Bento 奶油', subtitle: 'Bento Cream' },
] as const;

const PICK_LOG_LIMIT = 50;
const LOGS_PER_PAGE = 5;
const FOODS_PER_PAGE = 6;
const ADMIN_TABLE_PAGE_SIZE = 6;

type ThemeId = (typeof THEME_OPTIONS)[number]['id'];
type ImageMode = 'default' | 'manual';
type FieldErrors = {
  name?: string;
  category?: string;
  image?: string;
};

const emptyForm = {
  name: '',
  category: '',
};

const emptyAdminFoodForm = {
  name: '',
  category: '',
  image_url: '',
  is_active: true,
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getImageSrc(imageUrl?: string | null) {
  if (!imageUrl) return DEFAULT_FOOD_IMAGE;
  if (imageUrl.startsWith('/uploads/')) return `${API_BASE}${imageUrl}`;
  return imageUrl;
}

function getDefaultFoodImage(name: string, category: string) {
  const text = `${name} ${category}`.trim().toLowerCase();
  if (!text) return DEFAULT_FOOD_IMAGE;

  const matched = DEFAULT_FOOD_IMAGE_RULES.find((rule) =>
    rule.keywords.some((keyword) => text.includes(keyword.toLowerCase())),
  );

  return matched?.image ?? DEFAULT_FOOD_IMAGE;
}

function getInitialSelectedFood(foods: Food[]) {
  return (
    foods.find((food) => food.name.trim() === '牛肉') ??
    foods.find((food) => food.name.includes('牛肉')) ??
    foods[0] ??
    null
  );
}

function FoodImage({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      onError={(event) => {
        event.currentTarget.src = DEFAULT_FOOD_IMAGE;
      }}
    />
  );
}

function polarToPoint(center: number, radius: number, angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: center + radius * Math.cos(radians),
    y: center + radius * Math.sin(radians),
  };
}

function describeSector(center: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToPoint(center, radius, startAngle);
  const end = polarToPoint(center, radius, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;

  return [
    `M ${center} ${center}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ');
}

function WheelText({ x, y, angle, name }: { x: number; y: number; angle: number; name: string }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="middle"
      transform={`rotate(${angle > 90 && angle < 270 ? angle + 180 : angle} ${x} ${y})`}
    >
      {name.length > 5 ? `${name.slice(0, 5)}...` : name}
    </text>
  );
}

function LunchWheel({ foods, pointerAngle }: { foods: Food[]; pointerAngle: number }) {
  const size = 420;
  const center = size / 2;
  const radius = 192;

  if (foods.length === 0) {
    return (
      <div className="wheel-empty">
        <UtensilsCrossed size={26} />
        <strong>先添加几样食物</strong>
        <span>午餐转盘会自动亮起来</span>
      </div>
    );
  }

  return (
    <div className="wheel-wrap">
      <svg className="lunch-wheel" viewBox={`0 0 ${size} ${size}`} role="img" aria-label="随机午餐转盘">
        <defs>
          <filter id="wheelGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="16" stdDeviation="14" floodColor="#000000" floodOpacity="0.28" />
          </filter>
          {foods.map((food, index) => {
            const start = (360 / foods.length) * index;
            const end = (360 / foods.length) * (index + 1);
            return (
              <clipPath key={food.id} id={`wheel-sector-${food.id}`}>
                <path d={describeSector(center, radius, start, end)} />
              </clipPath>
            );
          })}
        </defs>

        <circle cx={center} cy={center} r={radius + 8} className="wheel-ring" filter="url(#wheelGlow)" />
        {foods.map((food, index) => {
          const start = (360 / foods.length) * index;
          const end = (360 / foods.length) * (index + 1);
          const mid = (start + end) / 2;
          const labelPoint = polarToPoint(center, radius * 0.64, mid);

          return (
            <g key={food.id}>
              <path
                d={describeSector(center, radius, start, end)}
                fill={WHEEL_COLORS[index % WHEEL_COLORS.length]}
                stroke="rgba(255,255,255,0.38)"
                strokeWidth="2"
              />
              <image
                href={getImageSrc(food.image_url)}
                x="18"
                y="18"
                width={size - 36}
                height={size - 36}
                preserveAspectRatio="xMidYMid slice"
                clipPath={`url(#wheel-sector-${food.id})`}
                opacity="0.35"
              />
              <path
                d={describeSector(center, radius, start, end)}
                fill="transparent"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="2"
              />
              <WheelText x={labelPoint.x} y={labelPoint.y} angle={mid} name={food.name} />
            </g>
          );
        })}
        <circle cx={center} cy={center} r="50" className="wheel-center" />
        <text x={center} y={center - 8} textAnchor="middle" className="wheel-center-title">
          Lunch
        </text>
        <text x={center} y={center + 18} textAnchor="middle" className="wheel-center-count">
          {foods.length} 项
        </text>
      </svg>
      <div className="wheel-needle" style={{ transform: `rotate(${pointerAngle}deg)` }} />
      <div className="wheel-hub" />
    </div>
  );
}

function LunchApp({ currentUser, onLogout }: { currentUser: User; onLogout: () => void }) {
  const [theme, setTheme] = useState<ThemeId>('glass');
  const [foods, setFoods] = useState<Food[]>([]);
  const [logs, setLogs] = useState<PickLog[]>([]);
  const [selectedLogIds, setSelectedLogIds] = useState<number[]>([]);
  const [logPage, setLogPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [foodPage, setFoodPage] = useState(1);
  const [searchMenuOpen, setSearchMenuOpen] = useState(false);
  const [searchMenuTab, setSearchMenuTab] = useState<'foods' | 'categories'>('foods');
  const [activeOnly, setActiveOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [rollingId, setRollingId] = useState<number | null>(null);
  const [wheelAngle, setWheelAngle] = useState(0);
  const [selected, setSelected] = useState<Food | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFood, setEditingFood] = useState<Food | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imageMode, setImageMode] = useState<ImageMode>('default');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [remoteImageUrl, setRemoteImageUrl] = useState('');
  const [selectedSearchUrl, setSelectedSearchUrl] = useState('');
  const [imageCandidates, setImageCandidates] = useState<FoodImageCandidate[]>([]);
  const [imageSearching, setImageSearching] = useState(false);
  const [imageSearchError, setImageSearchError] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const rollTimer = useRef<number | null>(null);
  const wheelAngleRef = useRef(0);
  const searchControlRef = useRef<HTMLDivElement | null>(null);

  const filePreviewUrl = useMemo(() => {
    if (!imageFile) return '';
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  const previewImage = useMemo(() => {
    if (imageMode === 'default') return getDefaultFoodImage(form.name, form.category);
    if (filePreviewUrl) return filePreviewUrl;
    if (remoteImageUrl.trim()) return remoteImageUrl.trim();
    if (editingFood?.image_url) return getImageSrc(editingFood.image_url);
    return getDefaultFoodImage(form.name, form.category);
  }, [editingFood, filePreviewUrl, form.category, form.name, imageMode, remoteImageUrl]);

  const filteredFoods = useMemo(() => {
    const query = search.trim().toLowerCase();
    return foods.filter((food) => {
      const matchesSearch =
        !query ||
        food.name.toLowerCase().includes(query) ||
        (food.category ?? '').toLowerCase().includes(query);
      const matchesActive = !activeOnly || food.is_active;
      return matchesSearch && matchesActive;
    });
  }, [foods, search, activeOnly]);

  const totalFoodPages = Math.max(1, Math.ceil(filteredFoods.length / FOODS_PER_PAGE));
  const currentFoodPage = Math.min(foodPage, totalFoodPages);
  const pagedFoods = useMemo(() => {
    const start = (currentFoodPage - 1) * FOODS_PER_PAGE;
    return filteredFoods.slice(start, start + FOODS_PER_PAGE);
  }, [currentFoodPage, filteredFoods]);

  const activeFoods = useMemo(() => foods.filter((food) => food.is_active), [foods]);

  const categories = useMemo(() => {
    return Array.from(
      new Set(
        foods
          .map((food) => food.category?.trim())
          .filter((category): category is string => Boolean(category)),
      ),
    ).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  }, [foods]);

  const totalLogPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
  const currentLogPage = Math.min(logPage, totalLogPages);
  const pagedLogs = useMemo(() => {
    const start = (currentLogPage - 1) * LOGS_PER_PAGE;
    return logs.slice(start, start + LOGS_PER_PAGE);
  }, [currentLogPage, logs]);
  const pagedLogIds = useMemo(() => pagedLogs.map((log) => log.id), [pagedLogs]);
  const selectedLogIdSet = useMemo(() => new Set(selectedLogIds), [selectedLogIds]);
  const allPagedLogsSelected =
    pagedLogIds.length > 0 && pagedLogIds.every((id) => selectedLogIdSet.has(id));

  const logRangeStart = logs.length === 0 ? 0 : (currentLogPage - 1) * LOGS_PER_PAGE + 1;
  const logRangeEnd = Math.min(currentLogPage * LOGS_PER_PAGE, logs.length);

  async function refresh() {
    setLoading(true);
    try {
      const [foodData, logData] = await Promise.all([getFoods(), getPickLogs(PICK_LOG_LIMIT)]);
      setFoods(foodData);
      setLogs(logData);
      if (!selected && foodData.length > 0) {
        setSelected(getInitialSelectedFood(foodData));
      }
    } catch {
      setError('无法连接服务，请确认后端已启动。');
    } finally {
      setLoading(false);
    }
  }

  function updateWheelAngle(angle: number) {
    wheelAngleRef.current = angle;
    setWheelAngle(angle);
  }

  function getWheelTargetAngle(foodId: number, foodList: Food[]) {
    const index = foodList.findIndex((food) => food.id === foodId);
    if (index < 0 || foodList.length === 0) return wheelAngleRef.current;

    const sectorAngle = 360 / foodList.length;
    const targetBase = index * sectorAngle + sectorAngle / 2;
    const current = wheelAngleRef.current;
    const rounds = Math.ceil((current - targetBase) / 360) + 3;
    return targetBase + rounds * 360;
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    setLogPage((page) => Math.min(page, totalLogPages));
  }, [totalLogPages]);

  useEffect(() => {
    setFoodPage(1);
  }, [activeOnly, search]);

  useEffect(() => {
    setFoodPage((page) => Math.min(page, totalFoodPages));
  }, [totalFoodPages]);

  useEffect(() => {
    const liveLogIds = new Set(logs.map((log) => log.id));
    setSelectedLogIds((ids) => ids.filter((id) => liveLogIds.has(id)));
  }, [logs]);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!searchControlRef.current?.contains(event.target as Node)) {
        setSearchMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    return () => {
      if (rollTimer.current) {
        window.clearInterval(rollTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const query = form.name.trim();
    if (!modalOpen || query.length === 0) {
      setImageCandidates([]);
      setImageSearching(false);
      setImageSearchError('');
      return;
    }

    let cancelled = false;
    setImageSearching(true);
    setImageSearchError('');
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchFoodImages(query);
        if (!cancelled) {
          setImageCandidates(results);
          setImageSearchError(results.length > 0 ? '' : '暂时没有合适图片');
        }
      } catch {
        if (!cancelled) {
          setImageCandidates([]);
          setImageSearchError('联网搜图失败');
        }
      } finally {
        if (!cancelled) {
          setImageSearching(false);
        }
      }
    }, 550);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [form.name, modalOpen]);

  function resetModal() {
    setEditingFood(null);
    setForm(emptyForm);
    setImageMode('default');
    setImageFile(null);
    setRemoteImageUrl('');
    setSelectedSearchUrl('');
    setImageCandidates([]);
    setImageSearching(false);
    setImageSearchError('');
    setError('');
    setFieldErrors({});
  }

  function closeModal() {
    resetModal();
    setModalOpen(false);
  }

  function openCreateModal() {
    resetModal();
    setModalOpen(true);
  }

  function openEditModal(food: Food) {
    setEditingFood(food);
    setForm({
      name: food.name,
      category: food.category ?? '',
    });
    setImageMode(food.image_url?.startsWith('/food-images/') || !food.image_url ? 'default' : 'manual');
    setImageFile(null);
    setRemoteImageUrl('');
    setSelectedSearchUrl('');
    setImageCandidates([]);
    setImageSearching(false);
    setImageSearchError('');
    setError('');
    setFieldErrors({});
    setModalOpen(true);
  }

  function validateForm() {
    const nextErrors: FieldErrors = {};
    const name = form.name.trim();
    const category = form.category.trim();
    const duplicate = foods.some(
      (food) => food.id !== editingFood?.id && food.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (!name) {
      nextErrors.name = '食物名称不能为空。';
    } else if (name.length > 30) {
      nextErrors.name = '食物名称最多 30 个字。';
    } else if (!/[\p{Script=Han}a-zA-Z]/u.test(name)) {
      nextErrors.name = '名称至少包含中文或英文字母。';
    } else if (/[<>[\]{}]/.test(name)) {
      nextErrors.name = '名称不要包含特殊符号。';
    } else if (duplicate) {
      nextErrors.name = '这个食物已经存在了。';
    }

    if (category.length > 16) {
      nextErrors.category = '分类最多 16 个字。';
    } else if (category && !/[\p{Script=Han}a-zA-Z]/u.test(category)) {
      nextErrors.category = '分类至少包含中文或英文字母。';
    } else if (/[<>[\]{}]/.test(category)) {
      nextErrors.category = '分类不要包含特殊符号。';
    }

    if (imageMode === 'manual') {
      if (imageFile && imageFile.size > 8 * 1024 * 1024) {
        nextErrors.image = '本地图片不能超过 8MB。';
      }

      if (remoteImageUrl.trim()) {
        try {
          const parsed = new URL(remoteImageUrl.trim());
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            nextErrors.image = '图片链接必须以 http 或 https 开头。';
          }
        } catch {
          nextErrors.image = '图片链接格式不正确。';
        }
      }
    }

    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleImageSearchRetry() {
    const query = form.name.trim();
    if (!query || imageSearching) return;

    setImageSearching(true);
    setImageSearchError('');
    try {
      const results = await searchFoodImages(query);
      setImageCandidates(results);
      setImageSearchError(results.length > 0 ? '' : '暂时没有合适图片');
    } catch {
      setImageCandidates([]);
      setImageSearchError('联网搜图失败');
    } finally {
      setImageSearching(false);
    }
  }

  async function handlePick() {
    if (busy || activeFoods.length === 0) return;

    setBusy(true);
    setError('');
    const wheelFoods = activeFoods;
    let index = 0;
    updateWheelAngle(wheelAngleRef.current + 860 + Math.random() * 360);
    rollTimer.current = window.setInterval(() => {
      setRollingId(wheelFoods[index % wheelFoods.length].id);
      index += 1;
    }, 80);

    window.setTimeout(async () => {
      if (rollTimer.current) {
        window.clearInterval(rollTimer.current);
        rollTimer.current = null;
      }

      try {
        const result = await pickRandomFood();
        setSelected(result.food);
        setRollingId(result.food.id);
        updateWheelAngle(getWheelTargetAngle(result.food.id, wheelFoods));
        const [freshFoods, freshLogs] = await Promise.all([getFoods(), getPickLogs(PICK_LOG_LIMIT)]);
        setFoods(freshFoods);
        setLogs(freshLogs);
        setLogPage(1);
        window.setTimeout(() => setBusy(false), 1150);
      } catch (err) {
        setBusy(false);
        setError(err instanceof Error ? err.message : '抽选失败，请稍后重试。');
      }
    }, 900);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    if (!validateForm()) return;

    setSubmitting(true);
    setError('');
    try {
      let imageUrl = editingFood?.image_url ?? getDefaultFoodImage(form.name, form.category);

      if (imageMode === 'default') {
        imageUrl = getDefaultFoodImage(form.name, form.category);
      } else {
        if (imageFile) {
          const uploaded = await uploadFoodImage(imageFile);
          imageUrl = uploaded.image_url;
        } else if (remoteImageUrl.trim()) {
          const downloaded = await downloadFoodImage(remoteImageUrl.trim());
          imageUrl = downloaded.image_url;
        }
      }

      const payload = {
        name: form.name.trim(),
        category: form.category.trim() || null,
        image_url: imageUrl,
        is_active: true,
      };

      const savedFood = editingFood ? await updateFood(editingFood.id, payload) : await createFood(payload);

      resetModal();
      setModalOpen(false);
      if (selected?.id === savedFood.id) {
        setSelected(savedFood);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(food: Food) {
    try {
      setError('');
      await updateFood(food.id, { is_active: !food.is_active });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '更新失败，请稍后重试。');
    }
  }

  function toggleLogSelected(logId: number) {
    setSelectedLogIds((ids) =>
      ids.includes(logId) ? ids.filter((id) => id !== logId) : [...ids, logId],
    );
  }

  function togglePagedLogsSelected() {
    setSelectedLogIds((ids) => {
      if (allPagedLogsSelected) {
        return ids.filter((id) => !pagedLogIds.includes(id));
      }

      return Array.from(new Set([...ids, ...pagedLogIds]));
    });
  }

  async function removeSelectedLogs() {
    if (selectedLogIds.length === 0) return;
    if (!window.confirm(`删除选中的 ${selectedLogIds.length} 条抽选记录？`)) return;

    try {
      setError('');
      await deletePickLogs(selectedLogIds);
      setSelectedLogIds([]);
      const freshLogs = await getPickLogs(PICK_LOG_LIMIT);
      setLogs(freshLogs);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除抽选记录失败，请稍后重试。');
    }
  }

  async function removeFood(food: Food) {
    if (!window.confirm(`删除「${food.name}」？`)) return;

    try {
      setError('');
      await deleteFood(food.id);
      if (selected?.id === food.id) {
        setSelected(null);
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败，请稍后重试。');
    }
  }

  const selectedCategory = selected?.category || '未分类';

  return (
    <div className={`page theme-${theme}`}>
      <div className="theme-switcher" aria-label="主题选择">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            className={theme === option.id ? 'active' : ''}
            onClick={() => setTheme(option.id)}
          >
            <strong>{option.title}</strong>
            <span>{option.subtitle}</span>
          </button>
        ))}
      </div>

      <div className="app-shell">
        <header className="topbar">
          <div>
            <p className="eyebrow">Random Lunch</p>
            <h1>随机午餐幸运儿</h1>
          </div>
          <div className="topbar-actions">
            <div className="user-chip" title={currentUser.username}>
              {currentUser.username}
            </div>
            <button className="icon-text-button" type="button" onClick={onLogout}>
              <LogOut size={16} />
              Logout
            </button>
          <button className="primary-button" onClick={openCreateModal}>
            <Plus size={18} />
            添加食物
          </button>
          </div>
        </header>

        <main className="dashboard">
          <section className="wheel-card panel-card">
            <LunchWheel foods={activeFoods} pointerAngle={wheelAngle} />
          </section>

          <section className="result-stack">
            <button className="roll-button" onClick={handlePick} disabled={busy || activeFoods.length === 0}>
              <UtensilsCrossed size={20} />
              {busy ? '正在挑选' : '帮我选一个'}
            </button>

            <div className={`winner-card panel-card ${rollingId ? 'is-rolling' : ''}`}>
              {selected ? (
                <>
                  <div className="card-label success">
                    <Check size={14} />
                    最近结果
                  </div>
                  <div className="winner-layout">
                    <div className="winner-media">
                      <FoodImage src={getImageSrc(selected.image_url)} alt={selected.name} />
                    </div>
                    <div className="winner-copy">
                      <span>{selectedCategory}</span>
                      <strong>{selected.name}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className="winner-empty">
                  <RefreshCcw size={20} />
                  还没有结果
                </div>
              )}
            </div>

            <aside className="history-card panel-card">
              <div className="history-header">
                <div className="card-label">
                  <Clock3 size={14} />
                  最近抽选
                </div>
                <div className="history-actions">
                  {logs.length > 0 && (
                    <button
                      type="button"
                      className={`select-page-logs ${allPagedLogsSelected ? 'active' : ''}`}
                      aria-pressed={allPagedLogsSelected}
                      onClick={togglePagedLogsSelected}
                    >
                      <span className="page-select-box">
                        {allPagedLogsSelected && <Check size={10} />}
                      </span>
                      <span>本页</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="danger-action-button"
                    disabled={selectedLogIds.length === 0}
                    onClick={removeSelectedLogs}
                  >
                    <Trash2 size={14} />
                    删除{selectedLogIds.length > 0 ? ` ${selectedLogIds.length}` : ''}
                  </button>
                  {logs.length > LOGS_PER_PAGE && (
                    <div className="pagination-controls" aria-label="最近抽选分页">
                      <span>
                        当前第 {currentLogPage} 页，{logRangeStart}-{logRangeEnd} 条记录，共 {logs.length} 条
                      </span>
                      <button
                        type="button"
                        title="上一页"
                        disabled={currentLogPage === 1}
                        onClick={() => setLogPage((page) => Math.max(1, page - 1))}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        type="button"
                        title="下一页"
                        disabled={currentLogPage === totalLogPages}
                        onClick={() => setLogPage((page) => Math.min(totalLogPages, page + 1))}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="log-list">
                {logs.length === 0 ? (
                  <div className="state-copy small">还没有抽选记录。</div>
                ) : (
                  pagedLogs.map((log) => (
                    <div key={log.id} className={`log-item ${selectedLogIdSet.has(log.id) ? 'selected' : ''}`}>
                      <label className="log-select">
                        <input
                          type="checkbox"
                          checked={selectedLogIdSet.has(log.id)}
                          onChange={() => toggleLogSelected(log.id)}
                        />
                        <strong>{log.food.name}</strong>
                      </label>
                      <span>{formatTime(log.picked_at)}</span>
                    </div>
                  ))
                )}
              </div>
            </aside>
          </section>

          <section className="library-section">
            <div className="toolbar panel-card">
              <div className="search-control" ref={searchControlRef}>
                <label className="searchbox">
                  <Search size={17} />
                  <input
                    type="text"
                    placeholder="搜索食物或分类"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className={`search-menu-button ${searchMenuOpen ? 'open' : ''}`}
                  title="打开筛选列表"
                  onClick={() => setSearchMenuOpen((open) => !open)}
                >
                  <ChevronDown size={18} />
                </button>

                {searchMenuOpen && (
                  <div className="search-dropdown">
                    <div className="search-tabs">
                      <button
                        type="button"
                        className={searchMenuTab === 'foods' ? 'active' : ''}
                        onClick={() => setSearchMenuTab('foods')}
                      >
                        食物
                      </button>
                      <button
                        type="button"
                        className={searchMenuTab === 'categories' ? 'active' : ''}
                        onClick={() => setSearchMenuTab('categories')}
                      >
                        分类
                      </button>
                    </div>

                    <div className="search-menu-list">
                      {searchMenuTab === 'foods' ? (
                        foods.length > 0 ? (
                          foods.map((food) => (
                            <button
                              type="button"
                              key={food.id}
                              onClick={() => {
                                setSearch(food.name);
                                setSearchMenuOpen(false);
                              }}
                            >
                              <strong>{food.name}</strong>
                              <span>{food.category || '未分类'}</span>
                            </button>
                          ))
                        ) : (
                          <div className="search-menu-empty">还没有食物。</div>
                        )
                      ) : categories.length > 0 ? (
                        categories.map((category) => (
                          <button
                            type="button"
                            key={category}
                            onClick={() => {
                              setSearch(category);
                              setSearchMenuOpen(false);
                            }}
                          >
                            <strong>{category}</strong>
                            <span>{foods.filter((food) => food.category === category).length} 个食物</span>
                          </button>
                        ))
                      ) : (
                        <div className="search-menu-empty">还没有分类。</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="toolbar-actions">
                <label className="toggle">
                  <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} />
                  <span>只看可抽选</span>
                </label>
                {filteredFoods.length > FOODS_PER_PAGE && (
                  <div className="pagination-controls food-pagination" aria-label="食物列表分页">
                    <span>
                      第 {currentFoodPage} 页，共 {totalFoodPages} 页
                    </span>
                    <button
                      type="button"
                      title="上一页"
                      disabled={currentFoodPage === 1}
                      onClick={() => setFoodPage((page) => Math.max(1, page - 1))}
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      type="button"
                      title="下一页"
                      disabled={currentFoodPage === totalFoodPages}
                      onClick={() => setFoodPage((page) => Math.min(totalFoodPages, page + 1))}
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {error && <div className="error-copy">{error}</div>}

            <div className="food-grid">
              {loading ? (
                <div className="state-copy">加载中...</div>
              ) : filteredFoods.length === 0 ? (
                <div className="state-copy">先加几样食物，午餐才有得选。</div>
              ) : (
                pagedFoods.map((food) => (
                  <article key={food.id} className={`food-card ${food.is_active ? '' : 'disabled'}`}>
                    <button className="food-image" type="button" onClick={() => setSelected(food)}>
                      <FoodImage src={getImageSrc(food.image_url)} alt={food.name} />
                    </button>
                    <div className="food-body">
                      <div>
                        <h3>{food.name}</h3>
                        <p>{food.category || '未分类'}</p>
                      </div>
                      <div className="food-status">
                        <span className={food.is_active ? 'status-pill active' : 'status-pill'}>
                          {food.is_active ? '可抽选' : '已停用'}
                        </span>
                      </div>
                      <div className="food-actions">
                        <button className="icon-text-button" onClick={() => toggleActive(food)}>
                          {food.is_active ? <EyeOff size={15} /> : <Eye size={15} />}
                          {food.is_active ? '停用' : '启用'}
                        </button>
                        <button className="icon-text-button" onClick={() => openEditModal(food)}>
                          <Pencil size={15} />
                          编辑
                        </button>
                        <button className="icon-text-button danger" onClick={() => removeFood(food)}>
                          <Trash2 size={15} />
                          删除
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        </main>
      </div>

      {modalOpen && (
        <div className="modal-backdrop" onClick={closeModal}>
          <form className="modal panel-card" onSubmit={handleSubmit} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">{editingFood ? 'Edit Food' : 'New Food'}</p>
                <h2>{editingFood ? '编辑食物' : '添加食物'}</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeModal}>
                <X size={16} />
              </button>
            </div>

            <label className="field">
              <span>名称</span>
              <input
                value={form.name}
                onChange={(e) => {
                  setForm({ ...form, name: e.target.value });
                  setFieldErrors((errors) => ({ ...errors, name: undefined }));
                }}
                placeholder="比如：牛肉面"
                autoFocus
              />
              {fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}
            </label>

            <label className="field">
              <span>分类</span>
              <input
                value={form.category}
                onChange={(e) => {
                  setForm({ ...form, category: e.target.value });
                  setFieldErrors((errors) => ({ ...errors, category: undefined }));
                }}
                placeholder="比如：面食"
              />
              {fieldErrors.category && <small className="field-error">{fieldErrors.category}</small>}
            </label>

            <div className="field">
              <span>图片</span>
              <div className="image-mode-tabs" role="tablist" aria-label="图片选择方式">
                <button
                  type="button"
                  className={imageMode === 'default' ? 'active' : ''}
                  onClick={() => {
                    setImageMode('default');
                    setImageFile(null);
                    setRemoteImageUrl('');
                    setSelectedSearchUrl('');
                  }}
                >
                  <ImageIcon size={16} />
                  默认
                </button>
                <button
                  type="button"
                  className={imageMode === 'manual' ? 'active' : ''}
                  onClick={() => setImageMode('manual')}
                >
                  <UploadCloud size={16} />
                  手动
                </button>
              </div>
            </div>

            <div className="image-picker">
              <div className="image-preview">
                <FoodImage src={previewImage} alt="食物图片预览" />
              </div>

              {imageMode === 'default' ? (
                <div className="helper-panel">
                  <Sparkles size={18} />
                  <span>默认图片</span>
                </div>
              ) : (
                <div className="manual-image-fields">
                  <label className="upload-drop">
                    <UploadCloud size={18} />
                    <span>{imageFile ? imageFile.name : '选择本地图片'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        setImageFile(e.target.files?.[0] ?? null);
                        setFieldErrors((errors) => ({ ...errors, image: undefined }));
                        if (e.target.files?.[0]) {
                          setRemoteImageUrl('');
                          setSelectedSearchUrl('');
                        }
                      }}
                    />
                  </label>

                  <label className="field compact">
                    <span>
                      <Link size={14} />
                      图片链接
                    </span>
                    <input
                      type="url"
                      value={remoteImageUrl}
                      onChange={(e) => {
                        setRemoteImageUrl(e.target.value);
                        setSelectedSearchUrl('');
                        setFieldErrors((errors) => ({ ...errors, image: undefined }));
                        if (e.target.value.trim()) setImageFile(null);
                      }}
                      placeholder="https://example.com/food.jpg"
                    />
                  </label>
                </div>
              )}
            </div>
            {fieldErrors.image && <small className="field-error">{fieldErrors.image}</small>}

            {form.name.trim() && (
              <div className="image-search-panel">
                <div className="image-search-title">
                  <span>自动搜图</span>
                  <small>{imageSearching ? '搜索中...' : imageCandidates.length > 0 ? '可选图片' : '暂无候选'}</small>
                </div>
                {imageCandidates.length > 0 && (
                  <div className="image-candidates">
                    {imageCandidates.map((candidate) => (
                      <button
                        type="button"
                        key={candidate.url}
                        className={selectedSearchUrl === candidate.url ? 'selected' : ''}
                        title={candidate.title}
                        onClick={() => {
                          setImageMode('manual');
                          setImageFile(null);
                          setRemoteImageUrl(candidate.url);
                          setSelectedSearchUrl(candidate.url);
                        }}
                      >
                        <img src={candidate.thumb_url} alt={candidate.title} />
                      </button>
                    ))}
                  </div>
                )}
                {imageSearchError && (
                  <div className="image-search-error">
                    <span>{imageSearchError}</span>
                    <button type="button" onClick={handleImageSearchRetry} disabled={imageSearching}>
                      重试
                    </button>
                  </div>
                )}
              </div>
            )}

            {error && <div className="error-copy">{error}</div>}

            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeModal}>
                取消
              </button>
              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? '保存中...' : editingFood ? '更新' : '保存'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function AuthScreen({
  adminOnly = false,
  consoleLogin = false,
  onAuthenticated,
}: {
  adminOnly?: boolean;
  consoleLogin?: boolean;
  onAuthenticated: (user: User) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      setError('Please enter a username and password.');
      return;
    }

    if (mode === 'register' && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    setError('');
    setNotice('');
    try {
      if (!adminOnly && !consoleLogin && mode === 'register') {
        await registerUser({ username: trimmedUsername, password });
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setNotice('Registration succeeded. Please sign in.');
        return;
      }

      const auth = adminOnly
        ? await loginAdmin({ username: trimmedUsername, password })
        : await loginUser({ username: trimmedUsername, password });
      setAuthToken(auth.access_token);
      onAuthenticated(auth.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode: 'login' | 'register') {
    setMode(adminOnly || consoleLogin ? 'login' : nextMode);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmPassword('');
  }

  return (
    <div className="auth-page">
      <form className="auth-panel" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">{adminOnly || consoleLogin ? 'Control Console' : 'Random Lunch'}</p>
          <h1>{adminOnly || consoleLogin ? 'Console sign in' : mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        </div>

        <label className="field">
          <span>Username</span>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
          />
        </label>

        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>

        {!adminOnly && !consoleLogin && mode === 'register' && (
          <label className="field">
            <span>Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
          </label>
        )}

        {notice && <div className="success-copy">{notice}</div>}
        {error && <div className="error-copy">{error}</div>}

        <button className="primary-button auth-submit" type="submit" disabled={submitting}>
          {submitting ? 'Working...' : adminOnly || consoleLogin ? 'Sign in' : mode === 'login' ? 'Sign in' : 'Register'}
        </button>

        {!adminOnly && !consoleLogin && (
          <button
            className="auth-link"
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
          >
            {mode === 'login' ? 'Create an account' : 'Back to sign in'}
          </button>
        )}
      </form>
    </div>
  );
}

function AdminShell({ currentUser, onLogout }: { currentUser: User; onLogout: () => void }) {
  const isAdmin = currentUser.role === 'admin' && currentUser.is_active;
  const [dashboard, setDashboard] = useState<AdminDashboardStats | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState('');
  const [usersOpen, setUsersOpen] = useState(false);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [actingUserId, setActingUserId] = useState<number | null>(null);
  const [foodsOpen, setFoodsOpen] = useState(false);
  const [permissionsOpen, setPermissionsOpen] = useState(false);
  const [foodScope, setFoodScope] = useState<'default' | 'user'>('default');
  const [foodView, setFoodView] = useState<'default' | 'create'>('default');
  const [adminFoods, setAdminFoods] = useState<Food[]>([]);
  const [adminUserFoods, setAdminUserFoods] = useState<AdminUserFoodListItem[]>([]);
  const [foodSearch, setFoodSearch] = useState('');
  const [userFoodSearch, setUserFoodSearch] = useState('');
  const [selectedUserFoodUserId, setSelectedUserFoodUserId] = useState<number | null>(null);
  const [adminUsersPage, setAdminUsersPage] = useState(1);
  const [adminFoodsPage, setAdminFoodsPage] = useState(1);
  const [adminPermissionsPage, setAdminPermissionsPage] = useState(1);
  const [foodLoading, setFoodLoading] = useState(false);
  const [foodError, setFoodError] = useState('');
  const [foodSubmitting, setFoodSubmitting] = useState(false);
  const [editingDefaultFood, setEditingDefaultFood] = useState<Food | AdminUserFoodListItem | null>(null);
  const [foodForm, setFoodForm] = useState(emptyAdminFoodForm);
  const [foodImageFile, setFoodImageFile] = useState<File | null>(null);
  const [accountError, setAccountError] = useState('');
  const [accountSubmitting, setAccountSubmitting] = useState(false);
  const [ownPasswordOpen, setOwnPasswordOpen] = useState(false);
  const [ownPasswordForm, setOwnPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: '',
  });
  const [userCreateOpen, setUserCreateOpen] = useState(false);
  const [userCreateForm, setUserCreateForm] = useState<{
    username: string;
    role: 'admin' | 'user';
    password: string;
    confirm_password: string;
  }>({
    username: '',
    role: 'user',
    password: '',
    confirm_password: '',
  });
  const [roleEditingUser, setRoleEditingUser] = useState<AdminUserListItem | null>(null);
  const [roleValue, setRoleValue] = useState<'admin' | 'user'>('user');
  const [passwordResetUser, setPasswordResetUser] = useState<AdminUserListItem | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const adminFoodPreviewUrl = useMemo(() => {
    if (!foodImageFile) return '';
    return URL.createObjectURL(foodImageFile);
  }, [foodImageFile]);
  const adminFoodPreviewImage = adminFoodPreviewUrl || (foodForm.image_url ? getImageSrc(foodForm.image_url) : DEFAULT_FOOD_IMAGE);
  const selectedUserFoodUser = useMemo(
    () => users.find((user) => user.id === selectedUserFoodUserId) ?? null,
    [selectedUserFoodUserId, users],
  );
  const visibleUserFoods = useMemo(() => {
    if (selectedUserFoodUserId === null) return [];
    return adminUserFoods.filter((food) => food.user_id === selectedUserFoodUserId);
  }, [adminUserFoods, selectedUserFoodUserId]);
  const totalAdminUsersPages = Math.max(1, Math.ceil(users.length / ADMIN_TABLE_PAGE_SIZE));
  const currentAdminUsersPage = Math.min(adminUsersPage, totalAdminUsersPages);
  const pagedAdminUsers = useMemo(() => {
    const start = (currentAdminUsersPage - 1) * ADMIN_TABLE_PAGE_SIZE;
    return users.slice(start, start + ADMIN_TABLE_PAGE_SIZE);
  }, [currentAdminUsersPage, users]);
  const totalAdminPermissionsPages = Math.max(1, Math.ceil(users.length / ADMIN_TABLE_PAGE_SIZE));
  const currentAdminPermissionsPage = Math.min(adminPermissionsPage, totalAdminPermissionsPages);
  const pagedAdminPermissionUsers = useMemo(() => {
    const start = (currentAdminPermissionsPage - 1) * ADMIN_TABLE_PAGE_SIZE;
    return users.slice(start, start + ADMIN_TABLE_PAGE_SIZE);
  }, [currentAdminPermissionsPage, users]);
  const adminFoodRows = foodScope === 'default' ? adminFoods : visibleUserFoods;
  const totalAdminFoodPages = Math.max(1, Math.ceil(adminFoodRows.length / ADMIN_TABLE_PAGE_SIZE));
  const currentAdminFoodPage = Math.min(adminFoodsPage, totalAdminFoodPages);
  const pagedAdminFoodRows = useMemo(() => {
    const start = (currentAdminFoodPage - 1) * ADMIN_TABLE_PAGE_SIZE;
    return adminFoodRows.slice(start, start + ADMIN_TABLE_PAGE_SIZE);
  }, [adminFoodRows, currentAdminFoodPage]);

  useEffect(() => {
    return () => {
      if (adminFoodPreviewUrl) URL.revokeObjectURL(adminFoodPreviewUrl);
    };
  }, [adminFoodPreviewUrl]);

  useEffect(() => {
    void loadDashboard();
  }, []);

  useEffect(() => {
    if (foodScope !== 'user') return;
    if (users.length === 0) {
      if (selectedUserFoodUserId !== null) setSelectedUserFoodUserId(null);
      return;
    }
    if (selectedUserFoodUserId === null || !users.some((user) => user.id === selectedUserFoodUserId)) {
      const preferredUser = users.find((user) => user.id === currentUser.id) ?? users[0];
      setSelectedUserFoodUserId(preferredUser.id);
    }
  }, [currentUser.id, foodScope, selectedUserFoodUserId, users]);

  useEffect(() => {
    setAdminUsersPage((page) => Math.min(page, totalAdminUsersPages));
  }, [totalAdminUsersPages]);

  useEffect(() => {
    setAdminPermissionsPage((page) => Math.min(page, totalAdminPermissionsPages));
  }, [totalAdminPermissionsPages]);

  useEffect(() => {
    setAdminFoodsPage((page) => Math.min(page, totalAdminFoodPages));
  }, [totalAdminFoodPages]);

  async function loadDashboard() {
    setDashboardLoading(true);
    setDashboardError('');
    try {
      setDashboard(await getAdminDashboard());
    } catch (err) {
      setDashboardError(err instanceof Error ? err.message : 'Failed to load dashboard.');
    } finally {
      setDashboardLoading(false);
    }
  }

  async function loadUsers() {
    setUsersLoading(true);
    setUsersError('');
    try {
      const data = await getAdminUsers();
      setUsers(data);
      return data;
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to load users.');
      return null;
    } finally {
      setUsersLoading(false);
    }
  }

  async function toggleUsers() {
    const nextOpen = !usersOpen;
    setUsersOpen(nextOpen);
    if (nextOpen) setFoodsOpen(false);
    if (nextOpen) setPermissionsOpen(false);
    if (nextOpen) setAdminUsersPage(1);
    if (!nextOpen || users.length > 0 || usersLoading) return;

    await loadUsers();
  }

  async function openDashboard() {
    setUsersOpen(false);
    setFoodsOpen(false);
    setPermissionsOpen(false);
    if (!dashboard && !dashboardLoading) {
      await loadDashboard();
    }
  }

  async function loadDefaultFoods(query = foodSearch) {
    setFoodLoading(true);
    setFoodError('');
    try {
      setAdminFoods(await getAdminDefaultFoods(query));
    } catch (err) {
      setFoodError(err instanceof Error ? err.message : 'Failed to load foods.');
    } finally {
      setFoodLoading(false);
    }
  }

  async function loadUserFoods(query = userFoodSearch) {
    setFoodLoading(true);
    setFoodError('');
    try {
      const data = await getAdminUserFoods(query);
      setAdminUserFoods(data);
      return data;
    } catch (err) {
      setFoodError(err instanceof Error ? err.message : 'Failed to load user foods.');
      return null;
    } finally {
      setFoodLoading(false);
    }
  }

  async function toggleFoods() {
    const nextOpen = !foodsOpen;
    setFoodsOpen(nextOpen);
    if (nextOpen) setUsersOpen(false);
    if (nextOpen) setPermissionsOpen(false);
    if (!nextOpen || adminFoods.length > 0 || foodLoading) return;

    await loadDefaultFoods();
  }

  async function openPermissions() {
    if (!isAdmin) return;
    setPermissionsOpen(true);
    setUsersOpen(false);
    setFoodsOpen(false);
    setAdminPermissionsPage(1);
    if (users.length === 0 && !usersLoading) {
      await loadUsers();
    }
  }

  async function openDefaultFoods() {
    setFoodScope('default');
    setFoodView('default');
    setAdminFoodsPage(1);
    setEditingDefaultFood(null);
    setFoodForm(emptyAdminFoodForm);
    setFoodImageFile(null);
    if (adminFoods.length === 0 && !foodLoading) {
      await loadDefaultFoods();
    }
  }

  async function openUserFoods() {
    setFoodScope('user');
    setFoodView('default');
    setAdminFoodsPage(1);
    setEditingDefaultFood(null);
    setFoodForm(emptyAdminFoodForm);
    setFoodImageFile(null);
    const usersData = users.length === 0 && !usersLoading ? await loadUsers() : users;
    if (usersData && usersData.length > 0 && selectedUserFoodUserId === null) {
      const preferredUser = usersData.find((user) => user.id === currentUser.id) ?? usersData[0];
      setSelectedUserFoodUserId(preferredUser.id);
    }
    if (adminUserFoods.length === 0 && !foodLoading) {
      await loadUserFoods();
    }
  }

  function selectUserFoodUser(user: AdminUserListItem) {
    setSelectedUserFoodUserId(user.id);
    setAdminFoodsPage(1);
    setFoodView('default');
    setEditingDefaultFood(null);
    setFoodForm(emptyAdminFoodForm);
    setFoodImageFile(null);
    setFoodError('');
  }

  async function toggleUserStatus(user: AdminUserListItem) {
    if (!isAdmin) return;
    const action = user.is_active ? '禁用' : '启用';
    if (!window.confirm(`确定${action}用户「${user.username}」吗？`)) return;

    setActingUserId(user.id);
    setUsersError('');
    try {
      await updateAdminUserStatus(user.id, !user.is_active);
      await loadUsers();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to update user status.');
    } finally {
      setActingUserId(null);
    }
  }

  async function removeUser(user: AdminUserListItem) {
    if (!isAdmin) return;
    if (!window.confirm(`确定删除用户「${user.username}」吗？这会同时删除该用户的食物和抽取记录。`)) return;

    setActingUserId(user.id);
    setUsersError('');
    try {
      await deleteAdminUser(user.id);
      await loadUsers();
    } catch (err) {
      setUsersError(err instanceof Error ? err.message : 'Failed to delete user.');
    } finally {
      setActingUserId(null);
    }
  }

  function closeAccountDialogs() {
    setOwnPasswordOpen(false);
    setUserCreateOpen(false);
    setRoleEditingUser(null);
    setPasswordResetUser(null);
    setOwnPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    setUserCreateForm({ username: '', role: 'user', password: '', confirm_password: '' });
    setResetPasswordValue('');
    setResetPasswordConfirm('');
    setAccountError('');
    setAccountSubmitting(false);
  }

  function changeOwnPassword() {
    setAccountError('');
    setOwnPasswordOpen(true);
  }

  function startCreateUser() {
    if (!isAdmin) return;
    setAccountError('');
    setUserCreateForm({ username: '', role: 'user', password: '', confirm_password: '' });
    setUserCreateOpen(true);
  }

  function changeUserRole(user: AdminUserListItem) {
    if (!isAdmin) return;
    setAccountError('');
    setRoleEditingUser(user);
    setRoleValue(user.role);
  }

  function resetUserPassword(user: AdminUserListItem) {
    if (!isAdmin) return;
    setAccountError('');
    setResetPasswordValue('');
    setResetPasswordConfirm('');
    setPasswordResetUser(user);
  }

  async function submitOwnPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accountSubmitting) return;
    if (ownPasswordForm.new_password.length < 6) {
      setAccountError('新密码至少 6 位。');
      return;
    }
    if (ownPasswordForm.new_password !== ownPasswordForm.confirm_password) {
      setAccountError('两次输入的新密码不一致。');
      return;
    }

    setAccountSubmitting(true);
    setAccountError('');
    try {
      await changeCurrentPassword({
        current_password: ownPasswordForm.current_password,
        new_password: ownPasswordForm.new_password,
      });
      closeAccountDialogs();
      window.alert('密码已修改');
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : '修改密码失败。');
    } finally {
      setAccountSubmitting(false);
    }
  }

  async function submitCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isAdmin || accountSubmitting) return;

    const username = userCreateForm.username.trim();
    if (username.length < 3) {
      setAccountError('用户名至少 3 位。');
      return;
    }
    if (userCreateForm.password.length < 6) {
      setAccountError('密码至少 6 位。');
      return;
    }
    if (userCreateForm.password !== userCreateForm.confirm_password) {
      setAccountError('两次输入的密码不一致。');
      return;
    }

    setAccountSubmitting(true);
    setAccountError('');
    try {
      await createAdminUser({
        username,
        role: userCreateForm.role,
        password: userCreateForm.password,
      });
      await loadUsers();
      setAdminPermissionsPage(1);
      closeAccountDialogs();
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : '新增用户失败。');
    } finally {
      setAccountSubmitting(false);
    }
  }

  async function submitRoleChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roleEditingUser || accountSubmitting) return;

    setAccountSubmitting(true);
    setAccountError('');
    setActingUserId(roleEditingUser.id);
    try {
      await updateAdminUserRole(roleEditingUser.id, roleValue);
      await loadUsers();
      closeAccountDialogs();
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : '修改角色失败。');
    } finally {
      setActingUserId(null);
      setAccountSubmitting(false);
    }
  }

  async function submitPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordResetUser || accountSubmitting) return;
    if (resetPasswordValue.length < 6) {
      setAccountError('新密码至少 6 位。');
      return;
    }
    if (resetPasswordValue !== resetPasswordConfirm) {
      setAccountError('两次输入的新密码不一致。');
      return;
    }

    setAccountSubmitting(true);
    setAccountError('');
    setActingUserId(passwordResetUser.id);
    try {
      await resetAdminUserPassword(passwordResetUser.id, resetPasswordValue);
      closeAccountDialogs();
      window.alert('密码已修改');
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : '重置密码失败。');
    } finally {
      setActingUserId(null);
      setAccountSubmitting(false);
    }
  }

  function startCreateFood() {
    if (!isAdmin) return;
    setEditingDefaultFood(null);
    setFoodForm(emptyAdminFoodForm);
    setFoodImageFile(null);
    setFoodView('create');
    setFoodError('');
  }

  function startEditFood(food: Food) {
    if (foodScope === 'default' && !isAdmin) return;
    if (foodScope === 'user' && !isAdmin && 'user_id' in food && food.user_id !== currentUser.id) return;
    setEditingDefaultFood(food);
    setFoodForm({
      name: food.name,
      category: food.category ?? '',
      image_url: food.image_url ?? '',
      is_active: food.is_active,
    });
    setFoodImageFile(null);
    setFoodView('create');
    setFoodError('');
  }

  async function submitDefaultFood(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (foodScope === 'default' && !isAdmin) return;
    const name = foodForm.name.trim();
    if (!name) {
      setFoodError('食物名称不能为空。');
      return;
    }

    setFoodSubmitting(true);
    setFoodError('');
    try {
      let imageUrl = foodForm.image_url.trim() || null;
      if (foodImageFile) {
        const uploaded = await uploadFoodImage(foodImageFile);
        imageUrl = uploaded.image_url;
      }

      const payload = {
        name,
        category: foodForm.category.trim() || null,
        image_url: imageUrl,
        is_active: foodForm.is_active,
      };

      if (editingDefaultFood) {
        if (foodScope === 'user') {
          if (!isAdmin && 'user_id' in editingDefaultFood && editingDefaultFood.user_id !== currentUser.id) return;
          await updateAdminUserFood(editingDefaultFood.id, payload);
        } else {
          await updateAdminDefaultFood(editingDefaultFood.id, payload);
        }
      } else {
        await createAdminDefaultFood(payload);
      }

      setFoodForm(emptyAdminFoodForm);
      setFoodImageFile(null);
      setEditingDefaultFood(null);
      setFoodView('default');
      if (foodScope === 'user') {
        await loadUserFoods();
      } else {
        await loadDefaultFoods();
      }
    } catch (err) {
      setFoodError(err instanceof Error ? err.message : 'Failed to save food.');
    } finally {
      setFoodSubmitting(false);
    }
  }

  async function removeDefaultFood(food: Food) {
    if (!isAdmin) return;
    if (!window.confirm(`确定删除默认食物「${food.name}」吗？这只会删除默认模板，不会删除已有用户的复制数据。`)) return;

    setFoodError('');
    try {
      await deleteAdminDefaultFood(food.id);
      await loadDefaultFoods();
    } catch (err) {
      setFoodError(err instanceof Error ? err.message : 'Failed to delete food.');
    }
  }

  async function removeUserFood(food: AdminUserFoodListItem) {
    if (!isAdmin && food.user_id !== currentUser.id) return;
    if (!window.confirm(`确定删除用户「${food.username}」的食物「${food.name}」吗？这会删除该用户自己的这条食物。`)) return;

    setFoodError('');
    try {
      await deleteAdminUserFood(food.id);
      await loadUserFoods();
    } catch (err) {
      setFoodError(err instanceof Error ? err.message : 'Failed to delete user food.');
    }
  }

  function renderAdminPagination(
    ariaLabel: string,
    currentPage: number,
    totalPages: number,
    totalItems: number,
    setPage: (updater: (page: number) => number) => void,
  ) {
    return (
      <div className="pagination-controls admin-pagination" aria-label={ariaLabel}>
        <span>
          第 {currentPage} 页，共 {totalPages} 页，{totalItems} 条
        </span>
        <button
          type="button"
          title="上一页"
          disabled={currentPage === 1}
          onClick={() => setPage((page) => Math.max(1, page - 1))}
        >
          <ChevronLeft size={14} />
        </button>
        <button
          type="button"
          title="下一页"
          disabled={currentPage === totalPages}
          onClick={() => setPage((page) => Math.min(totalPages, page + 1))}
        >
          <ChevronRight size={14} />
        </button>
      </div>
    );
  }

  return (
    <>
    <div className="admin-page">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <p className="eyebrow">Admin Console</p>
          <strong>后台管理</strong>
        </div>

        <button className={`admin-nav-button ${!usersOpen && !foodsOpen && !permissionsOpen ? 'active' : ''}`} type="button" onClick={() => void openDashboard()}>
          <LayoutDashboard size={18} />
          仪表盘
        </button>

        <button className={`admin-nav-button ${usersOpen ? 'active' : ''}`} type="button" onClick={toggleUsers}>
          <Users size={18} />
          用户列表
        </button>

        <button className={`admin-nav-button ${foodsOpen ? 'active' : ''}`} type="button" onClick={toggleFoods}>
          <UtensilsCrossed size={18} />
          食物列表
        </button>

        {foodsOpen && (
          <div className="admin-subnav">
            <button
              type="button"
              className={foodScope === 'default' ? 'active' : ''}
              onClick={() => void openDefaultFoods()}
            >
              默认食物
            </button>
            <button
              type="button"
              className={foodScope === 'user' ? 'active' : ''}
              onClick={() => void openUserFoods()}
            >
              用户食物
            </button>
            {foodScope === 'user' && (
              <div className="admin-user-food-menu">
                {usersLoading ? (
                  <span className="admin-subnav-empty">加载用户...</span>
                ) : users.length === 0 ? (
                  <span className="admin-subnav-empty">暂无用户</span>
                ) : (
                  users.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className={selectedUserFoodUserId === user.id ? 'active' : ''}
                      onClick={() => selectUserFoodUser(user)}
                    >
                      <span>{user.username}</span>
                      <small>ID {user.id}</small>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {isAdmin && (
          <button className={`admin-nav-button ${permissionsOpen ? 'active' : ''}`} type="button" onClick={() => void openPermissions()}>
            <ShieldCheck size={18} />
            用户权限
          </button>
        )}

        <div className="admin-sidebar-footer">
          <div className="admin-identity">
            <span>当前管理员</span>
            <strong>{currentUser.username}</strong>
            <span>{currentUser.role}</span>
          </div>
          <button className="admin-logout" type="button" onClick={() => void changeOwnPassword()}>
            <KeyRound size={16} />
            Password
          </button>
          <button className="admin-logout" type="button" onClick={onLogout}>
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <header className="admin-topbar">
          <div>
            <p className="eyebrow">Overview</p>
            <h1>{permissionsOpen ? '用户权限' : usersOpen ? '用户列表' : foodsOpen ? '食物列表' : '仪表盘'}</h1>
          </div>
        </header>

        {permissionsOpen ? (
          <section className="admin-table-panel">
            <div className="admin-panel-header">
              <div>
                <h2>用户权限</h2>
                <span>管理用户角色、密码和账号删除</span>
              </div>
              <div className="admin-panel-actions">
                {isAdmin && (
                  <button className="primary-button" type="button" onClick={startCreateUser}>
                    <Plus size={15} />
                    新增用户
                  </button>
                )}
                {renderAdminPagination(
                  '用户权限分页',
                  currentAdminPermissionsPage,
                  totalAdminPermissionsPages,
                  users.length,
                  setAdminPermissionsPage,
                )}
                <button className="secondary-button" type="button" onClick={() => void loadUsers()}>
                  <RefreshCcw size={15} />
                  刷新
                </button>
              </div>
            </div>

            {usersError && <div className="error-copy">{usersError}</div>}

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>用户 ID</th>
                    <th>用户名</th>
                    <th>注册时间</th>
                    <th>最后登录时间</th>
                    <th>角色类型</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr>
                      <td colSpan={6}>加载中...</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={6}>暂无用户</td>
                    </tr>
                  ) : (
                    pagedAdminPermissionUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.id}</td>
                        <td>{user.username}</td>
                        <td>{formatTime(user.created_at)}</td>
                        <td>{user.last_login_at ? formatTime(user.last_login_at) : '-'}</td>
                        <td>
                          <span className={user.role === 'admin' ? 'admin-status active' : 'admin-status'}>
                            {user.role}
                          </span>
                        </td>
                        <td>
                          <div className="admin-row-actions stacked">
                            <button
                              type="button"
                              className="admin-small-button"
                              disabled={actingUserId === user.id}
                              onClick={() => changeUserRole(user)}
                            >
                              修改角色
                            </button>
                            <button
                              type="button"
                              className="admin-small-button"
                              disabled={actingUserId === user.id}
                              onClick={() => resetUserPassword(user)}
                            >
                              重置密码
                            </button>
                            <button
                              type="button"
                              className="admin-small-button danger"
                              disabled={actingUserId === user.id}
                              onClick={() => removeUser(user)}
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : usersOpen ? (
          <section className="admin-table-panel">
            <div className="admin-panel-header">
              <div>
                <h2>用户列表</h2>
                <span>{isAdmin ? '管理员可以管理用户状态' : '当前角色仅可查看用户列表'}</span>
              </div>
              <div className="admin-panel-actions">
                {renderAdminPagination(
                  '用户列表分页',
                  currentAdminUsersPage,
                  totalAdminUsersPages,
                  users.length,
                  setAdminUsersPage,
                )}
                <button className="secondary-button" type="button" onClick={() => void loadUsers()}>
                  <RefreshCcw size={15} />
                  刷新
                </button>
              </div>
            </div>

            {usersError && <div className="error-copy">{usersError}</div>}

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>用户 ID</th>
                    <th>用户名</th>
                    <th>注册时间</th>
                    <th>角色</th>
                    <th>食物数量</th>
                    <th>抽取记录数量</th>
                    <th>启用状态</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {usersLoading ? (
                    <tr>
                      <td colSpan={8}>加载中...</td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={8}>暂无用户</td>
                    </tr>
                  ) : (
                    pagedAdminUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.id}</td>
                        <td>{user.username}</td>
                        <td>{formatTime(user.created_at)}</td>
                        <td>{user.role}</td>
                        <td>{user.food_count}</td>
                        <td>{user.pick_log_count}</td>
                        <td>
                          <span className={user.is_active ? 'admin-status active' : 'admin-status'}>
                            {user.is_active ? '启用' : '停用'}
                          </span>
                        </td>
                        <td>
                          {isAdmin ? (
                            <div className="admin-row-actions">
                              <button
                                type="button"
                                className={user.is_active ? 'admin-small-button warning' : 'admin-small-button'}
                                disabled={actingUserId === user.id}
                                onClick={() => toggleUserStatus(user)}
                              >
                                {user.is_active ? '禁用' : '启用'}
                              </button>
                            </div>
                          ) : (
                            <span className="admin-readonly">只读</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : foodsOpen ? (
          <section className="admin-table-panel">
            <div className="admin-panel-header">
              <div>
                <h2>{foodScope === 'default' ? '默认食物' : '用户食物'}</h2>
                <span>
                  {foodScope === 'default'
                    ? '这里管理新用户注册时复制的默认模板食物'
                    : selectedUserFoodUser
                      ? `当前查看 ${selectedUserFoodUser.username} 的食物清单`
                      : '请先在左侧选择一个用户'}
                </span>
              </div>
              {foodScope === 'default' && (
                <div className="admin-sub-tabs">
                  <button
                    type="button"
                    className={foodView === 'default' ? 'active' : ''}
                    onClick={() => {
                      setFoodView('default');
                      setEditingDefaultFood(null);
                      setFoodForm(emptyAdminFoodForm);
                      setFoodImageFile(null);
                    }}
                  >
                    默认食物
                  </button>
                  {isAdmin && (
                    <button type="button" className={foodView === 'create' ? 'active' : ''} onClick={startCreateFood}>
                      新增食物
                    </button>
                  )}
                </div>
              )}
            </div>

            {foodError && <div className="error-copy">{foodError}</div>}

            {foodView === 'default' ? (
              <>
                <div className="admin-food-toolbar">
                  <label className="admin-searchbox">
                    <Search size={16} />
                    <input
                      value={foodScope === 'default' ? foodSearch : userFoodSearch}
                      onChange={(event) => {
                        if (foodScope === 'default') {
                          setFoodSearch(event.target.value);
                        } else {
                          setUserFoodSearch(event.target.value);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          setAdminFoodsPage(1);
                          if (foodScope === 'default') {
                            void loadDefaultFoods(foodSearch);
                          } else {
                            void loadUserFoods(userFoodSearch);
                          }
                        }
                      }}
                      placeholder="按食物名称搜索"
                    />
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setAdminFoodsPage(1);
                      return foodScope === 'default' ? loadDefaultFoods(foodSearch) : loadUserFoods(userFoodSearch);
                    }}
                  >
                    <Search size={15} />
                    搜索
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setFoodSearch('');
                      setUserFoodSearch('');
                      setAdminFoodsPage(1);
                      if (foodScope === 'default') {
                        void loadDefaultFoods('');
                      } else {
                        void loadUserFoods('');
                      }
                    }}
                  >
                    <RefreshCcw size={15} />
                    重置
                  </button>
                  {renderAdminPagination(
                    '食物列表分页',
                    currentAdminFoodPage,
                    totalAdminFoodPages,
                    adminFoodRows.length,
                    setAdminFoodsPage,
                  )}
                </div>

                <div className="admin-table-wrap">
                  <table className="admin-table admin-food-table">
                    <thead>
                      <tr>
                        <th>图片</th>
                        <th>食物名称</th>
                        <th>分类</th>
                        <th>创建时间</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {foodLoading ? (
                        <tr>
                          <td colSpan={5}>加载中...</td>
                        </tr>
                      ) : adminFoodRows.length === 0 ? (
                        <tr>
                          <td colSpan={5}>
                            {foodScope === 'default'
                              ? '暂无默认食物'
                              : selectedUserFoodUser
                                ? `暂无 ${selectedUserFoodUser.username} 的食物`
                                : '请先在左侧选择一个用户'}
                          </td>
                        </tr>
                      ) : (
                        pagedAdminFoodRows.map((food) => {
                          const canManageFood =
                            foodScope === 'default'
                              ? isAdmin
                              : isAdmin || (food as AdminUserFoodListItem).user_id === currentUser.id;

                          return (
                          <tr key={food.id}>
                            <td>
                              <div className="admin-food-thumb">
                                <FoodImage src={getImageSrc(food.image_url)} alt={food.name} />
                              </div>
                            </td>
                            <td>{food.name}</td>
                            <td>{food.category || '未分类'}</td>
                            <td>{formatTime(food.created_at)}</td>
                            <td>
                              {canManageFood ? (
                                <div className="admin-row-actions">
                                  <button type="button" className="admin-small-button" onClick={() => startEditFood(food)}>
                                    更新
                                  </button>
                                  <button
                                    type="button"
                                    className="admin-small-button danger"
                                    onClick={() =>
                                      foodScope === 'user'
                                        ? removeUserFood(food as AdminUserFoodListItem)
                                        : removeDefaultFood(food)
                                    }
                                  >
                                    删除
                                  </button>
                                </div>
                              ) : (
                                <span className="admin-readonly">只读</span>
                              )}
                            </td>
                          </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <form className="admin-food-form" onSubmit={submitDefaultFood}>
                <div className="admin-form-grid">
                  <label className="field">
                    <span>食物名称</span>
                    <input
                      value={foodForm.name}
                      onChange={(event) => setFoodForm({ ...foodForm, name: event.target.value })}
                      placeholder="例如：牛肉"
                    />
                  </label>
                  <label className="field">
                    <span>分类</span>
                    <input
                      value={foodForm.category}
                      onChange={(event) => setFoodForm({ ...foodForm, category: event.target.value })}
                      placeholder="例如：肉"
                    />
                  </label>
                  <label className="field admin-wide-field">
                    <span>图片 URL</span>
                    <input
                      value={foodForm.image_url}
                      onChange={(event) => {
                        setFoodForm({ ...foodForm, image_url: event.target.value });
                        if (event.target.value.trim()) setFoodImageFile(null);
                      }}
                      placeholder="/uploads/example.jpg 或 https://..."
                    />
                  </label>
                  <label className="admin-file-field admin-wide-field">
                    <UploadCloud size={18} />
                    <span>{foodImageFile ? foodImageFile.name : '选择本地图片'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => {
                        const file = event.target.files?.[0] ?? null;
                        setFoodImageFile(file);
                        if (file) {
                          setFoodForm({ ...foodForm, image_url: '' });
                        }
                      }}
                    />
                  </label>
                  <div className="admin-food-preview admin-wide-field">
                    <FoodImage src={adminFoodPreviewImage} alt="食物图片预览" />
                  </div>
                  <label className="admin-check-field">
                    <input
                      type="checkbox"
                      checked={foodForm.is_active}
                      onChange={(event) => setFoodForm({ ...foodForm, is_active: event.target.checked })}
                    />
                    启用
                  </label>
                </div>
                <div className="admin-form-actions">
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setFoodView('default');
                      setEditingDefaultFood(null);
                      setFoodForm(emptyAdminFoodForm);
                      setFoodImageFile(null);
                    }}
                  >
                    取消
                  </button>
                  <button className="primary-button" type="submit" disabled={foodSubmitting}>
                    {foodSubmitting ? '保存中...' : editingDefaultFood ? '更新食物' : '新增食物'}
                  </button>
                </div>
              </form>
            )}
          </section>
        ) : (
          <section className="admin-dashboard-grid">
            {dashboardError && <div className="error-copy admin-dashboard-error">{dashboardError}</div>}
            <article className="admin-stat-card">
              <span>用户数量</span>
              <strong>{dashboardLoading ? '...' : dashboard?.user_count ?? 0}</strong>
            </article>
            <article className="admin-stat-card">
              <span>食物数量</span>
              <strong>{dashboardLoading ? '...' : dashboard?.food_count ?? 0}</strong>
            </article>
            <article className="admin-stat-card admin-common-card">
              <div className="admin-card-heading">
                <span>常见食物</span>
                <button className="admin-small-button" type="button" onClick={() => void loadDashboard()}>
                  刷新
                </button>
              </div>
              <div className="admin-common-foods">
                {dashboardLoading ? (
                  <p>加载中...</p>
                ) : dashboard?.common_foods.length ? (
                  dashboard.common_foods.map((food) => (
                    <div className="admin-common-food" key={food.name}>
                      <div className="admin-common-food-image">
                        <FoodImage src={getImageSrc(food.image_url)} alt={food.name} />
                      </div>
                      <div>
                        <strong>{food.name}</strong>
                        <span>{food.count} 次</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p>暂无常见食物</p>
                )}
              </div>
            </article>
          </section>
        )}
      </main>
    </div>

    {ownPasswordOpen && (
      <div className="modal-backdrop" onClick={closeAccountDialogs}>
        <form className="modal panel-card admin-account-modal" onSubmit={submitOwnPassword} onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Password</p>
              <h2>修改密码</h2>
            </div>
            <button type="button" className="icon-button" onClick={closeAccountDialogs}>
              <X size={16} />
            </button>
          </div>

          <label className="field">
            <span>当前密码</span>
            <input
              type="password"
              value={ownPasswordForm.current_password}
              onChange={(event) => setOwnPasswordForm({ ...ownPasswordForm, current_password: event.target.value })}
              autoComplete="current-password"
              autoFocus
            />
          </label>
          <label className="field">
            <span>新密码</span>
            <input
              type="password"
              value={ownPasswordForm.new_password}
              onChange={(event) => setOwnPasswordForm({ ...ownPasswordForm, new_password: event.target.value })}
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span>确认密码</span>
            <input
              type="password"
              value={ownPasswordForm.confirm_password}
              onChange={(event) => setOwnPasswordForm({ ...ownPasswordForm, confirm_password: event.target.value })}
              autoComplete="new-password"
            />
          </label>

          {accountError && <div className="error-copy">{accountError}</div>}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={closeAccountDialogs}>
              取消
            </button>
            <button type="submit" className="primary-button" disabled={accountSubmitting}>
              {accountSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    )}

    {userCreateOpen && (
      <div className="modal-backdrop" onClick={closeAccountDialogs}>
        <form className="modal panel-card admin-account-modal" onSubmit={submitCreateUser} onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Account</p>
              <h2>新增用户</h2>
            </div>
            <button type="button" className="icon-button" onClick={closeAccountDialogs}>
              <X size={16} />
            </button>
          </div>

          <label className="field">
            <span>用户名</span>
            <input
              value={userCreateForm.username}
              onChange={(event) => setUserCreateForm({ ...userCreateForm, username: event.target.value })}
              autoComplete="username"
              autoFocus
            />
          </label>
          <label className="field">
            <span>角色类型</span>
            <select
              value={userCreateForm.role}
              onChange={(event) => setUserCreateForm({ ...userCreateForm, role: event.target.value as 'admin' | 'user' })}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              value={userCreateForm.password}
              onChange={(event) => setUserCreateForm({ ...userCreateForm, password: event.target.value })}
              autoComplete="new-password"
            />
          </label>
          <label className="field">
            <span>确认密码</span>
            <input
              type="password"
              value={userCreateForm.confirm_password}
              onChange={(event) => setUserCreateForm({ ...userCreateForm, confirm_password: event.target.value })}
              autoComplete="new-password"
            />
          </label>

          {accountError && <div className="error-copy">{accountError}</div>}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={closeAccountDialogs}>
              取消
            </button>
            <button type="submit" className="primary-button" disabled={accountSubmitting}>
              {accountSubmitting ? '创建中...' : '创建'}
            </button>
          </div>
        </form>
      </div>
    )}

    {roleEditingUser && (
      <div className="modal-backdrop" onClick={closeAccountDialogs}>
        <form className="modal panel-card admin-account-modal" onSubmit={submitRoleChange} onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Role</p>
              <h2>修改角色</h2>
            </div>
            <button type="button" className="icon-button" onClick={closeAccountDialogs}>
              <X size={16} />
            </button>
          </div>

          <div className="admin-account-target">
            <span>用户</span>
            <strong>{roleEditingUser.username}</strong>
          </div>
          <label className="field">
            <span>角色类型</span>
            <select value={roleValue} onChange={(event) => setRoleValue(event.target.value as 'admin' | 'user')}>
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </label>

          {accountError && <div className="error-copy">{accountError}</div>}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={closeAccountDialogs}>
              取消
            </button>
            <button type="submit" className="primary-button" disabled={accountSubmitting}>
              {accountSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    )}

    {passwordResetUser && (
      <div className="modal-backdrop" onClick={closeAccountDialogs}>
        <form className="modal panel-card admin-account-modal" onSubmit={submitPasswordReset} onClick={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <p className="eyebrow">Password</p>
              <h2>重置密码</h2>
            </div>
            <button type="button" className="icon-button" onClick={closeAccountDialogs}>
              <X size={16} />
            </button>
          </div>

          <div className="admin-account-target">
            <span>用户</span>
            <strong>{passwordResetUser.username}</strong>
          </div>
          <label className="field">
            <span>新密码</span>
            <input
              type="password"
              value={resetPasswordValue}
              onChange={(event) => setResetPasswordValue(event.target.value)}
              autoComplete="new-password"
              autoFocus
            />
          </label>
          <label className="field">
            <span>确认密码</span>
            <input
              type="password"
              value={resetPasswordConfirm}
              onChange={(event) => setResetPasswordConfirm(event.target.value)}
              autoComplete="new-password"
            />
          </label>

          {accountError && <div className="error-copy">{accountError}</div>}

          <div className="modal-actions">
            <button type="button" className="secondary-button" onClick={closeAccountDialogs}>
              取消
            </button>
            <button type="submit" className="primary-button" disabled={accountSubmitting}>
              {accountSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    )}
    </>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const isAdminPath = window.location.pathname.startsWith('/admin');

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }

    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (!cancelled) {
          setCurrentUser(user);
        }
      })
      .catch(() => {
        clearAuthToken();
      })
      .finally(() => {
        if (!cancelled) setAuthChecked(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleAuthExpired() {
      setCurrentUser(null);
    }

    window.addEventListener('auth:expired', handleAuthExpired);
    return () => window.removeEventListener('auth:expired', handleAuthExpired);
  }, []);

  function handleLogout() {
    clearAuthToken();
    setCurrentUser(null);
  }

  if (!authChecked) {
    return (
      <div className="auth-page">
        <div className="auth-panel">
          <p className="eyebrow">Random Lunch</p>
          <h1>Loading...</h1>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <AuthScreen consoleLogin={isAdminPath} onAuthenticated={setCurrentUser} />;
  }

  if (isAdminPath) {
    return <AdminShell currentUser={currentUser} onLogout={handleLogout} />;
  }

  return <LunchApp currentUser={currentUser} onLogout={handleLogout} />;
}
