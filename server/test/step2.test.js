const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_step_2';
process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/skillswap_main';
process.env.MONGODB_TEST_URI = 'mongodb://127.0.0.1:27017/skillswap_test';

const {
  generateVerificationToken,
  generateToken,
  register,
  verifyEmail,
  resendVerification,
  resendVerificationSchema,
} = require('../src/controllers/authController');
const { sendVerificationEmail, setTransporter } = require('../src/utils/mailer');
const { authenticate, requireVerified } = require('../src/middleware/auth');
const { createRateLimiter, resendVerificationLimiter } = require('../src/middleware/rateLimiter');
const { getMongoUri, connectDB } = require('../src/utils/db');
const User = require('../src/models/User');

describe('Step 2 Email Verification Tests', () => {
  it('generateVerificationToken creates a signed JWT with purpose: "verify" and 24h expiry', () => {
    const mockUser = { _id: '65f123456789012345678902', role: 'user' };
    const token = generateVerificationToken(mockUser);

    assert.ok(token, 'Token should be generated');

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.strictEqual(decoded.id, mockUser._id);
    assert.strictEqual(decoded.purpose, 'verify');

    // Verify 24h expiry (86400 seconds)
    const lifespanSeconds = decoded.exp - decoded.iat;
    assert.strictEqual(lifespanSeconds, 86400, 'Token lifespan must be exactly 24 hours (86400 seconds)');
  });

  it('mailer sends email containing verification link with signed token', async () => {
    let sentMailOptions = null;
    const mockTransporter = {
      sendMail: async (options) => {
        sentMailOptions = options;
        return { messageId: 'mock-msg-123' };
      },
    };
    setTransporter(mockTransporter);

    const testToken = 'mock_jwt_verify_token_abc';
    const recipient = 'testuser@example.com';
    const result = await sendVerificationEmail(recipient, testToken, 'Test User');

    assert.ok(sentMailOptions, 'Transporter sendMail should have been called');
    assert.strictEqual(sentMailOptions.to, recipient);
    assert.ok(sentMailOptions.subject.includes('Verify'));
    assert.ok(sentMailOptions.text.includes(testToken), 'Plaintext email should contain verification token');
    assert.ok(sentMailOptions.html.includes(testToken), 'HTML email should contain verification token');
    assert.strictEqual(result.info.messageId, 'mock-msg-123');

    // Reset cached transporter back to null so default behaviour resumes
    setTransporter(null);
  });

  it('verifyEmail endpoint rejects requests without a token', async () => {
    const req = { query: {} };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => {
            responseBody = data;
          },
        };
      },
    };

    await verifyEmail(req, res, () => {});

    assert.strictEqual(responseStatus, 400);
    assert.strictEqual(responseBody.message, 'Verification token is required');
  });

  it('verifyEmail rejects invalid or tampered tokens', async () => {
    const req = { query: { token: 'tampered.or.malformed.jwt' } };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => {
            responseBody = data;
          },
        };
      },
    };

    await verifyEmail(req, res, () => {});

    assert.strictEqual(responseStatus, 400);
    assert.strictEqual(responseBody.message, 'Invalid verification token');
  });

  it('verifyEmail rejects tokens that have expired', async () => {
    const expiredToken = jwt.sign(
      { id: '65f123456789012345678902', purpose: 'verify' },
      process.env.JWT_SECRET,
      { expiresIn: '-1s' }
    );

    const req = { query: { token: expiredToken } };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => {
            responseBody = data;
          },
        };
      },
    };

    await verifyEmail(req, res, () => {});

    assert.strictEqual(responseStatus, 400);
    assert.strictEqual(responseBody.message, 'Verification link has expired');
  });

  it('verifyEmail rejects tokens with incorrect purpose (e.g. access token)', async () => {
    const accessToken = jwt.sign(
      { id: '65f123456789012345678902', purpose: 'access' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    const req = { query: { token: accessToken } };
    let responseStatus = null;
    let responseBody = null;
    const res = {
      status: (code) => {
        responseStatus = code;
        return {
          json: (data) => {
            responseBody = data;
          },
        };
      },
    };

    await verifyEmail(req, res, () => {});

    assert.strictEqual(responseStatus, 400);
    assert.strictEqual(responseBody.message, 'Invalid token purpose');
  });

  it('verifyEmail marks user emailVerified as true and handles already verified user', async () => {
    const userId = '65f123456789012345678902';
    const verifyToken = jwt.sign(
      { id: userId, purpose: 'verify' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Mock User.findById
    let savedUser = null;
    const mockUserDoc = {
      _id: userId,
      email: 'test@example.com',
      emailVerified: false,
      save: async function () {
        savedUser = this;
        return this;
      },
    };

    const originalFindById = User.findById;
    User.findById = async (id) => {
      if (id === userId) return mockUserDoc;
      return null;
    };

    try {
      const req = { query: { token: verifyToken } };
      let responseStatus = null;
      let responseBody = null;
      const res = {
        status: (code) => {
          responseStatus = code;
          return {
            json: (data) => {
              responseBody = data;
            },
          };
        },
      };

      // 1. Verify unverified user
      await verifyEmail(req, res, () => {});
      assert.strictEqual(responseStatus, 200);
      assert.strictEqual(responseBody.message, 'Email verified successfully');
      assert.strictEqual(mockUserDoc.emailVerified, true);
      assert.strictEqual(savedUser.emailVerified, true);

      // 2. Calling again should indicate already verified
      await verifyEmail(req, res, () => {});
      assert.strictEqual(responseStatus, 200);
      assert.strictEqual(responseBody.message, 'Email already verified');
    } finally {
      User.findById = originalFindById;
    }
  });

  it('requireVerified blocks unverified users and permits verified users', () => {
    let unverifiedStatus = null;
    let unverifiedBody = null;
    let nextCalled = false;

    const resMock = {
      status: (code) => ({
        json: (data) => {
          unverifiedStatus = code;
          unverifiedBody = data;
        },
      }),
    };

    // Blocked when emailVerified is false
    const reqUnverified = { user: { emailVerified: false } };
    requireVerified(reqUnverified, resMock, () => {
      nextCalled = true;
    });

    assert.strictEqual(unverifiedStatus, 403);
    assert.strictEqual(unverifiedBody.message, 'Please verify your email first');
    assert.strictEqual(nextCalled, false);

    // Allowed when emailVerified is true
    const reqVerified = { user: { emailVerified: true } };
    requireVerified(reqVerified, resMock, () => {
      nextCalled = true;
    });

    assert.strictEqual(nextCalled, true, 'next() should be called for verified user');
  });

  it('authenticate middleware prevents verify tokens from accessing normal API routes', async () => {
    const verifyToken = jwt.sign(
      { id: '65f123456789012345678902', purpose: 'verify' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const reqWithVerifyToken = {
      headers: {
        authorization: `Bearer ${verifyToken}`,
      },
    };

    let statusCode = null;
    let body = null;
    const resMock = {
      status: (code) => ({
        json: (data) => {
          statusCode = code;
          body = data;
        },
      }),
    };

    await authenticate(reqWithVerifyToken, resMock, () => {});

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(body.message, 'Invalid token purpose');
  });

  it('previewUrl is ONLY included in response when NODE_ENV is development', async () => {
    const mockTransporter = {
      sendMail: async () => ({
        messageId: 'msg-preview-test',
        response: '250 Accepted [STATUS=OK MSGID=preview123]',
      }),
    };
    setTransporter(mockTransporter);

    const mockUserDoc = {
      _id: '65f123456789012345678903',
      name: 'Dev User',
      email: 'dev@example.com',
      emailVerified: false,
    };

    const originalFindOne = User.findOne;
    User.findOne = async () => mockUserDoc;

    try {
      // 1. In NODE_ENV === 'test': previewUrl MUST NOT be returned
      process.env.NODE_ENV = 'test';
      let resDataTest = null;
      const resTest = {
        status: () => ({
          json: (data) => {
            resDataTest = data;
          },
        }),
      };
      await resendVerification({ body: { email: 'dev@example.com' } }, resTest, () => {});
      assert.strictEqual(resDataTest.previewUrl, undefined, 'previewUrl must not be present in test environment');

      // 2. In NODE_ENV === 'development': previewUrl IS returned if available
      process.env.NODE_ENV = 'development';
      let resDataDev = null;
      const resDev = {
        status: () => ({
          json: (data) => {
            resDataDev = data;
          },
        }),
      };
      await resendVerification({ body: { email: 'dev@example.com' } }, resDev, () => {});
      assert.ok('previewUrl' in resDataDev, 'previewUrl must be returned when NODE_ENV is development');
    } finally {
      process.env.NODE_ENV = 'test';
      User.findOne = originalFindOne;
      setTransporter(null);
    }
  });

  it('resendVerification handles validation, non-existent users, and already-verified users', async () => {
    // 1. Zod schema validation
    const invalidEmail = resendVerificationSchema.safeParse({ email: 'bad-email' });
    assert.strictEqual(invalidEmail.success, false);

    const validEmail = resendVerificationSchema.safeParse({ email: 'good@example.com' });
    assert.strictEqual(validEmail.success, true);

    const originalFindOne = User.findOne;
    try {
      // 2. User not found (404)
      User.findOne = async () => null;
      let status404 = null;
      let body404 = null;
      const res404 = {
        status: (s) => ({
          json: (b) => {
            status404 = s;
            body404 = b;
          },
        }),
      };
      await resendVerification({ body: { email: 'unknown@example.com' } }, res404, () => {});
      assert.strictEqual(status404, 404);
      assert.strictEqual(body404.message, 'User not found');

      // 3. User already verified (400)
      User.findOne = async () => ({ email: 'verified@example.com', emailVerified: true });
      let status400 = null;
      let body400 = null;
      const res400 = {
        status: (s) => ({
          json: (b) => {
            status400 = s;
            body400 = b;
          },
        }),
      };
      await resendVerification({ body: { email: 'verified@example.com' } }, res400, () => {});
      assert.strictEqual(status400, 400);
      assert.strictEqual(body400.message, 'Email is already verified');

      // 4. Unverified user sends fresh link (200)
      let sentToken = null;
      const mockTransporter = {
        sendMail: async (options) => {
          sentToken = options.text;
          return { messageId: 'fresh-link-123' };
        },
      };
      setTransporter(mockTransporter);

      User.findOne = async () => ({
        _id: '65f123456789012345678905',
        name: 'Unverified Bob',
        email: 'bob@example.com',
        emailVerified: false,
      });

      let status200 = null;
      let body200 = null;
      const res200 = {
        status: (s) => ({
          json: (b) => {
            status200 = s;
            body200 = b;
          },
        }),
      };
      await resendVerification({ body: { email: 'bob@example.com' } }, res200, () => {});
      assert.strictEqual(status200, 200);
      assert.strictEqual(body200.message, 'Verification email resent successfully.');
      assert.ok(sentToken, 'Fresh verification link email was dispatched');
    } finally {
      User.findOne = originalFindOne;
      setTransporter(null);
    }
  });

  it('rateLimiter blocks requests exceeding the configured limit with 429 status', () => {
    const testLimiter = createRateLimiter({
      windowMs: 60 * 1000,
      max: 2,
      message: 'Limit exceeded',
      keyGenerator: () => 'fixed_test_client',
    });

    const mockRes = () => {
      const res = {
        headers: {},
        statusCode: 200,
        body: null,
        setHeader: (k, v) => {
          res.headers[k] = v;
        },
        status: (c) => {
          res.statusCode = c;
          return {
            json: (b) => {
              res.body = b;
            },
          };
        },
      };
      return res;
    };

    let nextCount = 0;
    const req = { headers: {} };

    // Request 1: allowed
    const res1 = mockRes();
    testLimiter(req, res1, () => {
      nextCount++;
    });
    assert.strictEqual(nextCount, 1);
    assert.strictEqual(res1.headers['RateLimit-Remaining'], 1);

    // Request 2: allowed
    const res2 = mockRes();
    testLimiter(req, res2, () => {
      nextCount++;
    });
    assert.strictEqual(nextCount, 2);
    assert.strictEqual(res2.headers['RateLimit-Remaining'], 0);

    // Request 3: blocked (429)
    const res3 = mockRes();
    testLimiter(req, res3, () => {
      nextCount++;
    });
    assert.strictEqual(nextCount, 2, 'next() must NOT be called on rate-limited request');
    assert.strictEqual(res3.statusCode, 429);
    assert.strictEqual(res3.body.message, 'Limit exceeded');
  });

  it('database connection safety ensures tests use MONGODB_TEST_URI and never the main database', () => {
    // 1. In test environment, MONGODB_TEST_URI is selected
    process.env.NODE_ENV = 'test';
    process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/skillswap_main';
    process.env.MONGODB_TEST_URI = 'mongodb://127.0.0.1:27017/skillswap_test';

    const selectedUri = getMongoUri();
    assert.strictEqual(selectedUri, process.env.MONGODB_TEST_URI);
    assert.notStrictEqual(selectedUri, process.env.MONGODB_URI);

    // 2. Throws error if MONGODB_TEST_URI is missing in test mode
    delete process.env.MONGODB_TEST_URI;
    assert.throws(
      () => getMongoUri(),
      /MONGODB_TEST_URI is required when running in test environment/
    );

    // 3. Throws error if MONGODB_TEST_URI is identical to main MONGODB_URI in test mode
    process.env.MONGODB_TEST_URI = process.env.MONGODB_URI;
    assert.throws(
      () => getMongoUri(),
      /CRITICAL: MONGODB_TEST_URI cannot be identical to the main MONGODB_URI database/
    );

    // Restore test URI
    process.env.MONGODB_TEST_URI = 'mongodb://127.0.0.1:27017/skillswap_test';
  });
});
