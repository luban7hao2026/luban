# Ubuntu 22.04 Docker 部署教程

本教程用于把 `F:\CODEX\Ai1` 里的 Random Lunch 项目部署到 Ubuntu 22.04 服务器。

目标服务器公网 IP：

```text
121.40.198.70
```

技术栈：

- Frontend: React + Vite + Nginx
- Backend: FastAPI + Uvicorn
- Database: MySQL 8.0
- Runtime: Docker Compose

部署后的访问方式：

```text
http://121.40.198.70
```

前端通过同源 `/api` 访问后端，Nginx 会把 `/api/*` 转发到 FastAPI 容器，所以浏览器不会再访问 `127.0.0.1:8000`。

## 1. 安全组设置

在云服务器安全组的入方向规则里，建议只保留下面这些公网入口。

### 必须开放

```text
TCP 80    0.0.0.0/0        HTTP 访问网站
TCP 22    你的公网 IP/32    SSH 登录服务器
```

如果暂时不知道自己的公网 IP，可以先临时使用：

```text
TCP 22    0.0.0.0/0
```

部署完成后建议改成自己的公网 IP/32。

### 可选开放

```text
TCP 443   0.0.0.0/0        HTTPS，后续配置域名证书时使用
ICMP      0.0.0.0/0        允许 ping，方便排查网络
```

### 不要开放

```text
TCP 3306  0.0.0.0/0        MySQL 不要暴露公网
TCP 8000  0.0.0.0/0        FastAPI 不直接暴露公网
TCP 5173  0.0.0.0/0        Vite dev server 不用于生产
TCP 3389  0.0.0.0/0        Ubuntu 不需要 RDP
```

你当前截图里有 `RDP(3389)`，Ubuntu 22.04 部署用不到，建议删除。MySQL 会在 Docker 内网里给后端访问，不需要也不应该开放到公网。

## 2. 本机数据库备份

当前已经导出本机 MySQL 数据库：

```text
F:\CODEX\Ai1\db_backups\random_lunch_20260611_234528.sql
```

这份文件用于恢复服务器上的 Docker MySQL，保证数据和本机一致。

如果后续本机数据又变了，重新导出：

```powershell
cd F:\CODEX\Ai1

$envPath = 'F:\CODEX\Ai1\backend\.env'
$settings = @{}
Get-Content -LiteralPath $envPath | ForEach-Object {
  $line = $_.Trim()
  if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
    $parts = $line.Split('=', 2)
    $settings[$parts[0].Trim()] = $parts[1].Trim()
  }
}

$dbUrl = $settings['DATABASE_URL']
$mysqlUrl = $dbUrl -replace '^mysql\+pymysql://', 'mysql://'
$uri = [Uri]$mysqlUrl
$userInfo = $uri.UserInfo.Split(':', 2)
$dbUser = [Uri]::UnescapeDataString($userInfo[0])
$dbPass = [Uri]::UnescapeDataString($userInfo[1])
$dbHost = $uri.Host
$dbPort = if ($uri.Port -gt 0) { $uri.Port } else { 3306 }
$dbName = $uri.AbsolutePath.TrimStart('/')
$backupDir = 'F:\CODEX\Ai1\db_backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$outFile = Join-Path $backupDir "${dbName}_${stamp}.sql"
$tmpDefaults = Join-Path $backupDir ".mysqldump_${stamp}.cnf"

@("[client]", "user=$dbUser", "password=$dbPass", "host=$dbHost", "port=$dbPort", "default-character-set=utf8mb4") |
  Set-Content -LiteralPath $tmpDefaults -Encoding ASCII

try {
  & 'E:\Mysql8.0.46\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe' `
    --defaults-extra-file=$tmpDefaults `
    --single-transaction `
    --routines `
    --triggers `
    --events `
    --hex-blob `
    --databases $dbName `
    --result-file=$outFile
} finally {
  if (Test-Path -LiteralPath $tmpDefaults) {
    Remove-Item -LiteralPath $tmpDefaults -Force
  }
}

Write-Host "Backup created: $outFile"
```

## 3. 准备上传项目

在 Windows 本机打包项目。不要把 `backend/.env`、`node_modules`、`dist`、日志和本地临时图片打包进去。

```powershell
cd F:\CODEX\Ai1

$stage = 'F:\CODEX\Ai1\.deploy_stage'
if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null

robocopy backend "$stage\backend" /E /XD "__pycache__" /XF ".env" "*.log" | Out-Null
robocopy frontend "$stage\frontend" /E /XD "node_modules" "dist" /XF "*.log" "*.tsbuildinfo" | Out-Null

Copy-Item -LiteralPath CLAUDE.md -Destination $stage
Copy-Item -LiteralPath DEPLOY_UBUNTU22_DOCKER.md -Destination $stage
Copy-Item -LiteralPath .gitignore -Destination $stage

Compress-Archive `
  -Path "$stage\*" `
  -DestinationPath random-lunch-app.zip `
  -Force
