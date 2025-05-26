interface Env {
	CORS_ALLOW_ORIGIN: string;
	HELIUS_API_KEY: string;
	NETWORK?: string;
}

function isOriginAllowed(origin: string, allowedOrigins: string[]): boolean {
	for (const allowedOrigin of allowedOrigins) {
		// Check if it's a regex pattern (prefixed with @)
		if (allowedOrigin.startsWith('@')) {
			try {
				const regexPattern = allowedOrigin.slice(1); // Remove the @ prefix
				const regex = new RegExp(regexPattern);
				if (regex.test(origin)) {
					return true;
				}
			} catch (error) {
				// If regex is invalid, skip this pattern and continue
				continue;
			}
		} else {
			// Exact string match for non-regex patterns
			if (origin === allowedOrigin) {
				return true;
			}
		}
	}
	return false;
}

export default {
	async fetch(request: Request, env: Env) {
		// If the request is an OPTIONS request, return a 200 response with permissive CORS headers
		// This is required for the Helius RPC Proxy to work from the browser and arbitrary origins
		// If you wish to restrict the origins that can access your Helius RPC Proxy, you can do so by
		// changing the `*` in the `Access-Control-Allow-Origin` header to a specific origin.
		// For example, if you wanted to allow requests from `https://example.com`, you would change the
		// header to `https://example.com`. Multiple domains are supported by verifying that the request
		// originated from one of the domains in the `CORS_ALLOW_ORIGIN` environment variable.
		//
		// Regex patterns are also supported by prefixing them with '@'. For example:
		// @https://(.+)-blueprint-finance\.vercel\.app would match https://dev-blueprint-finance.vercel.app
		const supportedDomains = env.CORS_ALLOW_ORIGIN ? env.CORS_ALLOW_ORIGIN.split(',') : undefined;
		const network = env.NETWORK ? env.NETWORK : 'devnet';

		const corsHeaders: Record<string, string> = {
			'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, OPTIONS',
			'Access-Control-Allow-Headers': '*',
		};
		if (supportedDomains) {
			const origin = request.headers.get('Origin');
			if (origin && isOriginAllowed(origin, supportedDomains)) {
				corsHeaders['Access-Control-Allow-Origin'] = origin;
			}
		} else {
			corsHeaders['Access-Control-Allow-Origin'] = '*';
		}

		if (request.method === 'OPTIONS') {
			return new Response(null, {
				status: 200,
				headers: corsHeaders,
			});
		}

		const upgradeHeader = request.headers.get('Upgrade');

		if (upgradeHeader || upgradeHeader === 'websocket') {
			return await fetch(
				`https://${network}.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`,
				request
			);
		}

		const { pathname, search } = new URL(request.url);
		const payload = await request.text();
		const proxyRequest = new Request(
			`https://${network}.helius-rpc.com${pathname}?api-key=${env.HELIUS_API_KEY}${
				search ? `&${search.slice(1)}` : ''
			}`,
			{
				method: request.method,
				body: payload || null,
				headers: {
					'Content-Type': 'application/json',
					'X-Helius-Cloudflare-Proxy': 'true',
				},
			}
		);

		return await fetch(proxyRequest).then(res => {
			return new Response(res.body, {
				status: res.status,
				headers: corsHeaders,
			});
		});
	},
};
