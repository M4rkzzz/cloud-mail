import { and, asc, count, desc, eq, gt, gte, inArray, like, lt, lte, ne, or, sql } from 'drizzle-orm';
import BizError from '../error/biz-error';
import { attConst, emailConst, isDel, userConst } from '../const/entity-const';
import account from '../entity/account';
import email from '../entity/email';
import user from '../entity/user';
import orm from '../entity/orm';
import { t } from '../i18n/i18n';
import attService from './att-service';
import accountService from './account-service';
import emailService from './email-service';
import userService from './user-service';
import emailUtils from '../utils/email-utils';
import verifyUtils from '../utils/verify-utils';
import { isAdminEmail } from '../security/admin';
import KvConst from '../const/kv-const';
import { pageParams, parseId, parseIdList, positiveInt } from '../utils/param-utils';
import { isConfiguredDomain } from '../utils/domain-utils';
import roleService from './role-service';
import cryptoUtils from '../utils/crypto-utils';

function optionalInteger(value, name, min = Number.MIN_SAFE_INTEGER) {
	if (value === undefined || value === null || value === '') return undefined;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < min) {
		throw new BizError(t('invalidId', { msg: name }), 400);
	}
	return parsed;
}

function containsInsensitive(column, value) {
	return sql`${column} COLLATE NOCASE LIKE ${'%' + String(value) + '%'}`;
}

function matchPattern(value, mode) {
	if (mode === 'left') return `${value}%`;
	if (mode === 'include') return `%${value}%`;
	return value;
}

function directionOf(params) {
	if (String(params.order || '').toLowerCase() === 'asc') return 'asc';
	if (String(params.order || '').toLowerCase() === 'desc') return 'desc';
	return Number(params.timeSort) === 1 ? 'asc' : 'desc';
}

function normalizeEmailType(value) {
	if (value === undefined || value === null || value === '' || value === 'all') return undefined;
	if (value === 'receive') return emailConst.type.RECEIVE;
	if (value === 'send') return emailConst.type.SEND;
	if (value === 'delete' || value === 'noone') return undefined;
	return optionalInteger(value, 'type', 0);
}

function normalizeStatus(value) {
	if (value === 'noone') return emailConst.status.NOONE;
	return optionalInteger(value, 'status', 0);
}

function emailFilterConditions(params) {
	const conditions = [ne(email.status, emailConst.status.SAVING)];
	const type = normalizeEmailType(params.type);
	const status = normalizeStatus(params.status);
	const deleted = optionalInteger(params.isDel, 'isDel', 0);

	if (type !== undefined) conditions.push(eq(email.type, type));
	if (params.type === 'delete') conditions.push(eq(email.isDel, isDel.DELETE));
	if (params.type === 'noone') conditions.push(eq(email.status, emailConst.status.NOONE));
	if (status !== undefined) conditions.push(eq(email.status, status));
	if (deleted !== undefined) conditions.push(eq(email.isDel, deleted));

	const userId = optionalInteger(params.userId, 'userId', 0);
	const accountId = optionalInteger(params.accountId, 'accountId', 0);
	if (userId !== undefined) conditions.push(eq(email.userId, userId));
	if (accountId !== undefined) conditions.push(eq(email.accountId, accountId));
	if (params.userEmail) conditions.push(containsInsensitive(user.email, params.userEmail));
	if (params.accountEmail) {
		conditions.push(or(
			containsInsensitive(account.email, params.accountEmail),
			containsInsensitive(email.toEmail, params.accountEmail),
			containsInsensitive(email.sendEmail, params.accountEmail)
		));
	}
	if (params.sendEmail) conditions.push(containsInsensitive(email.sendEmail, params.sendEmail));
	if (params.toEmail) conditions.push(containsInsensitive(email.toEmail, params.toEmail));
	if (params.name || params.sendName) conditions.push(containsInsensitive(email.name, params.name || params.sendName));
	if (params.subject) conditions.push(containsInsensitive(email.subject, params.subject));
	if (params.content) {
		conditions.push(or(
			containsInsensitive(email.content, params.content),
			containsInsensitive(email.text, params.content)
		));
	}
	if (params.startTime) conditions.push(gte(email.createTime, params.startTime));
	if (params.endTime) conditions.push(lte(email.createTime, params.endTime));

	return conditions;
}

