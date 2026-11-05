const nodemailer = require('nodemailer');

let cachedTransporter = null;

/**
 * Returns a Nodemailer transporter instance.
 * Uses SMTP settings if provided in environment; otherwise falls back to Ethereal in development.
 */
const getTransporter = async () => {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  // If custom SMTP credentials are provided, use them
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    return cachedTransporter;
  }

  // Fallback to Ethereal test account in development/testing
  const testAccount = await nodemailer.createTestAccount();
  cachedTransporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  return cachedTransporter;
};

/**
 * Sends an email verification link to a user.
 * @param {string} to - Recipient email address
 * @param {string} token - Signed JWT verification token (purpose: 'verify')
 * @param {string} [name] - Recipient user's display name
 * @returns {Promise<{ info: object, previewUrl: string | false }>}
 */
const sendVerificationEmail = async (to, token, name = 'there') => {
  const transporter = await getTransporter();

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const serverPort = process.env.PORT || 5000;
  const serverUrl = process.env.SERVER_URL || `http://localhost:${serverPort}`;

  const clientVerifyUrl = `${clientUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const apiVerifyUrl = `${serverUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  const mailOptions = {
    from: process.env.EMAIL_FROM || '"SkillSwap" <noreply@skillswap.com>',
    to,
    subject: 'Verify your SkillSwap email address',
    text: `Hello ${name},\n\nThank you for registering on SkillSwap! Please verify your email by clicking the link below:\n\n${clientVerifyUrl}\n\n(Direct API verification link: ${apiVerifyUrl})\n\nThis verification link expires in 24 hours.\n\nHappy swapping,\nThe SkillSwap Team`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
        <h2 style="color: #4F46E5; margin-top: 0;">Welcome to SkillSwap, ${name}!</h2>
        <p style="color: #333; font-size: 16px; line-height: 1.5;">
          Thank you for signing up. Please verify your email address to activate your account and start trading skills with others.
        </p>
        <div style="margin: 30px 0;">
          <a href="${clientVerifyUrl}" style="background-color: #4F46E5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Verify Email Address
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          Or copy and paste this link into your browser:<br />
          <a href="${clientVerifyUrl}" style="color: #4F46E5;">${clientVerifyUrl}</a>
        </p>
        <p style="color: #888; font-size: 12px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 10px;">
          Direct API verification link: <a href="${apiVerifyUrl}" style="color: #888;">${apiVerifyUrl}</a>
        </p>
        <p style="color: #999; font-size: 12px;">
          This link will expire in 24 hours. If you did not create an account on SkillSwap, please ignore this email.
        </p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  const previewUrl = nodemailer.getTestMessageUrl(info);

  if (previewUrl) {
    console.log(`\n📨 Verification email sent to: ${to}`);
    console.log(`🔗 Ethereal preview URL: ${previewUrl}\n`);
  }

  return { info, previewUrl };
};

/**
 * Helper to override cached transporter (useful for testing)
 */
const setTransporter = (transporter) => {
  cachedTransporter = transporter;
};

module.exports = {
  getTransporter,
  sendVerificationEmail,
  setTransporter,
};
