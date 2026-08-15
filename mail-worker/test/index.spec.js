import { env, SELF } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';

const ADMIN_EMAIL = 'ADMIN@example.com';
const USER_EMAIL = 'alice@example.com';
const PASSWORD = 'secret123';

async function hashPassword(password, salt) {
	const data = new TextEncoder().encode(salt + password);
	const hash = await crypto.subtle.digest('SHA-256', data);
	return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function api(path, options = {}) {
	const response = await SELF.fetch(`http://example.com/api${path}`, options);
	const body = await response.json();
	return { response, body };
}

async function login(email) {
	const { body } = await api('/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email, password: PASSWORD })
	});
	expect(body.code).toBe(200);
	return body.data.token;
}

describe('administrator mailbox API', () => {
	let adminToken;
	let userToken;
	let adminUserId;
	let userId;
	let userAccountId;
	let privateEmailId;

	beforeAll(async () => {
		const initResponse = await SELF.fetch(`http://example.com/api/init/${env.jwt_secret}`);
		expect(await initResponse.text()).toBe('success');

		const salt = 'test-salt';
		const passwordHash = await hashPassword(PASSWORD, salt);
		await env.db.batch([
			env.db.prepare('INSERT INTO user (email, type, password, salt, status, is_del) VALUES (?, 1, ?, ?, 0, 0)').bind(ADMIN_EMAIL, passwordHash, salt),
			env.db.prepare('INSERT INTO user (email, type, password, salt, status, is_del) VALUES (?, 1, ?, ?, 0, 0)').bind(USER_EMAIL, passwordHash, salt)
		]);

		const adminRow = await env.db.prepare('SELECT user_id FROM user WHERE email = ?').bind(ADMIN_EMAIL).first();
		const userRow = await env.db.prepare('SELECT user_id FROM user WHERE email = ?').bind(USER_EMAIL).first();
		adminUserId = adminRow.user_id;
		userId = userRow.user_id;
		await env.db.batch([
			env.db.prepare('INSERT INTO account (email, name, user_id, is_del) VALUES (?, ?, ?, 0)').bind(ADMIN_EMAIL, 'Admin', adminRow.user_id),
			env.db.prepare('INSERT INTO account (email, name, user_id, is_del) VALUES (?, ?, ?, 0)').bind(USER_EMAIL, 'Alice', userRow.user_id)
		]);

		const adminAccount = await env.db.prepare('SELECT account_id FROM account WHERE email = ?').bind(ADMIN_EMAIL).first();
		const userAccount = await env.db.prepare('SELECT account_id FROM account WHERE email = ?').bind(USER_EMAIL).first();
		userAccountId = userAccount.account_id;
		await env.db.prepare(`
			INSERT INTO email (send_email, name, account_id, user_id, subject, content, text, recipient, to_email, to_name, type, status, unread, is_del)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0)
		`).bind(
			'outside@example.net', 'Outside sender', userAccount.account_id, userRow.user_id,
			'Private message', '<p>private body</p>', 'private body', JSON.stringify([{ address: USER_EMAIL, name: 'Alice' }]), USER_EMAIL, 'Alice'
		).run();
		const emailRow = await env.db.prepare('SELECT email_id FROM email WHERE user_id = ?').bind(userRow.user_id).first();
		privateEmailId = emailRow.email_id;
		await env.db.prepare(`
			INSERT INTO attachments (user_id, email_id, account_id, key, filename, mime_type, size, type)
			VALUES (?, ?, ?, ?, ?, ?, ?, 0)
		`).bind(userRow.user_id, emailRow.email_id, userAccount.account_id, 'attachments/private.txt', 'private.txt', 'text/plain', 12).run();

		adminToken = await login(ADMIN_EMAIL);
		userToken = await login(USER_EMAIL);
	});

	it('lets the configured admin read another user mailbox, body, and attachments', async () => {
		const list = await api('/admin/emails?type=receive&size=10', {
			headers: { Authorization: adminToken }
		});
		expect(list.body.code).toBe(200);
		expect(list.body.data.list).toHaveLength(1);
		expect(list.body.data.list[0].userEmail).toBe(USER_EMAIL);
		expect(list.body.data.list[0].content).toContain('private body');

		const detail = await api(`/admin/emails/${list.body.data.list[0].emailId}`, {
			headers: { Authorization: adminToken }
		});
		expect(detail.body.code).toBe(200);
		expect(detail.body.data.content).toContain('private body');
		expect(detail.body.data.attachments[0].filename).toBe('private.txt');
	});

	it('rejects a normal user on every administrator endpoint', async () => {
		const { response, body } = await api('/admin/emails', {
			headers: { Authorization: userToken }
		});
		expect(response.status).toBe(403);
		expect(body.code).toBe(403);
	});

	it('returns the administrator session with wildcard permissions', async () => {
		const { body } = await api('/admin/session', {
			headers: { Authorization: adminToken }
		});
		expect(body.code).toBe(200);
		expect(body.data.email).toBe(ADMIN_EMAIL);
		expect(body.data.permKeys).toContain('*');
	});

	it('supports ascending cursors and preserves API error status codes', async () => {
		const ascending = await api('/admin/emails?type=receive&size=10&timeSort=1', {
			headers: { Authorization: adminToken }
		});
		expect(ascending.response.status).toBe(200);
		expect(ascending.body.data.list[0].emailId).toBeGreaterThan(0);

		const missing = await api('/admin/emails/999999', {
			headers: { Authorization: adminToken }
		});
		expect(missing.response.status).toBe(404);
		expect(missing.body.code).toBe(404);
	});

	it('exposes the remaining administrator resources', async () => {
		const paths = [
			'/admin/users?page=1&size=10',
			'/admin/accounts?page=1&size=10',
			'/admin/roles',
			'/admin/roles/select-use',
			'/admin/permissions',
			'/admin/settings',
			'/admin/analytics?timeZone=Asia%2FShanghai',
			'/admin/registration-keys'
		];
		for (const path of paths) {
			const { response, body } = await api(path, { headers: { Authorization: adminToken } });
			expect(response.status, path).toBe(200);
			expect(body.code, path).toBe(200);
		}
	});

	it('manages another user mailbox without exposing password hashes', async () => {
		const detail = await api(`/admin/users/${userId}`, {
			headers: { Authorization: adminToken }
		});
		expect(detail.response.status).toBe(200);
		expect(detail.body.data.password).toBeUndefined();
		expect(detail.body.data.salt).toBeUndefined();

		const addAccount = await api('/admin/accounts', {
			method: 'POST',
			headers: { Authorization: adminToken, 'content-type': 'application/json' },
			body: JSON.stringify({ userId, email: 'alias@example.com', name: 'Alias' })
		});
		expect(addAccount.response.status).toBe(200);
		const accountId = addAccount.body.data.accountId;

		for (const [path, payload] of [
			[`/admin/accounts/${accountId}/name`, { name: 'Renamed Alias' }],
			[`/admin/accounts/${accountId}/receive`, {}],
			[`/admin/accounts/${accountId}/top`, {}],
			[`/admin/accounts/${accountId}/trash`, {}],
			[`/admin/accounts/${accountId}/restore`, { restoreData: 1 }]
		]) {
			const { response, body } = await api(path, {
				method: 'PUT',
				headers: { Authorization: adminToken, 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			expect(response.status, path).toBe(200);
			expect(body.code, path).toBe(200);
		}

		const userAccounts = await api(`/admin/users/${userId}/accounts?page=1&size=20`, {
			headers: { Authorization: adminToken }
		});
		expect(userAccounts.body.data.list.some(row => row.accountId === accountId)).toBe(true);

		const removed = await api(`/admin/accounts/${accountId}`, {
			method: 'DELETE',
			headers: { Authorization: adminToken }
		});
		expect(removed.response.status).toBe(200);
		expect(await env.db.prepare('SELECT account_id FROM account WHERE account_id = ?').bind(accountId).first()).toBeNull();
	});

	it('supports email read, trash, restore, and attachment routes', async () => {
		const attachments = await api(`/admin/emails/${privateEmailId}/attachments`, {
			headers: { Authorization: adminToken }
		});
		expect(attachments.response.status).toBe(200);
		expect(attachments.body.data[0].filename).toBe('private.txt');

		for (const [path, payload] of [
			['/admin/emails/read', { emailIds: [privateEmailId], unread: 1 }],
			['/admin/emails/trash', { emailIds: [privateEmailId] }],
			['/admin/emails/restore', { emailIds: [privateEmailId] }]
		]) {
			const { response, body } = await api(path, {
				method: 'PUT',
				headers: { Authorization: adminToken, 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			expect(response.status, path).toBe(200);
			expect(body.data.affected, path).toBe(1);
		}

		const row = await env.db.prepare('SELECT unread, is_del FROM email WHERE email_id = ?').bind(privateEmailId).first();
		expect(row).toMatchObject({ unread: 1, is_del: 0 });
	});

	it('protects the configured administrator account from mutation', async () => {
		for (const [path, method, payload] of [
			[`/admin/users/${adminUserId}/status`, 'PUT', { status: 1 }],
			[`/admin/users/${adminUserId}/role`, 'PUT', { roleId: 1 }],
			[`/admin/users/${adminUserId}/password`, 'PUT', { password: 'changed-password' }]
		]) {
			const { response, body } = await api(path, {
				method,
				headers: { Authorization: adminToken, 'content-type': 'application/json' },
				body: JSON.stringify(payload)
			});
			expect(response.status, path).toBe(403);
			expect(body.code, path).toBe(403);
		}

		const deleted = await api(`/admin/users?userIds=${adminUserId}`, {
			method: 'DELETE',
			headers: { Authorization: adminToken }
		});
		expect(deleted.response.status).toBe(403);
		expect(await env.db.prepare('SELECT user_id FROM user WHERE user_id = ?').bind(adminUserId).first()).not.toBeNull();
	});

	it('creates users in bulk and returns generated credentials once', async () => {
		const created = await api('/admin/users/batch', {
			method: 'POST',
			headers: { Authorization: adminToken, 'content-type': 'application/json' },
			body: JSON.stringify({ list: [{ email: 'generated@example.com' }] })
		});
		expect(created.response.status).toBe(200);
		expect(created.body.data.affected).toBe(1);
		expect(created.body.data.list[0].email).toBe('generated@example.com');
		expect(created.body.data.list[0].password).toHaveLength(8);
		const stored = await env.db.prepare('SELECT password, salt FROM user WHERE email = ?').bind('generated@example.com').first();
		expect(stored.password).not.toBe(created.body.data.list[0].password);
		expect(stored.salt).toBeTruthy();
	});

	it('validates destructive requests and missing resources', async () => {
		const invalidUser = await api('/admin/users', {
			method: 'POST',
			headers: { Authorization: adminToken, 'content-type': 'application/json' },
			body: JSON.stringify({ email: 'invalid@example.com', type: 1, password: 'short' })
		});
		expect(invalidUser.response.status).toBe(400);
		expect(invalidUser.body.code).toBe(400);

		const emptyDelete = await api('/admin/emails/batch-delete', {
			method: 'POST',
			headers: { Authorization: adminToken, 'content-type': 'application/json' },
			body: '{}'
		});
		expect(emptyDelete.response.status).toBe(400);

		const missingAccount = await api('/admin/accounts/999999/restore', {
			method: 'PUT',
			headers: { Authorization: adminToken, 'content-type': 'application/json' },
			body: '{}'
		});
		expect(missingAccount.response.status).toBe(404);
		expect(missingAccount.body.code).toBe(404);

		const mainAccountDelete = await api(`/admin/accounts/${userAccountId}`, {
			method: 'DELETE',
			headers: { Authorization: adminToken }
		});
		expect(mainAccountDelete.response.status).toBe(400);
		expect(mainAccountDelete.body.code).toBe(400);
	});
});
