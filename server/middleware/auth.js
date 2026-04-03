import jwt from 'jsonwebtoken';
import { userDb, appConfigDb } from '../database/db.js';
import { IS_PLATFORM } from '../constants/config.js';

// Use env var if set, otherwise auto-generate a unique secret per installation
const JWT_SECRET = process.env.JWT_SECRET || appConfigDb.getOrCreateJwtSecret();

// Optional API key middleware
const applyTokenPermissions = (target, decoded) => {
  target.allowedProjects = Array.isArray(decoded?.allowedProjects) ? decoded.allowedProjects : [];
  target.projectPermissionsMode =
    decoded?.projectPermissionsMode === 'all'
      ? 'all'
      : Array.isArray(decoded?.allowedProjects)
        ? 'restricted'
        : 'all';
};

const validateApiKey = (req, res, next) => {
  // Skip API key validation if not configured
  if (!process.env.API_KEY) {
    return next();
  }
  
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};

// JWT authentication middleware
const authenticateToken = async (req, res, next) => {
  // Platform mode: try JWT auth first, then fall back to single database user
  if (IS_PLATFORM) {
    try {
      // Check for Authorization: Bearer <token> header first (ypbot-login users)
      const authHeader = req.headers['authorization'];
      const bearerToken = authHeader && authHeader.split(' ')[1];

      if (bearerToken) {
        try {
          const decoded = jwt.verify(bearerToken, JWT_SECRET);
          const user = userDb.getUserById(decoded.userId);
          if (user) {
            req.user = user;
            applyTokenPermissions(req, decoded);
            return next();
          }
          return res.status(401).json({ error: 'Invalid token. User not found.' });
        } catch (tokenError) {
          return res.status(403).json({ error: 'Invalid token' });
        }
      }

      // No valid token provided — require authentication
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    } catch (error) {
      console.error('Platform mode error:', error);
      return res.status(500).json({ error: 'Platform mode: Failed to fetch user' });
    }
  }

  // Normal OSS JWT validation
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  // Also check query param for SSE endpoints (EventSource can't set headers)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify user still exists and is active
    const user = userDb.getUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid token. User not found.' });
    }

    // Auto-refresh: if token is past halfway through its lifetime, issue a new one
    // Preserve allowedProjects and projectPermissionsMode from the original token
    if (decoded.exp && decoded.iat) {
      const now = Math.floor(Date.now() / 1000);
      const halfLife = (decoded.exp - decoded.iat) / 2;
      if (now > decoded.iat + halfLife) {
        const extraClaims = {};
        if (Array.isArray(decoded.allowedProjects)) {
          extraClaims.allowedProjects = decoded.allowedProjects;
        }
        if (decoded.projectPermissionsMode) {
          extraClaims.projectPermissionsMode = decoded.projectPermissionsMode;
        }
        const newToken = generateToken(user, extraClaims);
        res.setHeader('X-Refreshed-Token', newToken);
      }
    }

    req.user = user;
    applyTokenPermissions(req, decoded);
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Generate JWT token
const generateToken = (user, extraClaims = {}) => {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      ...extraClaims,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// WebSocket authentication function
const authenticateWebSocket = (token) => {
  // Platform mode: try JWT first, then fall back to first user
  if (IS_PLATFORM) {
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = userDb.getUserById(decoded.userId);
        if (user) {
          return {
            userId: user.id,
            username: user.username,
            allowedProjects: Array.isArray(decoded.allowedProjects) ? decoded.allowedProjects : [],
            projectPermissionsMode:
              decoded.projectPermissionsMode === 'all'
                ? 'all'
                : Array.isArray(decoded.allowedProjects)
                  ? 'restricted'
                  : 'all',
          };
        }
        return null;
      } catch (e) {
        return null;
      }
    }
    // No valid token provided — reject WebSocket connection
    return null;
  }

  // Normal OSS JWT validation
  if (!token) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Verify user actually exists in database (matches REST authenticateToken behavior)
    const user = userDb.getUserById(decoded.userId);
    if (!user) {
      return null;
    }
    return {
      userId: user.id,
      username: user.username,
      allowedProjects: Array.isArray(decoded.allowedProjects) ? decoded.allowedProjects : [],
      projectPermissionsMode:
        decoded.projectPermissionsMode === 'all'
          ? 'all'
          : Array.isArray(decoded.allowedProjects)
            ? 'restricted'
            : 'all',
    };
  } catch (error) {
    console.error('WebSocket token verification error:', error);
    return null;
  }
};

export {
  validateApiKey,
  authenticateToken,
  generateToken,
  authenticateWebSocket,
  JWT_SECRET
};
