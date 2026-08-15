import app from '../hono/hono';
import result from '../model/result';
import { requireAdmin } from '../security/admin';
import adminService from '../service/admin-service';
import analysisService from '../service/analysis-service';
import permService from '../service/perm-service';
import regKeyService from '../service/reg-key-service';
import roleService from '../service/role-service';
import settingService from '../service/setting-service';
import userService from '../service/user-service';

function asList(value) {
	if (Array.isArray(value)) return value;
	if (value === undefined || value === null || value === '') return [];
	return String(value).split(',').map(item => item.trim()).filter(Boolean);
}

function rolePayload(body = {}) {
	return {
		...body,
		banEmail: asList(body.banEmail),
		availDomain: asList(body.availDomain),
		permIds: asList(body.permIds).map(Number)
	};
}

app.use('/admin/*', async (c, next) => {
	try {
		requireAdmin(c);
		return await next();
	} catch (error) {
		if (error?.name === 'BizError' && error.code >= 400 && error.code <= 599) {
			const status = error.code === 501 ? 400 : error.code;
			return c.json(result.fail(error.message, status), status);
		}
		throw error;
	}
});

app.get('/admin/session', async (c) => {
	return c.json(result.ok(await userService.loginUserInfo(c, requireAdmin(c).userId)));
});

app.get('/admin/emails', async (c) => {
	return c.json(result.ok(await adminService.emailList(c, c.req.query())));
});

app.get('/admin/emails/latest', async (c) => {
	return c.json(result.ok(await adminService.latestEmails(c, c.req.query())));
});

app.get('/admin/emails/:emailId/attachments', async (c) => {
	return c.json(result.ok(await adminService.emailAttachments(c, c.req.param('emailId'))));
});

app.get('/admin/emails/:emailId', async (c) => {
	return c.json(result.ok(await adminService.emailDetail(c, c.req.param('emailId'))));
});

app.put('/admin/emails/read', async (c) => {
	const body = await c.req.json();
	return c.json(result.ok(await adminService.readEmails(c, body.emailIds, body.unread)));
});

app.put('/admin/emails/restore', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	return c.json(result.ok(await adminService.restoreEmails(c, body.emailIds)));
});

app.put('/admin/emails/trash', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	return c.json(result.ok(await adminService.softDeleteEmails(c, body.emailIds)));
});

app.delete('/admin/emails', async (c) => {
	const body = c.req.header('content-type')?.includes('application/json') ? await c.req.json() : c.req.query();
	return c.json(result.ok(await adminService.deleteEmails(c, body.emailIds)));
});

app.post('/admin/emails/batch-delete', async (c) => {
	return c.json(result.ok(await adminService.batchDeleteEmails(c, await c.req.json())));
});

app.get('/admin/accounts', async (c) => {
	return c.json(result.ok(await adminService.accountList(c, c.req.query())));
});

app.post('/admin/accounts', async (c) => {
	return c.json(result.ok(await adminService.addAccount(c, await c.req.json())));
});

app.delete('/admin/accounts/:accountId', async (c) => {
	return c.json(result.ok(await adminService.deleteAccount(c, c.req.param('accountId'))));
});

app.put('/admin/accounts/:accountId/trash', async (c) => {
	return c.json(result.ok(await adminService.trashAccount(c, c.req.param('accountId'))));
});

app.put('/admin/accounts/:accountId/restore', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	return c.json(result.ok(await adminService.restoreAccount(c, c.req.param('accountId'), body.restoreData)));
});

app.put('/admin/accounts/:accountId/name', async (c) => {
	const body = await c.req.json();
	return c.json(result.ok(await adminService.setAccountName(c, c.req.param('accountId'), body.name)));
});

app.put('/admin/accounts/:accountId/receive', async (c) => {
	return c.json(result.ok(await adminService.setAccountReceive(c, c.req.param('accountId'))));
});

app.put('/admin/accounts/:accountId/top', async (c) => {
	return c.json(result.ok(await adminService.setAccountTop(c, c.req.param('accountId'))));
});

app.get('/admin/users', async (c) => {
	return c.json(result.ok(await adminService.userList(c, c.req.query())));
});

app.get('/admin/users/:userId/accounts', async (c) => {
	return c.json(result.ok(await adminService.userAccounts(c, c.req.param('userId'), c.req.query())));
});

app.get('/admin/users/:userId', async (c) => {
	return c.json(result.ok(await adminService.userDetail(c, c.req.param('userId'))));
});

