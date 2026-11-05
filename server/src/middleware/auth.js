const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Verifies Bearer JWT access token and attaches user to req.user
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Reject non-access tokens (e.g. verify email tokens)
    if (decoded.purpose && decoded.purpose !== 'access') {
      return res.status(401).json({ message: 'Invalid token purpose' });
    }

    const user = await User.findById(decoded.id).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
    next(err);
  }
};

// Restricts route to specific roles (e.g. 'admin')
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
  }
  next();
};

// Blocks unverified users from protected actions (slots, session requests)
const requireVerified = (req, res, next) => {
  if (!req.user || !req.user.emailVerified) {
    return res.status(403).json({ message: 'Please verify your email first' });
  }
  next();
};

module.exports = {
  authenticate,
  requireRole,
  requireVerified,
};
