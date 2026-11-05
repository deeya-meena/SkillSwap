// Central error handler returning consistent { message } JSON shape
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || res.statusCode;
  if (!statusCode || statusCode < 400) {
    statusCode = 500;
  }

  let message = err.message || 'Internal Server Error';

  // Handle MongoDB duplicate key error
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || 'field';
    message = `${field.charAt(0).toUpperCase() + field.slice(1)} already exists`;
  }

  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors).map((e) => e.message).join(', ');
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  res.status(statusCode).json({ message });
}

module.exports = errorHandler;
