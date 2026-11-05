const mongoose = require('mongoose');

/**
 * Returns the appropriate MongoDB connection URI based on NODE_ENV.
 * Strictly guarantees that test executions only use MONGODB_TEST_URI and never the main database.
 */
const getMongoUri = () => {
  if (process.env.NODE_ENV === 'test') {
    const testUri = process.env.MONGODB_TEST_URI;
    if (!testUri) {
      throw new Error(
        'MONGODB_TEST_URI is required when running in test environment to avoid modifying the main database.'
      );
    }
    if (process.env.MONGODB_URI && testUri === process.env.MONGODB_URI) {
      throw new Error(
        'CRITICAL: MONGODB_TEST_URI cannot be identical to the main MONGODB_URI database.'
      );
    }
    return testUri;
  }

  const mainUri = process.env.MONGODB_URI;
  if (!mainUri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }
  return mainUri;
};

/**
 * Connects to MongoDB with environment safety validation.
 */
const connectDB = async (customUri) => {
  const targetUri = customUri || getMongoUri();

  // Safety guard: NEVER allow tests to connect to the main database URI
  if (
    process.env.NODE_ENV === 'test' &&
    process.env.MONGODB_URI &&
    targetUri === process.env.MONGODB_URI
  ) {
    throw new Error('CRITICAL: Attempted to connect to main MONGODB_URI during test execution.');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(targetUri);
  return mongoose.connection;
};

const disconnectDB = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
};

module.exports = {
  getMongoUri,
  connectDB,
  disconnectDB,
};
