import express from 'express';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { userDb, db } from '../database/db.js';
import { generateToken, authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Check auth status and setup requirements
router.get('/status', async (req, res) => {
  try {
    const hasUsers = await userDb.hasUsers();
    res.json({ 
      needsSetup: !hasUsers,
      isAuthenticated: false // Will be overridden by frontend if token exists
    });
  } catch (error) {
    console.error('Auth status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User registration (setup) - only allowed if no users exist
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    if (username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: 'Username must be at least 3 characters, password at least 6 characters' });
    }
    
    // Use a transaction to prevent race conditions
    db.prepare('BEGIN').run();
    try {
      // Check if users already exist (only allow one user)
      const hasUsers = userDb.hasUsers();
      if (hasUsers) {
        db.prepare('ROLLBACK').run();
        return res.status(403).json({ error: 'User already exists. This is a single-user system.' });
      }
      
      // Hash password
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(password, saltRounds);
      
      // Create user
      const user = userDb.createUser(username, passwordHash);
      
      // Generate token
      const token = generateToken(user);
      
      db.prepare('COMMIT').run();

      // Update last login (non-fatal, outside transaction)
      userDb.updateLastLogin(user.id);

      res.json({
        success: true,
        user: { id: user.id, username: user.username },
        token
      });
    } catch (error) {
      db.prepare('ROLLBACK').run();
      throw error;
    }
    
  } catch (error) {
    console.error('Registration error:', error);
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      res.status(409).json({ error: 'Username already exists' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// User login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }
    
    // Get user from database
    const user = userDb.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    
    // Generate token
    const token = generateToken(user);
    
    // Update last login
    userDb.updateLastLogin(user.id);
    
    res.json({
      success: true,
      user: { id: user.id, username: user.username },
      token
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user (protected route)
router.get('/user', authenticateToken, (req, res) => {
  res.json({
    user: req.user
  });
});

// ypbot JWT token bridge login
router.post('/ypbot-login', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    // Verify the ypbot JWT
    const CLAUDE_JWT_SECRET = process.env.CLAUDE_JWT_SECRET || 'ypbot-claude-bridge-secret';
    let decoded;
    try {
      decoded = jwt.verify(token, CLAUDE_JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired ypbot token' });
    }

    const { username, github_username, allowed_projects, project_permissions_mode } = decoded;
    if (!username) {
      return res.status(400).json({ error: 'Token missing username' });
    }

    // Find or create user
    let user = userDb.getUserByUsername(username);
    if (!user) {
      const saltRounds = 12;
      const placeholderPassword = 'ypbot-managed-' + crypto.randomUUID();
      const passwordHash = await bcrypt.hash(placeholderPassword, saltRounds);
      user = userDb.createUser(username, passwordHash);
    }

    // Auto-populate git config on first login (use github_username if available, else ypbot username)
    const existingGitConfig = userDb.getGitConfig(user.id);
    if (!existingGitConfig || (!existingGitConfig.git_name && !existingGitConfig.git_email)) {
      const gitName = github_username || username;
      const gitEmail = github_username
        ? `${github_username}@users.noreply.github.com`
        : `${username}@ypbot.local`;
      userDb.updateGitConfig(user.id, gitName, gitEmail);
      console.log(`Auto-populated git config for user ${username}: ${gitName} <${gitEmail}>`);
    }

    // Platform-managed users skip onboarding entirely (git config auto-populated, agents managed by platform)
    if (!userDb.hasCompletedOnboarding(user.id)) {
      userDb.completeOnboarding(user.id);
    }

    // Update last login
    userDb.updateLastLogin(user.id);

    const resolvedProjectPermissionsMode =
      project_permissions_mode === 'all'
        ? 'all'
        : Array.isArray(allowed_projects)
          ? 'restricted'
          : 'all';

    // Generate CCUI JWT token
    const ccuiToken = generateToken(user, {
      allowedProjects: allowed_projects || [],
      projectPermissionsMode: resolvedProjectPermissionsMode,
    });

    res.json({
      token: ccuiToken,
      user: { id: user.id, username: user.username },
      allowedProjects: allowed_projects || []
    });
  } catch (error) {
    console.error('ypbot-login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout (client-side token removal, but this endpoint can be used for logging)
router.post('/logout', authenticateToken, (req, res) => {
  // In a simple JWT system, logout is mainly client-side
  // This endpoint exists for consistency and potential future logging
  res.json({ success: true, message: 'Logged out successfully' });
});

export default router;
