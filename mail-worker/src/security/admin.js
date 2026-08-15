import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

function normalizeEmail(value) {
	return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isAdminEmail(c, email) {
	return normalizeEmail(email) !== '' && normalizeEmail(email) === normalizeEmail(c.env.admin);
}

export function isAdmin(c, currentUser = c.get?.('user')) {
	return !!currentUser && isAdminEmail(c, currentUser.email);
}

export function requireAdmin(c) {
	if (!isAdmin(c)) {
		throw new BizError(t('unauthorized'), 403);
	}

	return c.get('user');
}
