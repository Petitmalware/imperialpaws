function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 30,
  message = "Too many requests. Please wait a moment and try again."
} = {}) {
  const hits = new Map();
  let lastSweep = Date.now();

  return function rateLimiter(req, res, next) {
    const now = Date.now();

    if (now - lastSweep > windowMs) {
      for (const [key, entry] of hits.entries()) {
        if (entry.resetAt <= now) hits.delete(key);
      }
      lastSweep = now;
    }

    const routeKey = `${req.method}:${req.baseUrl || ""}${req.path || ""}`;
    const key = `${req.ip || req.socket.remoteAddress || "unknown"}:${routeKey}`;
    const existing = hits.get(key);
    const entry =
      existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + windowMs };

    entry.count += 1;
    hits.set(key, entry);

    const remaining = Math.max(0, max - entry.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));

    if (entry.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).send(message);
    }

    next();
  };
}

module.exports = {
  createRateLimiter
};
