/**
 * Cloudflare Pages Function: /api/ambient
 *
 * Proxies the Ambient Weather devices endpoint so API keys stay
 * server-side. Configure two encrypted environment variables on the
 * Pages project (Settings -> Environment variables):
 *
 *   AMBIENT_API_KEY  -> your account API key
 *   AMBIENT_APP_KEY  -> your application key
 *
 * Both Production and Preview environments need them set.
 *
 * NOTE: After deploying this, rotate the keys that were previously
 * embedded in the client. Treat the originals as compromised.
 */

export async function onRequestGet(context) {
    const { env } = context;
    const apiKey = env.AMBIENT_API_KEY;
    const appKey = env.AMBIENT_APP_KEY;

    if (!apiKey || !appKey) {
        return jsonError(500, "Ambient credentials not configured on this deployment.");
    }

    const upstream =
        "https://api.ambientweather.net/v1/devices" +
        `?applicationKey=${encodeURIComponent(appKey)}` +
        `&apiKey=${encodeURIComponent(apiKey)}`;

    try {
        const res = await fetch(upstream, {
            // Ambient is sometimes slow; bound the wait.
            signal: AbortSignal.timeout(8000),
            headers: { Accept: "application/json" }
        });

        if (!res.ok) {
            return jsonError(502, `Ambient upstream returned ${res.status}.`);
        }

        const body = await res.text();

        return new Response(body, {
            status: 200,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                // Short edge cache to absorb refresh storms without
                // blowing the 1 req/sec Ambient rate limit.
                "Cache-Control": "public, max-age=20, s-maxage=20",
                "X-Proxy": "franklin-weather"
            }
        });
    } catch (err) {
        return jsonError(504, `Proxy fetch failed: ${err.message || "unknown"}`);
    }
}

function jsonError(status, message) {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8" }
    });
}
