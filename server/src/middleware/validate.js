// Request body validator using Zod schemas
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const message = issue ? `${issue.path.join('.') || 'body'}: ${issue.message}` : 'Validation error';
    return res.status(400).json({ message });
  }

  req.body = result.data;
  next();
};

module.exports = validate;
