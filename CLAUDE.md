# CLAUDE.md

This file is the cross-session development guide for this repository. It is intended for Claude Code, Codex, or any coding assistant that continues work here.

## Project Snapshot

This is a full-stack Random Lunch Picker with ordinary user accounts and an admin console.

Ordinary users can:

- Register and log in.
- Receive a copied default food list on registration.
- Manage their own foods.
- Upload local food images or download remote image URLs into local uploads.
- Search Wikimedia Commons for food images.
- Randomly pick one active food.
- View and batch-delete their own pick logs.
- Change their own password.

Console/admin users can:

- Log in through `/admin`.
- View dashboard stats.
- View all real users, including user/admin roles.
- Enable/disable users, promote/demote users, reset passwords, and delete users from the permission-management view.
- Manage default template foods.
- View and manage user foods.

## Tech Stack

Frontend:

- React 18
- Vite
- TypeScript
- CSS in `frontend/src/styles.css`
- Icons from `lucide-react`
- No `react-router-dom`; route selection is currently based on `window.location.pathname`

Backend:

- FastAPI
- SQLAlchemy 2
- PyMySQL
- MySQL
- Pydantic v2
- Custom PBKDF2 password hashing and HMAC token auth in `backend/app/security.py`

## Repository Layout

```text
F:\CODEX\Ai1
|-- backend
|   |-- app
|   |   |-- config.py
|   |   |-- database.py
|   |   |-- main.py
|   |   |-- models.py
|   |   |-- schemas.py
|   |   |-- security.py
|   |   |-- routes
|   |   |   |-- admin.py
|   |   |   |-- auth.py
|   |   |   |-- foods.py
|   |   |   `-- picks.py
|   |   `-- uploads
|   |-- migrations
|   |   |-- 001_multi_user_auth.sql
|   |   |-- 002_admin_user_fields.sql
|   |   `-- 003_credentials_updated_at.sql
|   |-- API.md
|   |-- README.md
|   `-- requirements.txt
|-- frontend
|   |-- public
|   |-- src
|   |   |-- App.tsx
|   |   |-- api.ts
|   |   |-- main.tsx
|   |   |-- styles.css
|   |   `-- types.ts
|   |-- package.json
|   `-- vite.config.ts
|-- .gitignore
`-- CLAUDE.md
```

## Current Git State Notes

Known committed checkpoints:

```text
e0ebc0e Add multi-user auth flow
f163479 Add admin dashboard MVP
089561a Add role and password management
f520300 Use credential timestamps for token invalidation
```

Current untracked or generated files may exist. Always inspect before editing or committing:

```powershell
git status --short
```

Do not commit:

- `backend/.env`, `frontend/.env`, or other secret files.
- `backend/app/uploads/*` except `.gitkeep`.
- `frontend/node_modules/`.
- `frontend/dist/`.
- `frontend/*.tsbuildinfo`.
- `frontend/*.log` and `backend/*.log`.

`frontend/vite.out.log` and `frontend/vite.err.log` may be local dev-server logs. Treat them as disposable generated files unless the user explicitly asks about them.

## Environment

Workspace root:

```text
F:\CODEX\Ai1
```

Known local backend `.env` shape:

```env
DATABASE_URL=mysql+pymysql://root:990114@localhost:3306/random_lunch?charset=utf8mb4
AUTO_CREATE_TABLES=true
UPLOAD_DIR=app/uploads
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
AUTH_SECRET=replace-with-a-long-random-secret
ACCESS_TOKEN_MINUTES=10080
```

Never print or commit real secrets if this file changes.

## Common Commands

Backend syntax check:

```powershell
cd F:\CODEX\Ai1
python -m compileall backend\app
```

Backend dev server:

```powershell
cd F:\CODEX\Ai1\backend
E:\software\miniconda3\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Frontend build:

```powershell
cd F:\CODEX\Ai1\frontend
npm.cmd run build
```

Frontend dev server:

```powershell
cd F:\CODEX\Ai1\frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5173
```

Check backend health:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/health
```

Check OpenAPI:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/openapi.json
```

Port/PID checks on Windows:

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 8000 -InformationLevel Quiet
netstat -ano | Select-String ':8000'
```

Restarting the backend in the background on this Windows machine may require approval for `Invoke-CimMethod`.

## Database Model

### users

Important fields:

- `id`
- `username`
- `password_hash`
- `role`
- `is_active`
- `last_login_at`
- `credentials_updated_at`
- `created_at`

Roles:

- `user`
- `admin`

Special user:

- `id = 1`
- `username = default-template`
- `role = user`
- Purpose: source user for default template foods.

Do not treat `default-template` as a real frontend user.

`credentials_updated_at` is used to invalidate old tokens after password changes, role changes, and admin password resets. It is intentionally not updated for enable/disable status changes, because disabled users can still log in and view frontend/read-only data while write actions are blocked.

### foods

Important fields:

- `id`
- `user_id`
- `name`
- `image_url`
- `category`
- `is_active`
- `created_at`
- `updated_at`

Rules:

- Every food belongs to exactly one user.
- `user_id = 1` foods are default template foods.
- New users receive copied foods from `user_id = 1` during registration.
- Existing users' copied foods are independent from default template foods.
- `is_active = false` keeps the food but excludes it from random picks.

### pick_logs

Important fields:

- `id`
- `user_id`
- `food_id`
- `picked_at`

Rules:

- Pick logs belong to one user.
- When deleting a user, delete that user's pick logs and foods.
- When deleting a food, delete related logs for that same user/food.

## Migrations

Existing migrations:

```text
backend/migrations/001_multi_user_auth.sql
backend/migrations/002_admin_user_fields.sql
backend/migrations/003_credentials_updated_at.sql
```

Migration 001:

- Creates `users` if needed.
- Creates the `default-template` user with `id = 1`.
- Adds `user_id` to `foods` and `pick_logs`.
- Assigns old data to `user_id = 1`.
- Adds foreign keys.

Migration 002:

- Adds `role`.
- Adds `is_active`.
- Adds `last_login_at`.
- Promotes known admin users manually as needed.

Migration 003:

- Adds `credentials_updated_at`.
- Required for token invalidation after password and role changes.

This project does not use Alembic. Run migrations manually and do not rerun blindly if columns already exist.

Useful schema check:

```powershell
& 'E:\Mysql8.0.46\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe' -uroot -p990114 -N -B random_lunch -e "SELECT COLUMN_NAME, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA='random_lunch' AND TABLE_NAME='users';"
```

## Backend Routes

Auth routes in `backend/app/routes/auth.py`:

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/admin/login`
- `GET /auth/me`
- `PATCH /auth/password`

Food routes in `backend/app/routes/foods.py`:

- `GET /foods`
- `POST /foods`
- `PATCH /foods/{food_id}`
- `DELETE /foods/{food_id}`
- `GET /foods/search-images`
- `POST /foods/upload`
- `POST /foods/download-image`

Pick routes in `backend/app/routes/picks.py`:

- `POST /picks/random`
- `GET /picks/logs`
- `POST /picks/logs/delete`

Admin/console routes in `backend/app/routes/admin.py`:

- `GET /admin/dashboard`
- `GET /admin/users`
- `PATCH /admin/users/{user_id}/status`
- `PATCH /admin/users/{user_id}/role`
- `PATCH /admin/users/{user_id}/password`
- `DELETE /admin/users/{user_id}`
- `GET /admin/default-foods`
- `POST /admin/default-foods`
- `PATCH /admin/default-foods/{food_id}`
- `DELETE /admin/default-foods/{food_id}`
- `GET /admin/user-foods`
- `PATCH /admin/user-foods/{food_id}`
- `DELETE /admin/user-foods/{food_id}`

Important: some admin read/update food routes currently use `get_current_user` plus local permission checks rather than `get_current_admin`. Do not assume the route dependency name alone describes the intended authorization; inspect the route before changing behavior.

## Authentication Rules

Password hashing:

- PBKDF2-SHA256.
- 260,000 iterations.
- Random 16-byte salt.
- Implemented with Python standard library.

Token:

- Custom HMAC-signed token.
- Payload includes `sub`, `username`, `iat`, and `exp`.
- Frontend stores it in `localStorage`.
- API client sends `Authorization: Bearer <token>`.

Invalidation and account status:

- `get_current_user` identifies the token user and checks token freshness; it does not reject inactive users.
- Missing, invalid, expired, or stale tokens receive `401`.
- If `users.credentials_updated_at` is newer than token `iat`, the token is stale.
- `get_active_user` rejects inactive users with `403` and `你已被禁用，请联系管理员`; use it for frontend write/action endpoints.
- `get_current_admin` requires an active admin (`role = admin` and `is_active = true`).
- The frontend clears the token and dispatches `auth:expired` only on `401`, not on `403`.
- Disabled users can log in and view frontend/read-only data, but write/action endpoints should show the disabled-account message.

Admin safety:

- A user cannot disable or delete their own account.
- A user cannot change their own role through the admin role endpoint.
- The backend prevents demoting/disabling/deleting the last admin.
- Admin password resets invalidate the target user's old tokens.
- Enabling/disabling a user does not invalidate tokens; it only changes whether write/action endpoints allow operations.

## Frontend Architecture

Main files:

- `frontend/src/App.tsx`: all major screens and UI state.
- `frontend/src/api.ts`: API client and auth token handling.
- `frontend/src/types.ts`: shared TypeScript types.
- `frontend/src/styles.css`: all app styling.

Routing:

- No router dependency.
- `window.location.pathname.startsWith('/admin')` decides console mode.
- Ordinary UI is rendered by `LunchApp`.
- Console UI is rendered by `AdminShell`.
- Login/register UI is rendered by `AuthScreen`.

Frontend auth behavior:

- Ordinary login uses `POST /auth/login`.
- Admin console login currently uses `POST /auth/login` because `App` passes `consoleLogin` to `AuthScreen`, not `adminOnly`; both `admin` and `user` roles can enter the console, then UI and backend endpoints apply role/status permissions.
- `POST /auth/admin/login` still exists as an admin-only login endpoint. `AuthScreen` can call it only through the `adminOnly` branch, which is not the current `/admin` path.
- Registration uses `POST /auth/register`.
- `/auth/me` is used to restore the current user from token.
- `401` auth failures clear the token and return to login.
- `403` permission/account-status failures keep the user on the page and display the backend error message.

Admin console UI areas:

- Dashboard.
- User list: status management only; the delete action is intentionally not shown here.
- Food list with default-food and user-food scopes.
- Permission/account management: role changes, password resets, and user deletion.

Keep the current single-file app structure unless the user explicitly asks for a refactor.

## Image Handling

Upload endpoint:

```text
POST /foods/upload
```

Download endpoint:

```text
POST /foods/download-image
```

Search endpoint:

```text
GET /foods/search-images?q=<query>&limit=6
```

Rules:

- Upload and download require login.
- Search is public.
- Upload accepts images only.
- Max file size is 8 MB.
- Accepted suffixes: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`.
- Files are stored under `backend/app/uploads`.
- API returns `/uploads/<filename>`.

Do not commit uploaded images.

## API Documentation

Detailed API documentation lives in:

```text
backend/API.md
```

Update `backend/API.md` whenever endpoints, request bodies, response bodies, or authorization rules change.

FastAPI docs:

```text
http://127.0.0.1:8000/docs
http://127.0.0.1:8000/openapi.json
```

Note: `backend/API.md` may contain mojibake in the current working tree. Prefer preserving intended content if editing, or rewrite affected sections cleanly.

## Coding Conventions

Backend:

- Prefer FastAPI dependency injection.
- Use `get_current_user` for ordinary authenticated endpoints.
- Use `get_current_admin` for admin-only endpoints unless an endpoint intentionally permits user self-management.
- Keep user data isolated by `user_id`.
- Keep `default-template` out of real-user flows.
- Do not allow the last admin to be removed, disabled, or demoted.
- Update `credentials_updated_at` whenever credentials or role permissions change in a way that should invalidate old tokens.
- Do not update `credentials_updated_at` for ordinary enable/disable status changes; disabled users should stay logged in for frontend/read-only access.
- When deleting rows with dependent logs, delete logs first.
- Keep migrations as explicit SQL files under `backend/migrations`.

Frontend:

- Use existing React patterns in `frontend/src/App.tsx`.
- Use existing CSS classes and admin dark-theme conventions.
- Use `lucide-react` icons when adding controls.
- Avoid adding a router unless the user explicitly asks.
- Keep admin destructive actions guarded by confirmation dialogs.
- Clear auth token only on `401`; keep the user on the page for `403` so disabled-account and permission messages can be shown.
- Keep Chinese UI copy consistent with nearby UI text when editing existing screens.

Verification after changes:

```powershell
python -m compileall backend\app
cd F:\CODEX\Ai1\frontend
npm.cmd run build
```

If backend routes changed, restart or verify the running backend and check OpenAPI:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/openapi.json
```

For frontend behavior changes, open the local Vite app in the in-app browser when available and inspect at least the affected flow.

## Known Gotchas

- Some existing terminal output may show Chinese text as mojibake; inspect files carefully before assuming the source content is wrong.
- `Base.metadata.create_all` creates missing tables but does not alter existing columns.
- Manual migrations can drift from the local database; check schema before assuming a column exists.
- PowerShell may block `npm` script execution; use `npm.cmd`.
- Backend background restart may require elevated/CIM process creation.
- Frontend path handling is manual via `window.location.pathname`.
- Current admin dashboard food count intentionally de-duplicates by `Food.name`.
- Wikimedia Commons image search and remote image download depend on outbound network access from the backend runtime.

## Before Starting a New Feature

1. Run `git status --short`.
2. Read the relevant route/component before editing.
3. Check whether the feature needs a database migration.
4. If an endpoint changes, update `backend/API.md`.
5. If auth, roles, password, or account status are involved, review token invalidation behavior.
6. Verify with `python -m compileall backend\app` and `npm.cmd run build` when the change touches backend/frontend code.
