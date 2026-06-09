import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  ImageIcon,
  Link,
  LogOut,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  UploadCloud,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import {
  clearAuthToken,
  createFood,
  deleteFood,
  deletePickLogs,
  downloadFoodImage,
  getAuthToken,
  getCurrentUser,
  getFoods,
  getPickLogs,
  loginUser,
  pickRandomFood,
  registerUser,
  searchFoodImages,
  setAuthToken,
  updateFood,
  uploadFoodImage,
} from './api';
import type { Food, FoodImageCandidate, PickLog, User } from './types';

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
  { id: 'dark', title: '暗色极简', subtitle: 'Dark Minimal' },
  { id: 'bento', title: 'Bento 奶油', subtitle: 'Bento Cream' },
  { id: 'glass', title: '毛玻璃渐变', subtitle: 'Glassmorphism' },
] as const;

const PICK_LOG_LIMIT = 50;
const LOGS_PER_PAGE = 5;
const FOODS_PER_PAGE = 6;

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
  const [theme, setTheme] = useState<ThemeId>('dark');
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
      } catch {
        setBusy(false);
        setError('抽选失败，请稍后重试。');
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
    setError('');
    await updateFood(food.id, { is_active: !food.is_active });
    await refresh();
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
    } catch {
      setError('删除抽选记录失败，请稍后重试。');
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
    } catch {
      setError('删除失败，请稍后重试。');
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

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
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
      if (mode === 'register') {
        await registerUser({ username: trimmedUsername, password });
        setMode('login');
        setPassword('');
        setConfirmPassword('');
        setNotice('Registration succeeded. Please sign in.');
        return;
      }

      const auth = await loginUser({ username: trimmedUsername, password });
      setAuthToken(auth.access_token);
      onAuthenticated(auth.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode: 'login' | 'register') {
    setMode(nextMode);
    setError('');
    setNotice('');
    setPassword('');
    setConfirmPassword('');
  }

  return (
    <div className="auth-page">
      <form className="auth-panel" onSubmit={handleSubmit}>
        <div>
          <p className="eyebrow">Random Lunch</p>
          <h1>{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
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

        {mode === 'register' && (
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
          {submitting ? 'Working...' : mode === 'login' ? 'Sign in' : 'Register'}
        </button>

        <button
          className="auth-link"
          type="button"
          onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
        >
          {mode === 'login' ? 'Create an account' : 'Back to sign in'}
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      setAuthChecked(true);
      return;
    }

    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (!cancelled) setCurrentUser(user);
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
    return <AuthScreen onAuthenticated={setCurrentUser} />;
  }

  return <LunchApp currentUser={currentUser} onLogout={handleLogout} />;
}
