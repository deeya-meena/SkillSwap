const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
const { sendVerificationEmail } = require('../utils/mailer');

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters'),
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const resendVerificationSchema = z.object({
  email: z.string().trim().email('Invalid email address'),
});

// Generates access token (7d)
const generateToken = (user) => {
  return jwt.sign(
    { id: user._id, role: user.role, purpose: 'access' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Generates email verification token (purpose: 'verify', 24h expiry)
const generateVerificationToken = (user) => {
  return jwt.sign(
    { id: user._id, purpose: 'verify' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// POST /api/auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
    });

    const token = generateToken(user);
    const verificationToken = generateVerificationToken(user);

    // Send verification email via Nodemailer (Ethereal in dev)
    let previewUrl = null;
    try {
      const mailResult = await sendVerificationEmail(user.email, verificationToken, user.name);
      previewUrl = mailResult?.previewUrl || null;
    } catch (mailErr) {
      console.error('Failed to send verification email:', mailErr.message);
    }

    const response = {
      message: 'Registration successful. Please verify your email.',
      token,
      user,
    };

    // previewUrl is only returned in development
    if (process.env.NODE_ENV === 'development' && previewUrl) {
      response.previewUrl = previewUrl;
    }

    res.status(201).json(response);
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = generateToken(user);

    res.json({
      message: 'Login successful',
      token,
      user,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/auth/verify-email?token=
const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ message: 'Verification token is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(400).json({ message: 'Verification link has expired' });
      }
      return res.status(400).json({ message: 'Invalid verification token' });
    }

    if (decoded.purpose !== 'verify') {
      return res.status(400).json({ message: 'Invalid token purpose' });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.emailVerified) {
      return res.status(200).json({ message: 'Email already verified' });
    }

    user.emailVerified = true;
    await user.save();

    res.status(200).json({ message: 'Email verified successfully' });
  } catch (err) {
    next(err);
  }
};

// POST /api/auth/resend-verification
const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    const normalizedEmail = email ? email.toLowerCase().trim() : null;

    if (!normalizedEmail) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Only unverified users can request a new verification email
    if (user.emailVerified) {
      return res.status(400).json({ message: 'Email is already verified' });
    }

    // Generate a fresh 24h verification link
    const verificationToken = generateVerificationToken(user);

    let previewUrl = null;
    try {
      const mailResult = await sendVerificationEmail(user.email, verificationToken, user.name);
      previewUrl = mailResult?.previewUrl || null;
    } catch (mailErr) {
      console.error('Failed to send verification email:', mailErr.message);
    }

    const response = {
      message: 'Verification email resent successfully.',
    };

    // previewUrl is only returned in development
    if (process.env.NODE_ENV === 'development' && previewUrl) {
      response.previewUrl = previewUrl;
    }

    res.status(200).json(response);
  } catch (err) {
    next(err);
  }
};

// GET /api/users/me
const getMe = async (req, res) => {
  res.json({ user: req.user });
};

module.exports = {
  registerSchema,
  loginSchema,
  resendVerificationSchema,
  generateToken,
  generateVerificationToken,
  register,
  login,
  verifyEmail,
  resendVerification,
  getMe,
};
