# 管理员 API

管理员接口使用现有登录 JWT，不使用公开 API token。先调用 `POST /api/login`，再把返回的 `data.token` 放入 `Authorization` 请求头：

```http
Authorization: <JWT>
```

只有邮箱与 Worker `admin` 配置（忽略大小写）一致的账号可以访问 `/api/admin/*`。普通账号即使拥有普通 RBAC 权限，也会收到 HTTP `403`。

## 邮件（跨用户）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/emails` | 全量邮件分页/游标列表，返回正文、纯文本、用户邮箱、发件/收件邮箱和附件摘要 |
| GET | `/api/admin/emails/{emailId}` | 邮件完整详情，包含 `content`、`text`、`recipient`、全部附件；已删除邮件也可读取 |
| GET | `/api/admin/emails/{emailId}/attachments` | 获取全部附件（含内嵌图片） |
| GET | `/api/admin/emails/latest?emailId={id}` | 获取指定 ID 后的新收件邮件 |
| PUT | `/api/admin/emails/read` | `{ "emailIds": [1,2], "unread": 1 }` 标记已读/未读 |
| PUT | `/api/admin/emails/trash` | `{ "emailIds": [1,2] }` 软删除 |
| PUT | `/api/admin/emails/restore` | `{ "emailIds": [1,2] }` 恢复 |
| DELETE | `/api/admin/emails?emailIds=1,2` | 永久删除邮件及附件 |
| POST | `/api/admin/emails/batch-delete` | 按发件人、主题、地址或时间条件永久删除 |

列表支持 `page`/`size` 分页；不传 `page` 时兼容前端的 `emailId` 游标和 `timeSort`（`0` 倒序、`1` 正序）。常用筛选参数包括 `type=receive|send|delete|noone`、`userEmail`、`accountEmail`、`sendEmail`、`toEmail`、`name`、`subject`、`content`、`startTime`、`endTime`。

## 用户、邮箱账号

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/admin/users` / `/api/admin/users/{userId}` | 用户列表/详情（详情含全部邮箱账号） |
| GET | `/api/admin/users/{userId}/accounts` | 查询指定用户的全部邮箱账号（分页） |
| POST | `/api/admin/users` | 创建单个用户 |
| POST | `/api/admin/users/batch` | 批量创建用户，body 为 `{ "list": [...] }`；未提供密码时，响应 `data.list` 会返回自动生成的密码（仅本次响应可见） |
| PUT | `/api/admin/users/{userId}/status` | 启用或禁用用户 |
| PUT | `/api/admin/users/{userId}/role` | 修改用户角色 |
| PUT | `/api/admin/users/{userId}/password` | 重置密码 |
| PUT | `/api/admin/users/{userId}/send-count/reset` | 重置发件计数 |
| PUT | `/api/admin/users/{userId}/restore` | 恢复用户，可传 `includeData: 1` 同步恢复其数据 |
| PUT | `/api/admin/users/trash` | 软删除用户 |
| DELETE | `/api/admin/users?userIds=1,2` | 永久删除用户、账号、邮件和 OAuth 绑定 |
| GET | `/api/admin/accounts` | 跨用户邮箱账号列表 |
| POST | `/api/admin/accounts` | `{ "userId": 2, "email": "alias@example.com", "name": "Alias" }` 添加账号 |
| PUT/DELETE | `/api/admin/accounts/{accountId}/...` | 账号名称、置顶、全收取、软删除、恢复或永久删除 |

## 系统管理

以下接口分别对应用户管理页面现有功能：

- `/api/admin/roles`、`/api/admin/roles/select-use`、`/api/admin/permissions`
- `/api/admin/settings`、`/api/admin/settings/background`
- `/api/admin/analytics`
- `/api/admin/registration-keys`、`/api/admin/registration-keys/{id}/history`、`/api/admin/registration-keys/expired`
- `/api/admin/session` 返回当前管理员信息和 `permKeys: ["*"]`

旧的 `/api/allEmail/*`、`/api/user/*` 等接口继续保留以兼容已有调用；当前管理员页面（全部邮件、用户、角色、系统设置、分析和注册密钥）的管理请求统一走 `/api/admin/*`，邮件详情也不再依赖列表缓存中的不完整对象。
