const mongoose = require('mongoose');

const skillOfferedSchema = new mongoose.Schema(
  {
    skill: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    level: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      required: true,
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    bio: {
      type: String,
      default: '',
      trim: true,
    },
    avatarUrl: {
      type: String,
      default: '',
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    skillsOffered: {
      type: [skillOfferedSchema],
      default: [],
    },
    skillsWanted: {
      type: [{ type: String, lowercase: true, trim: true }],
      default: [],
    },
    ratingAvg: {
      type: Number,
      default: 0,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure passwordHash is never returned in JSON conversions
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
