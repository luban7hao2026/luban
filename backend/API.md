# Random Lunch API 文档

Base URL:

```text
http://127.0.0.1:8000
```

认证方式:

```http
Authorization: Bearer <access_token>
```

除注册、登录、健康检查和公开搜图接口外，其他接口都需要登录。

## 角色与账号状态

当前角色:

- `admin`: 启用状态下拥有后台全部管理权限。
- `user`: 可进入控制台查看仪表盘、用户列表、默认食物、用户食物；只能更新/删除自己名下的用户食物。

账号状态:

- `is_active = true`: 正常用户。
- `is_active = false`: 禁用用户。禁用用户仍可登录和查看前台/只读数据，但执行写操作或抽取操作时返回 `403`，错误信息为 `你已被禁用，请联系管理员`。
- 禁用的 admin 不再拥有后台写权限，按只读/受限用户处理。

Token 失效:

- Token payload 包含 `sub`、`username`、`iat`、`exp`。
- `users.credentials_updated_at` 新于 token `iat` 时，token 失效并返回 `401`。
- 修改密码、管理员重置密码、修改角色会更新目标用户的 `credentials_updated_at`。
- 启用/禁用不会更新 `credentials_updated_at`，因此不会把目标用户踢出登录，只会改变其可执行操作。

前端约定:

- `401` 会清除 token 并回到登录页。
- `403` 不清除 token，页面展示后端错误信息。

## 通用数据结构

### UserOut

```json
{
  "id": 3,
  "username": "admin",
  "role": "admin",
  "is_active": true,
  "last_login_at": "2026-06-10T12:00:00",
  "created_at": "2026-06-09T21:01:54"
}
```

### AuthToken

```json
{
  "access_token": "...",
  "token_type": "bearer",
  "user": {
    "id": 3,
    "username": "admin",
    "role": "admin",
    "is_active": true,
    "last_login_at": "2026-06-10T12:00:00",
    "created_at": "2026-06-09T21:01:54"
  }
}
```

### FoodOut

```json
{
  "id": 11,
  "name": "牛肉面",
  "image_url": "/uploads/example.jpg",
  "category": "面食",
  "is_active": true,
  "created_at": "2026-06-09T00:23:48",
  "updated_at": "2026-06-09T00:23:48"
}
```

### AdminUserListItem

```json
{
  "id": 4,
  "username": "luban7hao",
  "role": "user",
  "last_login_at": "2026-06-10T12:00:00",
  "created_at": "2026-06-09T21:06:30",
  "food_count": 10,
  "pick_log_count": 5,
  "is_active": true
}
```

### AdminUserFoodListItem

```json
{
  "id": 37,
  "user_id": 3,
  "username": "luban",
  "name": "牛肉面",
  "image_url": "/uploads/beef.jpg",
  "category": "面食",
  "is_active": true,
  "created_at": "2026-06-09T21:01:54",
  "updated_at": "2026-06-09T21:01:54"
}
```

## 健康检查

### GET /health

响应:

```json
{
  "status": "ok"
}
```

## 认证接口

### POST /auth/register

注册普通用户。注册成功后会从 `user_id = 1` 的默认模板食物复制一份给新用户。

请求:

```json
{
  "username": "luban",
  "password": "123456"
}
```

响应: `AuthToken`

错误:

- `409`: 用户名已存在。

### POST /auth/login

普通登录接口，也是当前前端 `/admin` 控制台登录页使用的接口。当前 `App` 给登录组件传入的是 `consoleLogin`，不是 `adminOnly`，所以控制台登录页仍走这个接口。禁用用户也可以登录，但执行写操作会被拒绝。

请求:

```json
{
  "username": "luban",
  "password": "123456"
}
```

响应: `AuthToken`

错误:

- `401`: 用户名或密码错误。

### POST /auth/admin/login

管理员专用登录接口。只允许启用状态的 `role = admin` 用户登录。当前 `/admin` 控制台登录页没有走这个接口，登录组件只有在 `adminOnly` 分支下才会调用它。

请求:

```json
{
  "username": "admin",
  "password": "123456"
}
```

响应: `AuthToken`

错误:

- `401`: 用户名或密码错误。
- `403`: 非管理员或账号被禁用。

### GET /auth/me

获取当前 token 对应用户。禁用用户也可以调用成功；过期或被凭证更新时间失效的 token 返回 `401`。

权限: 登录用户。

响应: `UserOut`

