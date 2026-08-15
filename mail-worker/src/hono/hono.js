import { Hono } from 'hono';
const app = new Hono();

import result from '../model/result';
import { cors } from 'hono/cors';

app.use('*', cors());

app.onError((err, c) => {
	const isAdminApi = c.req.path.startsWith('/admin/');
	const status = Number(err.code);
	const httpStatus = err.name === 'BizError' && status === 501
		? 400
		: (Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500);
	const fail = (message, code) => c.json(result.fail(message, code), isAdminApi ? code : undefined);

	if (err.name === 'BizError') {
		console.log(err.message);
	} else {
		console.error(err);
	}

	if (err.message === `Cannot read properties of undefined (reading 'get')`) {
		return fail('KV数据库未绑定 KV database not bound', 502);
	}

	if (err.message === `Cannot read properties of undefined (reading 'put')`) {
		return fail('KV数据库未绑定 KV database not bound', 502);
	}

	if (err.message === `Cannot read properties of undefined (reading 'prepare')`) {
		return fail('D1数据库未绑定 D1 database not bound', 502);
	}

	if (isAdminApi) return c.json(result.fail(err.message, httpStatus), httpStatus);
	return c.json(result.fail(err.message, err.code));
});

export default app;


