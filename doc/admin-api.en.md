# Administrator API

Administrator endpoints use the normal login JWT. Call `POST /api/login`, then send the returned `data.token` in the `Authorization` header. Only the account whose email matches the Worker `admin` variable (case-insensitive) can access `/api/admin/*`; other authenticated users receive HTTP `403`.

The main mailbox endpoints are:

- `GET /api/admin/emails`: cross-user list with body fields, user/sender/recipient addresses, and attachment summaries.
- `GET /api/admin/emails/{emailId}`: complete message detail, including HTML, text, recipients, and all attachments (also deleted messages).
- `GET /api/admin/emails/{emailId}/attachments`: all attachments, including embedded images.
- `GET /api/admin/emails/latest?emailId={id}`: new received messages after an ID.
- `PUT /api/admin/emails/read`, `PUT /api/admin/emails/trash`, `PUT /api/admin/emails/restore`.
- `DELETE /api/admin/emails?emailIds=1,2`: permanent deletion of messages and attachments.
- `POST /api/admin/emails/batch-delete`: permanent deletion by sender, subject, address, or time conditions.

User, mailbox-account, role, permission, settings, analytics, registration-key, and session endpoints are also grouped below `/api/admin/*`; see [admin-api.md](./admin-api.md) for the complete route table and request examples. Batch user creation returns any auto-generated passwords in `data.list` only in that response. The current administrator pages use these endpoints; existing `/api/allEmail/*` and other legacy routes remain available for compatibility.