### PATCH /auth/password

当前用户修改自己的密码。

权限: 启用用户。

请求:

```json
{
  "current_password": "old-password",
  "new_password": "new-password"
}
```

响应: `UserOut`

副作用:

- 更新当前用户的 `password_hash`。
- 更新当前用户的 `credentials_updated_at`，使旧 token 失效。

错误:

- `400`: 当前密码错误。
- `403`: 用户被禁用。

## 前台食物接口

### GET /foods

获取当前用户的食物列表。

权限: 登录用户。禁用用户可查看。

响应: `FoodOut[]`

### POST /foods

新增当前用户食物。

权限: 启用用户。

请求:

```json
{
  "name": "牛肉面",
  "image_url": "/uploads/example.jpg",
  "category": "面食",
  "is_active": true
}
```

响应: `FoodOut`

错误:

- `403`: 用户被禁用。

### PATCH /foods/{food_id}

更新当前用户食物。

权限: 启用用户，且只能操作自己的食物。

请求:

```json
{
  "name": "牛肉面",
  "category": "面食",
  "image_url": "/uploads/noodle.jpg",
  "is_active": true
}
```

响应: `FoodOut`

错误:

- `403`: 用户被禁用。
- `404`: 食物不存在或不属于当前用户。

### DELETE /foods/{food_id}

删除当前用户食物，同时删除该用户该食物相关抽取记录。

权限: 启用用户，且只能操作自己的食物。

响应: `204 No Content`

错误:

- `403`: 用户被禁用。
- `404`: 食物不存在或不属于当前用户。

### GET /foods/search-images

从 Wikimedia Commons 搜图。

权限: 公开。

查询参数:

- `q`: 搜索关键词，必填，1-80 字符。
- `limit`: 返回数量，默认 6，范围 1-10。

响应:

```json
[
  {
    "title": "Beef dish",
    "url": "https://...",
    "thumb_url": "https://...",
    "source": "Wikimedia Commons"
  }
]
```

### POST /foods/upload

上传本地图片。

权限: 启用用户。

请求: `multipart/form-data`

字段:

- `file`: 图片文件，最大 8MB。

响应:

```json
{
  "image_url": "/uploads/abc.jpg"
}
```

错误:

- `400`: 非图片或超过大小限制。
- `403`: 用户被禁用。

### POST /foods/download-image

下载远程图片到本地上传目录。

权限: 启用用户。

请求:

```json
{
  "url": "https://example.com/food.jpg"
}
```

响应:

```json
{
  "image_url": "/uploads/abc.jpg"
}
```

错误:

- `400`: URL 不是 http/https、不是图片、下载失败或超过大小限制。
- `403`: 用户被禁用。

## 抽取接口

### POST /picks/random

从当前用户启用的食物中随机抽取一个，并写入抽取记录。

权限: 启用用户。

响应:

```json
{
  "food": { "id": 11, "name": "牛肉面" },
  "log": {
    "id": 1,
    "food_id": 11,
    "picked_at": "2026-06-10T12:00:00",
    "food": { "id": 11, "name": "牛肉面" }
  }
}
```

错误:

- `403`: 用户被禁用。
- `404`: 没有可抽取食物。

### GET /picks/logs

获取当前用户抽取记录。

权限: 登录用户。禁用用户可查看。

查询参数:

- `limit`: 默认 20，范围 1-100。

响应: `PickLogOut[]`

### POST /picks/logs/delete

批量删除当前用户抽取记录。

权限: 启用用户。

请求:

```json
{
  "ids": [1, 2, 3]
}
```

响应:

```json
{
  "deleted": 3
}
```

错误:

- `403`: 用户被禁用。

## 后台仪表盘接口

### GET /admin/dashboard

获取后台仪表盘统计。

权限: 登录用户。启用和禁用用户均可查看。

统计规则:

- `user_count`: 真实用户数量，排除 `id = 1` 默认模板用户。
- `food_count`: 真实用户食物按名称去重后的数量。
- `common_foods`: 真实用户食物按名称聚合后的前 6 个常见食物。

响应:

```json
{
  "user_count": 2,
  "food_count": 10,
  "common_foods": [
    {
      "name": "牛肉面",
      "image_url": "/uploads/beef.jpg",
      "count": 2
    }
  ]
}
```

## 后台用户接口

### GET /admin/users

获取真实用户列表，排除 `id = 1` 默认模板用户，包含 `user` 和 `admin` 角色。