app.post('/admin/users', async (c) => {
	const body = await c.req.json();
	await userService.add(c, body);
	return c.json(result.ok({ email: body.email }));
});

app.post('/admin/users/batch', async (c) => {
	const body = await c.req.json();
	const list = Array.isArray(body) ? body : body.list;
	if (!Array.isArray(list)) return c.json(result.fail('list must be an array', 400), 400);
	return c.json(result.ok(await adminService.addUsersBatch(c, list)));
});

app.delete('/admin/users', async (c) => {
	const body = c.req.header('content-type')?.includes('application/json') ? await c.req.json() : c.req.query();
	return c.json(result.ok(await adminService.deleteUsers(c, body.userIds)));
});

app.put('/admin/users/trash', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	return c.json(result.ok(await adminService.trashUsers(c, body.userIds)));
});

app.put('/admin/users/:userId/status', async (c) => {
	await adminService.setUserStatus(c, c.req.param('userId'), (await c.req.json()).status);
	return c.json(result.ok());
});

app.put('/admin/users/:userId/role', async (c) => {
	await adminService.setUserRole(c, c.req.param('userId'), (await c.req.json()).roleId);
	return c.json(result.ok());
});

app.put('/admin/users/:userId/password', async (c) => {
	await adminService.resetUserPassword(c, c.req.param('userId'), (await c.req.json()).password);
	return c.json(result.ok());
});

app.put('/admin/users/:userId/send-count/reset', async (c) => {
	await adminService.resetUserSendCount(c, c.req.param('userId'));
	return c.json(result.ok());
});

app.put('/admin/users/:userId/restore', async (c) => {
	const body = await c.req.json().catch(() => ({}));
	await adminService.restoreUser(c, c.req.param('userId'), body.includeData);
	return c.json(result.ok());
});

app.get('/admin/roles', async (c) => {
	return c.json(result.ok(await roleService.roleList(c)));
});

app.get('/admin/roles/select-use', async (c) => {
	return c.json(result.ok(await roleService.roleSelectUse(c)));
});

app.post('/admin/roles', async (c) => {
	await roleService.add(c, rolePayload(await c.req.json()), requireAdmin(c).userId);
	return c.json(result.ok());
});

app.put('/admin/roles/:roleId', async (c) => {
	await roleService.setRole(c, { ...rolePayload(await c.req.json()), roleId: Number(c.req.param('roleId')) });
	return c.json(result.ok());
});

app.delete('/admin/roles/:roleId', async (c) => {
	await roleService.delete(c, { roleId: c.req.param('roleId') });
	return c.json(result.ok());
});

app.put('/admin/roles/:roleId/default', async (c) => {
	await roleService.setDefault(c, { roleId: c.req.param('roleId') });
	return c.json(result.ok());
});

app.get('/admin/permissions', async (c) => {
	return c.json(result.ok(await permService.tree(c)));
});

app.get('/admin/settings', async (c) => {
	return c.json(result.ok(await settingService.get(c)));
});

app.put('/admin/settings', async (c) => {
	await settingService.set(c, await c.req.json());
	return c.json(result.ok());
});

app.put('/admin/settings/background', async (c) => {
	return c.json(result.ok(await settingService.setBackground(c, await c.req.json())));
});

app.delete('/admin/settings/background', async (c) => {
	await settingService.deleteBackground(c);
	return c.json(result.ok());
});

app.get('/admin/analytics', async (c) => {
	return c.json(result.ok(await analysisService.echarts(c, c.req.query())));
});

app.get('/admin/registration-keys', async (c) => {
	return c.json(result.ok(await regKeyService.list(c, c.req.query())));
});

app.post('/admin/registration-keys', async (c) => {
	await regKeyService.add(c, await c.req.json(), requireAdmin(c).userId);
	return c.json(result.ok());
});

app.delete('/admin/registration-keys', async (c) => {
	const body = c.req.header('content-type')?.includes('application/json') ? await c.req.json() : c.req.query();
	await regKeyService.delete(c, { ...body, regKeyIds: asList(body.regKeyIds) });
	return c.json(result.ok());
});

app.delete('/admin/registration-keys/expired', async (c) => {
	await regKeyService.clearNotUse(c);
	return c.json(result.ok());
});

app.get('/admin/registration-keys/:regKeyId/history', async (c) => {
	return c.json(result.ok(await regKeyService.history(c, { regKeyId: c.req.param('regKeyId') })));
});