```

上传项目压缩包和数据库备份到服务器：

```powershell
scp F:\CODEX\Ai1\random-lunch-app.zip root@121.40.198.70:/opt/
scp F:\CODEX\Ai1\db_backups\random_lunch_20260611_234528.sql root@121.40.198.70:/opt/
```

如果本机有已上传的食物图片，也一起打包上传：

```powershell
cd F:\CODEX\Ai1\backend\app
Compress-Archive -Path uploads -DestinationPath F:\CODEX\Ai1\uploads.zip -Force
scp F:\CODEX\Ai1\uploads.zip root@121.40.198.70:/opt/
```

## 4. 安装 Docker

登录 Ubuntu 服务器：

```bash
ssh root@121.40.198.70
```

安装 Docker 和 Compose 插件：

```bash
apt update
apt install -y ca-certificates curl gnupg unzip
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

docker --version
docker compose version
```

## 5. 解压项目

```bash
mkdir -p /opt/random-lunch
unzip -o /opt/random-lunch-app.zip -d /opt/random-lunch
cd /opt/random-lunch
```

检查目录：

```bash
ls -la
ls -la backend frontend
```

## 6. 创建 Docker 配置

### 6.1 后端 Dockerfile

```bash
cat > backend/Dockerfile <<'EOF'
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends default-libmysqlclient-dev gcc \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
EOF
```

### 6.2 前端 Dockerfile

```bash
cat > frontend/Dockerfile <<'EOF'
FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_API_BASE_URL=/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
EOF
```

### 6.3 前端 Nginx 配置

```bash
cat > frontend/nginx.conf <<'EOF'
server {
    listen 80;
    server_name _;

    root /usr/share/nginx/html;
    index index.html;

    client_max_body_size 10m;

    location /api/ {
        proxy_pass http://backend:8000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
```

这里的关键点是：

```text
/api/auth/login       -> backend:8000/auth/login
/api/foods            -> backend:8000/foods
/api/uploads/xxx.jpg  -> backend:8000/uploads/xxx.jpg
```

### 6.4 Docker Compose

```bash
cat > docker-compose.yml <<'EOF'
services:
  mysql:
    image: mysql:8.0
    container_name: random_lunch_mysql
    restart: unless-stopped
    command:
      - --character-set-server=utf8mb4
      - --collation-server=utf8mb4_unicode_ci
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: random_lunch
      TZ: Asia/Shanghai
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "127.0.0.1", "-uroot", "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 20

  backend:
    build:
      context: ./backend
    container_name: random_lunch_backend
    restart: unless-stopped
    depends_on:
      mysql:
        condition: service_healthy
    environment:
      DATABASE_URL: mysql+pymysql://root:${MYSQL_ROOT_PASSWORD}@mysql:3306/random_lunch?charset=utf8mb4
      AUTO_CREATE_TABLES: "true"
      UPLOAD_DIR: /app/uploads
      CORS_ORIGINS: http://121.40.198.70
      AUTH_SECRET: ${AUTH_SECRET}
      ACCESS_TOKEN_MINUTES: "10080"
      TZ: Asia/Shanghai
    volumes:
      - uploads_data:/app/uploads

  frontend:
    build:
      context: ./frontend
      args:
        VITE_API_BASE_URL: /api
    container_name: random_lunch_frontend
    restart: unless-stopped
    depends_on:
      - backend
    ports:
      - "80:80"

volumes:
  mysql_data:
  uploads_data:
EOF
```

### 6.5 生产环境变量

生成随机密钥：

```bash
openssl rand -hex 32
```

创建 `.env`：

```bash
cat > .env <<'EOF'
MYSQL_ROOT_PASSWORD=replace-with-a-strong-mysql-password
AUTH_SECRET=replace-with-a-long-random-auth-secret
EOF
```

把 `MYSQL_ROOT_PASSWORD` 和 `AUTH_SECRET` 改成你自己的强密码。不要提交这个文件。

## 7. 启动服务

```bash
cd /opt/random-lunch
docker compose up -d --build
```

查看容器状态：

```bash
docker compose ps
docker compose logs -f backend
```

如果启动成功，先检查健康接口：

```bash
curl http://127.0.0.1/api/health
curl http://121.40.198.70/api/health
```

预期返回：

```json
{"status":"ok"}
```

## 8. 导入本机数据库

把数据库备份放到服务器：

```bash
ls -lh /opt/random_lunch_20260611_234528.sql
```

导入到 Docker MySQL：

```bash
cd /opt/random-lunch

docker exec -i random_lunch_mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
  < /opt/random_lunch_20260611_234528.sql
```

如果上面命令提示 `MYSQL_ROOT_PASSWORD` 为空，先加载 `.env`：

```bash
cd /opt/random-lunch
set -a
. ./.env
set +a

docker exec -i random_lunch_mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
  < /opt/random_lunch_20260611_234528.sql
```

导入后检查表和数据：

```bash
docker exec -it random_lunch_mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" random_lunch \
  -e "SHOW TABLES; SELECT COUNT(*) AS users FROM users; SELECT COUNT(*) AS foods FROM foods; SELECT COUNT(*) AS pick_logs FROM pick_logs;"
```

## 9. 恢复上传图片

如果有 `uploads.zip`：

```bash
cd /opt
unzip -o uploads.zip -d /tmp/random-lunch-uploads
cd /opt/random-lunch

docker cp /tmp/random-lunch-uploads/uploads/. random_lunch_backend:/app/uploads/
docker compose restart backend
```

检查图片接口：

```bash
curl -I http://121.40.198.70/api/uploads/
```

如果具体图片路径在数据库里是 `/uploads/xxx.jpg`，前端会自动请求：

```text
http://121.40.198.70/api/uploads/xxx.jpg
```

## 10. 浏览器验证

打开：

```text
http://121.40.198.70
```

验证这些功能：

- 普通登录
- 管理员登录 `/admin`
- 食物列表显示
- 转盘抽选
- 最近抽选记录
- 图片显示
- 上传图片
- 管理后台用户和食物管理

如果页面能打开但登录失败，查看后端日志：

```bash
docker compose logs -f backend
```

如果页面打不开，查看前端 Nginx 日志：

```bash
docker compose logs -f frontend
```

## 11. 后续更新部署

本机有新 commit 后，重新打包上传：

```powershell
cd F:\CODEX\Ai1

$stage = 'F:\CODEX\Ai1\.deploy_stage'
if (Test-Path $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $stage | Out-Null

robocopy backend "$stage\backend" /E /XD "__pycache__" /XF ".env" "*.log" | Out-Null
robocopy frontend "$stage\frontend" /E /XD "node_modules" "dist" /XF "*.log" "*.tsbuildinfo" | Out-Null

Copy-Item -LiteralPath CLAUDE.md -Destination $stage
Copy-Item -LiteralPath DEPLOY_UBUNTU22_DOCKER.md -Destination $stage
Copy-Item -LiteralPath .gitignore -Destination $stage

Compress-Archive `
  -Path "$stage\*" `
  -DestinationPath random-lunch-app.zip `
  -Force

scp F:\CODEX\Ai1\random-lunch-app.zip root@121.40.198.70:/opt/
```

服务器更新：

```bash
cd /opt/random-lunch
unzip -o /opt/random-lunch-app.zip -d /opt/random-lunch
docker compose up -d --build
docker compose ps
```

如果只改前端，仍然可以直接执行同一条：

```bash
docker compose up -d --build
```

Compose 会重建需要更新的镜像。

## 12. 数据库备份和回滚

服务器上备份 Docker MySQL：

```bash
cd /opt/random-lunch
set -a
. ./.env
set +a

mkdir -p /opt/random-lunch-backups

docker exec random_lunch_mysql \
  mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --databases random_lunch \
  > /opt/random-lunch-backups/random_lunch_$(date +%Y%m%d_%H%M%S).sql
```

恢复某个备份：

```bash
cd /opt/random-lunch
set -a
. ./.env
set +a

docker exec -i random_lunch_mysql \
  mysql -uroot -p"$MYSQL_ROOT_PASSWORD" \
  < /opt/random-lunch-backups/your_backup.sql
```

## 13. 常见问题

### 访问 `http://121.40.198.70` 没反应

检查安全组是否开放 `TCP 80`。

检查容器：

```bash
docker compose ps
docker compose logs frontend
```

### 前端打开了，但是接口失败

检查：

```bash
curl http://121.40.198.70/api/health
docker compose logs backend
```

如果 `/api/health` 不通，通常是后端容器没起来或 Nginx 反代配置有问题。

### 后端连不上数据库

检查 MySQL：

```bash
docker compose ps mysql
docker compose logs mysql
docker compose logs backend
```

确认 `.env` 里的 `MYSQL_ROOT_PASSWORD` 没有空格、引号或特殊复制错误。

### 登录后图片不显示

检查数据库里的图片路径是否是：

```text
/uploads/xxx.jpg
```

检查后端容器里是否有图片文件：

```bash
docker exec -it random_lunch_backend ls -lah /app/uploads
```

### 不要直接开放 MySQL

生产环境里后端通过 Docker 网络访问 `mysql:3306`，公网安全组不需要开放 `3306`。如果临时排查必须连接 MySQL，也建议使用 SSH 隧道，不建议把 `3306` 对 `0.0.0.0/0` 打开。

---

# 附录 A. Git 部署流程（推荐长期维护）

前面第 1~13 节是「打包 zip 上传」的方案，适合第一次快速上线。本附录是另一套**基于 Git 的部署流程**，适合长期维护：以后改了代码只要 `git pull` 就能更新，数据库和图片永远不丢。两套方案可以共存，按需选用。

## A.0 核心原则

```text
Git 只管代码和 Docker 配置
数据库数据、上传图片、生产 .env 不进 Git
服务器用固定 data 目录保存这些数据
```

服务器目录结构：

```text
/opt/random-lunch              # git clone 下来的项目代码
/opt/random-lunch/data/mysql   # MySQL 真正数据（git pull 不碰）
/opt/random-lunch/data/uploads # 用户上传图片（git pull 不碰）
/opt/random-lunch/data/db-init # 第一次初始化用的 SQL
/opt/random-lunch/.env         # 生产密码和密钥（不进 Git）
```

> 仓库里的 `docker-compose.yml` 已经改成挂载这些宿主目录：
>
> ```yaml
> mysql:
>   volumes:
>     - ./data/mysql:/var/lib/mysql
>     - ./data/db-init:/docker-entrypoint-initdb.d:ro
> backend:
>   volumes:
>     - ./data/uploads:/app/uploads
> ```
>
> `.gitignore` 已忽略 `data/`，所以数据、图片、密钥都不会进 Git。

## A.1 首次部署

### A.1.1 🐧 服务器：拉代码、建数据目录

```bash
cd /opt
git clone <你的仓库地址> random-lunch
cd random-lunch
mkdir -p data/db-init data/uploads
```

### A.1.2 🪟 本机：上传数据库备份和图片

在 Windows PowerShell 里跑（数据库 dump 改名为 `01_restore.sql` 放进 `data/db-init`）：

```powershell
scp F:\CODEX\Ai1\db_backups\random_lunch_20260611_234528.sql `
    root@121.40.198.70:/opt/random-lunch/data/db-init/01_restore.sql

cd F:\CODEX\Ai1\backend\app
Compress-Archive -Path uploads -DestinationPath F:\CODEX\Ai1\uploads.zip -Force
scp F:\CODEX\Ai1\uploads.zip root@121.40.198.70:/opt/
```

### A.1.3 🐧 服务器：解压图片到 data/uploads

```bash
cd /opt
unzip -o uploads.zip -d /tmp/up
cp -r /tmp/up/uploads/. /opt/random-lunch/data/uploads/
```

### A.1.4 🐧 服务器：一键启动

```bash
cd /opt/random-lunch
chmod +x deploy.sh && ./deploy.sh
```

`deploy.sh` 会：

- 自动创建 `data/mysql`、`data/uploads`、`data/db-init`；
- 检测到 `data/mysql` 为空 + `data/db-init/01_restore.sql` 存在 → 提示「首次将自动导入」；
- 若数据库为空且没有 SQL，会**明确提示用 `scp` 上传 dump** 并让你确认是否用空库继续；
- 自动生成随机 `MYSQL_ROOT_PASSWORD` 和 `AUTH_SECRET` 写入 `.env`；
- `docker compose up -d --build`。

MySQL 第一次启动发现 `data/mysql` 是空的，就会自动导入 `data/db-init` 里的 SQL，恢复全部数据。

### A.1.5 验证

```bash
curl http://127.0.0.1/api/health
```

浏览器打开 `http://121.40.198.70`，图片应正常显示。

## A.2 以后更新代码

```bash
cd /opt/random-lunch
git pull
docker compose up -d --build
```

- `data/mysql`、`data/uploads` 是宿主目录，`git pull` 和重新构建都不会动它们。
- 用户新上传的图片继续存进 `data/uploads`，不会丢。

## A.3 重要规则

- **不要删 `data/mysql`**，否则数据库会被清空、下次启动重新走初始化。
- **不要删 `data/uploads`**，否则所有上传图片丢失。
- `data/db-init` 里的 SQL **只在首次（`data/mysql` 为空时）导入**。以后想重新导入最新备份，必须先 `docker compose down`、清空 `data/mysql`、把新 SQL 放进 `data/db-init`，再 `./deploy.sh`——这会清掉旧数据，谨慎操作。
- `.env` 只存在于服务器，不进 Git；换服务器要重新生成或手动迁移。

## A.4 两个易错点提醒

- **图片首次仍需手动上传一次**（A.1.2~A.1.3）。二进制图片不进 Git 也不进镜像，所以「第一次带过去」只能手动一次，之后全自动持久。
- **数据库 dump 文件名**：compose 不再写死某个文件名，而是导入 `data/db-init` 里的所有 `*.sql`。放进去时建议统一命名 `01_restore.sql`。