权限: 登录用户。启用和禁用用户均可查看。

响应: `AdminUserListItem[]`

### PATCH /admin/users/{user_id}/status

启用或禁用用户。

权限: 启用管理员。

请求:

```json
{
  "is_active": false
}
```

响应: `UserOut`

规则:

- 不能操作 `id = 1` 默认模板用户。
- 不能禁用自己。
- 不能禁用最后一个 admin。
- 不更新 `credentials_updated_at`，因此不会踢出目标用户。

### PATCH /admin/users/{user_id}/role

修改用户角色。

权限: 启用管理员。

请求:

```json
{
  "role": "admin"
}
```

响应: `UserOut`

规则:

- 只能设置为 `admin` 或 `user`。
- 不能操作 `id = 1` 默认模板用户。
- 不能修改自己的角色。
- 不能把最后一个 admin 降级。
- 会更新目标用户的 `credentials_updated_at`，使目标用户旧 token 失效。

### PATCH /admin/users/{user_id}/password

管理员重置某个用户密码。

权限: 启用管理员。

请求:

```json
{
  "new_password": "new-password"
}
```

响应: `UserOut`

规则:

- 不能操作 `id = 1` 默认模板用户。
- 会更新目标用户的 `password_hash` 和 `credentials_updated_at`。

### DELETE /admin/users/{user_id}

删除用户，同时删除该用户的食物和抽取记录。

权限: 启用管理员。

响应: `204 No Content`

规则:

- 不能删除 `id = 1` 默认模板用户。
- 不能删除自己。
- 不能删除最后一个 admin。

## 后台默认食物接口

默认食物指 `user_id = 1` 的模板食物。新用户注册时会复制这些食物；修改默认模板不会影响已有用户已经复制出来的食物。

### GET /admin/default-foods

获取默认模板食物。

权限: 登录用户。启用和禁用用户均可查看。

查询参数:

- `q`: 可选，按食物名称搜索。

响应: `FoodOut[]`

### POST /admin/default-foods

新增默认模板食物。

权限: 启用管理员。

请求: `FoodCreate`

响应: `FoodOut`

### PATCH /admin/default-foods/{food_id}

更新默认模板食物。

权限: 启用管理员。

请求: `FoodUpdate`

响应: `FoodOut`

### DELETE /admin/default-foods/{food_id}

删除默认模板食物。不会删除已有用户已经复制出来的食物。

权限: 启用管理员。

响应: `204 No Content`

## 后台用户食物接口

用户食物指真实用户拥有的食物，不包含 `user_id = 1` 默认模板。

### GET /admin/user-foods

获取真实用户食物列表。

权限: 登录用户。启用和禁用用户均可查看。

查询参数:

- `q`: 可选，按食物名称搜索。

响应: `AdminUserFoodListItem[]`

### PATCH /admin/user-foods/{food_id}

更新用户食物。

权限:

- 启用管理员可以更新任意真实用户食物。
- 启用普通用户只能更新自己 `user_id` 下的食物。
- 禁用用户和禁用管理员不能更新。

请求: `FoodUpdate`

响应: `AdminUserFoodListItem`

错误:

- `403`: 用户被禁用，或试图操作不属于自己的用户食物。
- `404`: 食物不存在。

### DELETE /admin/user-foods/{food_id}

删除用户食物，同时删除该用户该食物相关抽取记录。

权限:

- 启用管理员可以删除任意真实用户食物。
- 启用普通用户只能删除自己 `user_id` 下的食物。
- 禁用用户和禁用管理员不能删除。

响应: `204 No Content`

错误:

- `403`: 用户被禁用，或试图操作不属于自己的用户食物。
- `404`: 食物不存在。

## 重要业务规则

- `users.id = 1` 是 `default-template`，作为默认食物模板用户。
- 新用户注册时会复制 `user_id = 1` 的默认食物。
- 用户之间的食物和抽取记录互相隔离。
- `foods.is_active = false` 表示保留食物但不参与随机抽取。
- 用户账号 `is_active = false` 表示禁止写操作/抽取操作，但允许登录和查看只读数据。
- 用户列表页只做启用/禁用状态管理；用户删除放在用户权限页。
- 启用管理员才拥有后台写权限；禁用管理员按受限/只读用户处理。
- 修改密码、重置密码、修改角色会使目标用户旧 token 失效。
- 启用/禁用不会使目标用户旧 token 失效。
