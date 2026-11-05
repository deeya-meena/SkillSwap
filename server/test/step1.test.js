const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'test_secret_key_step_1';
process.env.NODE_ENV = 'test';

const User = require('../src/models/User');
const { registerSchema, loginSchema } = require('../src/controllers/authController');
const { authenticate, requireRole, requireVerified } = require('../src/middleware/auth');

describe('Step 1 Verification Tests', () => {
  it('User model schema has all required fields', () => {
    const paths = User.schema.paths;
    assert.ok(paths['name'], 'User must have name');
    assert.ok(paths['email'], 'User must have email');
    assert.ok(paths['passwordHash'], 'User must have passwordHash');
    assert.ok(paths['bio'], 'User must have bio');
    assert.ok(paths['avatarUrl'], 'User must have avatarUrl');
    assert.ok(paths['emailVerified'], 'User must have emailVerified');
    assert.ok(paths['role'], 'User must have role');
    assert.ok(paths['skillsOffered'], 'User must have skillsOffered');
    assert.ok(paths['skillsWanted'], 'User must have skillsWanted');
    assert.ok(paths['ratingAvg'], 'User must have ratingAvg');
    assert.ok(paths['ratingCount'], 'User must have ratingCount');
    assert.ok(paths['createdAt'], 'User must have createdAt timestamp');

    // Test passwordHash is omitted in toJSON
    const userDoc = new User({
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash: 'hashed_secret',
    });
    const json = userDoc.toJSON();
    assert.strictEqual(json.passwordHash, undefined, 'passwordHash must never be exposed in toJSON');
    assert.strictEqual(json.name, 'Alice');
    assert.strictEqual(json.email, 'alice@example.com');
  });

  it('Zod validation schemas validate registration and login inputs correctly', () => {
    // Valid registration
    const validReg = registerSchema.safeParse({
      name: 'Bob',
      email: 'bob@example.com',
      password: 'password123',
    });
    assert.ok(validReg.success, 'Valid registration payload should succeed');

    // Invalid registration: short password
    const invalidRegPass = registerSchema.safeParse({
      name: 'Bob',
      email: 'bob@example.com',
      password: '123',
    });
    assert.strictEqual(invalidRegPass.success, false);

    // Invalid registration: invalid email
    const invalidRegEmail = registerSchema.safeParse({
      name: 'Bob',
      email: 'not-an-email',
      password: 'password123',
    });
    assert.strictEqual(invalidRegEmail.success, false);

    // Valid login
    const validLogin = loginSchema.safeParse({
      email: 'bob@example.com',
      password: 'password123',
    });
    assert.ok(validLogin.success);
  });

  it('bcrypt hashes and verifies passwords correctly', async () => {
    const rawPassword = 'superSecretPassword!';
    const hash = await bcrypt.hash(rawPassword, 10);
    assert.notStrictEqual(rawPassword, hash);

    const matches = await bcrypt.compare(rawPassword, hash);
    assert.strictEqual(matches, true);

    const wrongMatches = await bcrypt.compare('wrongPassword', hash);
    assert.strictEqual(wrongMatches, false);
  });

  it('JWT authentication token flow and middleware protection', async () => {
    const payload = { id: '65f123456789012345678901', role: 'user', purpose: 'access' };
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert.strictEqual(decoded.id, payload.id);
    assert.strictEqual(decoded.purpose, 'access');

    // Test authenticate middleware rejection when no token is present
    const reqNoAuth = { headers: {} };
    let errorResponse;
    const resMock = {
      status: (code) => {
        return {
          json: (body) => {
            errorResponse = { status: code, body };
          },
        };
      },
    };
    await authenticate(reqNoAuth, resMock, () => {});
    assert.strictEqual(errorResponse.status, 401);
    assert.strictEqual(errorResponse.body.message, 'Authentication required');

    // Test requireRole middleware
    let forbiddenResponse;
    const resForbiddenMock = {
      status: (code) => ({
        json: (body) => {
          forbiddenResponse = { status: code, body };
        },
      }),
    };
    const reqUser = { user: { role: 'user' } };
    requireRole('admin')(reqUser, resForbiddenMock, () => {});
    assert.strictEqual(forbiddenResponse.status, 403);

    // Test requireVerified middleware
    let unverifiedResponse;
    const resUnverifiedMock = {
      status: (code) => ({
        json: (body) => {
          unverifiedResponse = { status: code, body };
        },
      }),
    };
    const reqUnverifiedUser = { user: { emailVerified: false } };
    requireVerified(reqUnverifiedUser, resUnverifiedMock, () => {});
    assert.strictEqual(unverifiedResponse.status, 403);
  });
});
