export function configuredDomains(value) {
	let domains = value;
	if (typeof domains === 'string') {
		try {
			domains = JSON.parse(domains);
		} catch {
			domains = [domains];
		}
	}
	return (Array.isArray(domains) ? domains : [domains])
		.filter(Boolean)
		.map(domain => String(domain).replace(/^@/, '').trim().toLowerCase());
}

export function isConfiguredDomain(c, email) {
	if (typeof email !== 'string') return false;
	const at = email.lastIndexOf('@');
	if (at < 1) return false;
	return configuredDomains(c.env.domain).includes(email.slice(at + 1).toLowerCase());
}