function emailSelectFields() {
	return {
		...email,
		userEmail: user.email,
		accountEmail: account.email,
		accountName: account.name,
		accountIsDel: account.isDel
	};
}

function isPageRequest(params) {
	return params.page !== undefined || params.num !== undefined;
}

const adminService = {
	async emailList(c, params = {}) {
		const pageRequest = isPageRequest(params);
		const direction = directionOf(params);
		const size = positiveInt(params.size, pageRequest ? 20 : 50, 100);
		const baseConditions = emailFilterConditions(params);
		const queryConditions = [...baseConditions];
		let page = 1;
		let offset = 0;

		if (pageRequest) {
			({ page, offset } = pageParams(params, 100));
		} else {
			let cursor = optionalInteger(params.emailId, 'emailId', 0);
			if (cursor === undefined || cursor === 0) {
				cursor = direction === 'asc' ? 0 : Number.MAX_SAFE_INTEGER;
			}
			queryConditions.push(direction === 'asc' ? gt(email.emailId, cursor) : lt(email.emailId, cursor));
		}

		const listQuery = orm(c).select(emailSelectFields())
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.leftJoin(account, eq(email.accountId, account.accountId))
			.where(and(...queryConditions))
			.orderBy(direction === 'asc' ? asc(email.emailId) : desc(email.emailId))
			.limit(size)
			.offset(offset);

		const countQuery = orm(c).select({ total: count() })
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.leftJoin(account, eq(email.accountId, account.accountId))
			.where(and(...baseConditions))
			.get();

		const latestQuery = orm(c).select({ ...email })
			.from(email)
			.where(and(eq(email.type, emailConst.type.RECEIVE), ne(email.status, emailConst.status.SAVING)))
			.orderBy(desc(email.emailId))
			.limit(1)
			.get();

		const [list, totalRow, latestEmail] = await Promise.all([listQuery.all(), countQuery, latestQuery]);
		await emailService.emailAddAtt(c, list);

		return {
			list,
			total: Number(totalRow?.total || 0),
			page,
			size,
			latestEmail: latestEmail || { emailId: 0, accountId: 0, userId: 0 }
		};
	},

	async latestEmails(c, params = {}) {
		const cursor = optionalInteger(params.emailId, 'emailId', 0) ?? 0;
		const size = positiveInt(params.size, 20, 100);
		const conditions = emailFilterConditions({ ...params, type: 'receive' });
		conditions.push(gt(email.emailId, cursor));
		const list = await orm(c).select(emailSelectFields())
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.leftJoin(account, eq(email.accountId, account.accountId))
			.where(and(...conditions))
			.orderBy(desc(email.emailId))
			.limit(size)
			.all();
		await emailService.emailAddAtt(c, list);
		return list;
	},

	async emailDetail(c, emailId) {
		const id = parseId(emailId, 'emailId');
		const row = await orm(c).select(emailSelectFields())
			.from(email)
			.leftJoin(user, eq(email.userId, user.userId))
			.leftJoin(account, eq(email.accountId, account.accountId))
			.where(eq(email.emailId, id))
			.get();

		if (!row) throw new BizError(t('emailNotExist'), 404);

		const attachments = await attService.selectByEmailIds(c, [id], true);
		row.attachments = attachments;
		row.attList = attachments.filter(item => item.type === attConst.type.ATT);
		row.embeddedAttList = attachments.filter(item => item.type === attConst.type.EMBED);
		return row;
	},

	async emailAttachments(c, emailId) {
		const row = await this.emailDetail(c, emailId);
		return row.attachments;
	},

	async deleteEmails(c, emailIds) {
		const ids = parseIdList(emailIds, 'emailIds');
		const rows = await orm(c).select({ emailId: email.emailId }).from(email).where(inArray(email.emailId, ids)).all();
		if (rows.length) await emailService.physicsDelete(c, { emailIds: rows.map(row => row.emailId).join(',') });
		return { affected: rows.length };
	},

	async softDeleteEmails(c, emailIds) {
		const ids = parseIdList(emailIds, 'emailIds');
		const result = await orm(c).update(email).set({ isDel: isDel.DELETE }).where(inArray(email.emailId, ids)).run();
		return { affected: result.meta?.changes ?? 0 };
	},

	async restoreEmails(c, emailIds) {
		const ids = parseIdList(emailIds, 'emailIds');
		const result = await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(inArray(email.emailId, ids)).run();
		return { affected: result.meta?.changes ?? 0 };
	},

	async readEmails(c, emailIds, unread = emailConst.unread.READ) {
		const ids = parseIdList(emailIds, 'emailIds');
		const readStatus = optionalInteger(unread, 'unread', 0);
		if (![emailConst.unread.UNREAD, emailConst.unread.READ].includes(readStatus)) {
			throw new BizError(t('invalidRequestParams'), 400);
		}
		const result = await orm(c).update(email).set({ unread: readStatus }).where(inArray(email.emailId, ids)).run();
		return { affected: result.meta?.changes ?? 0 };
	},

	async batchDeleteEmails(c, params = {}) {
		const patternMode = params.matchType ?? params.type;
		const conditions = [ne(email.status, emailConst.status.SAVING)];
		if (params.userId !== undefined) conditions.push(eq(email.userId, optionalInteger(params.userId, 'userId', 0)));
		if (params.accountId !== undefined) conditions.push(eq(email.accountId, optionalInteger(params.accountId, 'accountId', 0)));
		if (params.sendName) conditions.push(like(email.name, matchPattern(params.sendName, patternMode)));
		if (params.subject) conditions.push(like(email.subject, matchPattern(params.subject, patternMode)));
		if (params.sendEmail) conditions.push(like(email.sendEmail, matchPattern(params.sendEmail, patternMode)));
		if (params.toEmail) conditions.push(like(email.toEmail, matchPattern(params.toEmail, patternMode)));
		if (params.startTime) conditions.push(gte(email.createTime, params.startTime));
		if (params.endTime) conditions.push(lte(email.createTime, params.endTime));
		if (conditions.length === 1) throw new BizError(t('emptyDeleteConditions'), 400);

		const rows = await orm(c).select({ emailId: email.emailId }).from(email).where(and(...conditions)).all();
		return rows.length ? this.deleteEmails(c, rows.map(row => row.emailId)) : { affected: 0 };
	},

	async accountList(c, params = {}) {
		const { page, size, offset } = pageParams(params, 100);
		const conditions = [];
		const userId = optionalInteger(params.userId, 'userId', 0);
		const deleted = optionalInteger(params.isDel, 'isDel', 0);
		if (userId !== undefined) conditions.push(eq(account.userId, userId));
		if (deleted !== undefined) conditions.push(eq(account.isDel, deleted));
		if (params.email) conditions.push(containsInsensitive(account.email, params.email));
		if (params.userEmail) conditions.push(containsInsensitive(user.email, params.userEmail));
		const where = conditions.length ? and(...conditions) : undefined;
		let listQuery = orm(c).select({
			...account,
			userEmail: user.email,
			userStatus: user.status,
			userIsDel: user.isDel
		}).from(account).leftJoin(user, eq(account.userId, user.userId));
		let countQuery = orm(c).select({ total: count() }).from(account).leftJoin(user, eq(account.userId, user.userId));
		if (where) {
			listQuery = listQuery.where(where);
			countQuery = countQuery.where(where);
		}
		const [list, totalRow] = await Promise.all([
			listQuery.orderBy(desc(account.accountId)).limit(size).offset(offset).all(),
			countQuery.get()
		]);
		return { list, total: Number(totalRow?.total || 0), page, size };
	},

	async addAccount(c, params = {}) {
		const emailValue = String(params.email || '').trim();
		if (!verifyUtils.isEmail(emailValue)) throw new BizError(t('notEmail'), 400);
		if (!isConfiguredDomain(c, emailValue)) {
			throw new BizError(t('notExistDomain'), 400);
		}
		const userId = parseId(params.userId, 'userId');
		const userRow = await userService.selectByIdIncludeDel(c, userId);
		if (!userRow || userRow.isDel === isDel.DELETE) throw new BizError(t('userNotExist'), 404);
		const existing = await accountService.selectByEmailIncludeDel(c, emailValue);
		if (existing) throw new BizError(existing.isDel === isDel.DELETE ? t('isDelAccount') : t('isRegAccount'));
		const name = String(params.name ?? emailUtils.getName(emailValue));
		if (name.length > 30) throw new BizError(t('usernameLengthLimit'), 400);
		return orm(c).insert(account).values({ userId, email: emailValue, name }).returning().get();
	},

	async deleteAccount(c, accountId) {
		const id = parseId(accountId, 'accountId');
		const row = await orm(c).select().from(account).where(eq(account.accountId, id)).get();
		if (!row) throw new BizError(t('accountNotExist'), 404);
		const owner = await userService.selectByIdIncludeDel(c, row.userId);
		if (owner && String(owner.email).toLowerCase() === String(row.email).toLowerCase()) {
			throw new BizError(t('delMyAccount'), 400);
		}
		await accountService.physicsDelete(c, { accountId: id });
		return { affected: 1 };
	},

	async restoreAccount(c, accountId, restoreData = false) {
		const id = parseId(accountId, 'accountId');
		const row = await orm(c).select().from(account).where(eq(account.accountId, id)).get();
		if (!row) throw new BizError(t('accountNotExist'), 404);
		const result = await orm(c).update(account).set({ isDel: isDel.NORMAL }).where(eq(account.accountId, id)).run();
		if (restoreData) await orm(c).update(email).set({ isDel: isDel.NORMAL }).where(eq(email.accountId, id)).run();
		return { affected: result.meta?.changes ?? 0 };
	},

	async trashAccount(c, accountId) {
		const id = parseId(accountId, 'accountId');
		const row = await orm(c).select().from(account).where(eq(account.accountId, id)).get();
		if (!row) throw new BizError(t('accountNotExist'), 404);
		const owner = await userService.selectByIdIncludeDel(c, row.userId);
		if (owner && String(owner.email).toLowerCase() === String(row.email).toLowerCase()) {
			throw new BizError(t('delMyAccount'), 400);
		}
		const result = await orm(c).update(account).set({ isDel: isDel.DELETE }).where(eq(account.accountId, id)).run();
		return { affected: result.meta?.changes ?? 0 };
	},

	async userList(c, params = {}) {
		const { page, size } = pageParams(params, 50);
		const deletedStatus = params.status === -2 || params.status === '-2';
		const data = await userService.list(c, {
			num: page,
			size,
			email: params.email || '',
			timeSort: directionOf(params) === 'asc' ? 1 : 0,
			status: deletedStatus ? -1 : (params.status === undefined ? -1 : params.status),
			isDel: deletedStatus ? isDel.DELETE : params.isDel
		});
		return { ...data, list: data.list.map(sanitizeUser) };
	},

	async userDetail(c, userId) {
		const id = parseId(userId, 'userId');
		const row = await userService.selectByIdIncludeDel(c, id);
		if (!row) throw new BizError(t('userNotExist'), 404);
		row.accounts = await orm(c).select().from(account).where(eq(account.userId, id)).orderBy(desc(account.accountId)).all();
		return sanitizeUser(row);
	},

	async userAccounts(c, userId, params = {}) {
		const id = parseId(userId, 'userId');
		const row = await userService.selectByIdIncludeDel(c, id);
		if (!row) throw new BizError(t('userNotExist'), 404);
		const { page, size } = pageParams(params, 100);
		const rows = await orm(c).select().from(account)
			.where(eq(account.userId, id))
			.orderBy(desc(account.accountId))
			.limit(size)
			.offset((page - 1) * size)
			.all();
		const totalRow = await orm(c).select({ total: count() }).from(account).where(eq(account.userId, id)).get();
		return { list: rows, total: Number(totalRow?.total || 0), page, size };
	},

	async setAccountName(c, accountId, name) {
		const id = parseId(accountId, 'accountId');
		const value = String(name ?? '');
		if (value.length > 30) throw new BizError(t('usernameLengthLimit'), 400);
		const result = await orm(c).update(account).set({ name: value }).where(eq(account.accountId, id)).run();
		if (!(result.meta?.changes ?? 0)) throw new BizError(t('accountNotExist'), 404);
		return { affected: result.meta?.changes ?? 0 };
	},

	async setAccountReceive(c, accountId) {
		const id = parseId(accountId, 'accountId');
		const row = await orm(c).select().from(account).where(eq(account.accountId, id)).get();
		if (!row) throw new BizError(t('accountNotExist'), 404);
		await orm(c).update(account).set({ allReceive: 0 }).where(eq(account.userId, row.userId)).run();
		await orm(c).update(account).set({ allReceive: row.allReceive ? 0 : 1 }).where(eq(account.accountId, id)).run();
		return { allReceive: row.allReceive ? 0 : 1 };
	},

	async setAccountTop(c, accountId) {
		const id = parseId(accountId, 'accountId');
		const row = await orm(c).select().from(account).where(eq(account.accountId, id)).get();
		if (!row) throw new BizError(t('accountNotExist'), 404);
		const maxSort = await orm(c).select({ value: sql`COALESCE(MAX(${account.sort}), 0)` }).from(account).where(eq(account.userId, row.userId)).get();
		const nextSort = Number(maxSort?.value || 0) + 1;
		await orm(c).update(account).set({ sort: nextSort }).where(eq(account.accountId, id)).run();
		return { sort: nextSort };
	},

	async assertMutableUser(c, userId) {
		const id = parseId(userId, 'userId');
		const row = await userService.selectByIdIncludeDel(c, id);
		if (!row) throw new BizError(t('userNotExist'), 404);
		if (isAdminEmail(c, row.email)) throw new BizError(t('adminAccountProtected'), 403);
		return { id, row };
	},

	async setUserStatus(c, userId, status) {
		const { id } = await this.assertMutableUser(c, userId);
		const nextStatus = optionalInteger(status, 'status', 0);
		if (![userConst.status.NORMAL, userConst.status.BAN].includes(nextStatus)) throw new BizError(t('invalidRequestParams'), 400);
		await userService.setStatus(c, { userId: id, status: nextStatus });
	},

	async setUserRole(c, userId, roleId) {
		const { id } = await this.assertMutableUser(c, userId);
		await userService.setType(c, { userId: id, type: parseId(roleId, 'roleId') });
	},

	async resetUserPassword(c, userId, password) {
		const { id } = await this.assertMutableUser(c, userId);
		await userService.setPwd(c, { userId: id, password: String(password || '') });
	},

	async resetUserSendCount(c, userId) {
		const { id } = await this.assertMutableUser(c, userId);
		await userService.resetSendCount(c, { userId: id });
	},

	async restoreUser(c, userId, includeData = 0) {
		const { id } = await this.assertMutableUser(c, userId);
		await userService.restore(c, { userId: id, type: optionalInteger(includeData, 'includeData', 0) || 0 });
	},

	async trashUsers(c, userIds) {
		const ids = parseIdList(userIds, 'userIds');
		for (const id of ids) await this.assertMutableUser(c, id);
		const result = await orm(c).update(user).set({ isDel: isDel.DELETE }).where(inArray(user.userId, ids)).run();
		await Promise.all(ids.map(id => c.env.kv.delete(KvConst.AUTH_INFO + id)));
		return { affected: result.meta?.changes ?? 0 };
	},

	async deleteUsers(c, userIds) {
		const ids = parseIdList(userIds, 'userIds');
		for (const id of ids) await this.assertMutableUser(c, id);
		const rows = await orm(c).select({ userId: user.userId }).from(user).where(inArray(user.userId, ids)).all();
		if (rows.length) {
			await userService.physicsDelete(c, { userIds: rows.map(row => row.userId).join(',') });
		}
		return { affected: rows.length };
	},

	async addUsersBatch(c, list) {
		if (!Array.isArray(list) || !list.length) throw new BizError(t('invalidRequestParams'), 400);
		const roleList = await roleService.roleSelectUse(c);
		const defaultRole = roleList.find(role => role.isDefault === 1) || roleList[0];
		if (!defaultRole) throw new BizError(t('roleNotExist'));
		const created = [];
		for (const item of list) {
			const role = item.type
				? roleList.find(row => row.roleId === Number(item.type))
				: roleList.find(row => row.name === item.roleName) || defaultRole;
			if (!role) throw new BizError(t('roleNotExist'));
			const generatedPassword = !item.password;
			const password = item.password || cryptoUtils.genRandomPwd();
			await userService.add(c, {
				email: item.email,
				type: role.roleId,
				password
			});
			created.push({ email: item.email, roleId: role.roleId, ...(generatedPassword ? { password } : {}) });
		}
		return { affected: created.length, list: created };
	}
};

function sanitizeUser(row) {
	const { password, salt, ...safe } = row;
	return safe;
}

export default adminService;
