const express = require('express');
const {
  register,
  login,
  verifyEmail,
  resendVerification,
  registerSchema,
  loginSchema,
  resendVerificationSchema,
} = require('../controllers/authController');
const validate = require('../middleware/validate');
const { resendVerificationLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', validate(loginSchema), login);
router.get('/verify-email', verifyEmail);
router.post(
  '/resend-verification',
  resendVerificationLimiter,
  validate(resendVerificationSchema),
  resendVerification
);

module.exports = router;
