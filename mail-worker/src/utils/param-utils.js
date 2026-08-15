import BizError from '../error/biz-error';
import { t } from '../i18n/i18n';

const DEFAULT_MAX_PAGE_SIZE = 100;

function toInteger(value, fallback, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}) {
	if (value === undefined || value === null || value === '') {
		return fallback;
	}

	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
		throw new BizError(t('invalidRequestParams'), 400);
	}

	return parsed;
}

export function positiveInt(value, fallback, max = Number.MAX_SAFE_INTEGER) {
	return toInteger(value, fallback, { min: 1, max });
}

export function nonNegativeInt(value, fallback = 0) {
	return toInteger(value, fallback, { min: 0 });
}

export function pageParams(params, maxSize = DEFAULT_MAX_PAGE_SIZE) {
	const page = positiveInt(params.page ?? params.num, 1);
	const size = positiveInt(params.size, 20, maxSize);
	return { page, size, offset: (page - 1) * size };
}

export function parseId(value, name = 'id') {
	if (value === undefined || value === null || value === '') {
		throw new BizError(t('invalidId', { msg: name }), 400);
	}

	try {
		return positiveInt(value);
	} catch (error) {
		if (error instanceof BizError) {
			throw new BizError(t('invalidId', { msg: name }), 400);
		}
		throw error;
	}
}

export function parseIdList(value, name = 'id') {
	const source = Array.isArray(value) ? value : String(value ?? '').split(',');
	const ids = [...new Set(source.filter(item => item !== '').map(item => parseId(item, name)))];

	if (!ids.length) {
		throw new BizError(t('invalidId', { msg: name }), 400);
	}

	return ids;
}
