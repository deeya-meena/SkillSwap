/**
 * In-memory rate limiting middleware with zero external dependencies.
 */
const createRateLimiter = ({
  windowMs = 15 * 60 * 1000,
  max = 5,
  message = 'Too many requests, please try again later',
  keyGenerator = (req) => req.ip || req.socket?.remoteAddress || 'unknown_client',
} = {}) => {
  const hits = new Map();

  // Periodic cleanup of stale records every minute
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (now > record.resetTime) {
        hits.delete(key);
      }
    }
  }, 60 * 1000);

  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  const limiter = (req, res, next) => {
    // Allow bypassing rate limits in tests if explicitly flagged
    if (process.env.NODE_ENV === 'test' && req.headers['x-bypass-rate-limit'] === 'true') {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();
    const record = hits.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 0;
      record.resetTime = now + windowMs;
    }

    record.count += 1;
    hits.set(key, record);

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetSeconds);

    if (record.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      return res.status(429).json({ message });
    }

    next();
  };

  limiter.reset = () => hits.clear();
  return limiter;
};

// Rate limiter for POST /api/auth/resend-verification (max 5 requests per 15 minutes per IP + email)
const resendVerificationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many verification email requests. Please try again later.',
  keyGenerator: (req) => {
    const clientIp = req.ip || req.socket?.remoteAddress || 'unknown';
    const email = req.body?.email ? req.body.email.toLowerCase().trim() : '';
    return `${clientIp}_${email}`;
  },
});

// General auth rate limiter for /api/auth/*
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many authentication attempts. Please try again later.',
});

module.exports = {
  createRateLimiter,
  resendVerificationLimiter,
  authLimiter,
};
