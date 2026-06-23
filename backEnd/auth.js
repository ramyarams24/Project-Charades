// Authentication: signup / login / "who am I" using MongoDB (via Mongoose),
// bcrypt for password hashing, and JWT for login tokens.
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); // built-in — used to make random reset tokens
const { sendResetEmail } = require('./email');

const router = express.Router();

// What a user looks like in the database.
const userSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true, trim: true, lowercase: true },
        // Email is needed so we can send a password-reset link. sparse:true lets
        // older accounts (created before we added email) coexist without a value.
        email: { type: String, unique: true, sparse: true, trim: true, lowercase: true },
        passwordHash: { type: String, required: true },
        // Password-reset state. We store only a HASH of the reset token (never the
        // raw token), plus when it expires. Cleared after a successful reset.
        resetTokenHash: { type: String },
        resetTokenExpires: { type: Date },
    },
    { timestamps: true },
);
const User = mongoose.model('User', userSchema);

// Hash a reset token the same way every time so we can look it up by its hash.
// (Reset tokens are random and short-lived, so a fast SHA-256 is appropriate —
// unlike passwords, which use slow bcrypt to resist guessing.)
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

// Secret used to sign login tokens. MUST be set in production (Render env var).
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

function makeToken(user) {
    return jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, {
        expiresIn: '7d',
    });
}

// Block auth routes gracefully if the database isn't connected, so the rest of
// the app (game + AI) keeps working even when accounts aren't configured.
function requireDb(req, res, next) {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({
            error: 'Accounts are unavailable right now (database not connected).',
        });
    }
    next();
}

// Very light email sanity check — good enough to catch typos, not meant to be
// a strict RFC validator (those are famously hard to get right).
function looksLikeEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// POST /auth/signup  { username, email, password }  -> { token, username }
router.post('/signup', requireDb, async (req, res) => {
    try {
        const username = String(req.body.username || '').trim().toLowerCase();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        if (username.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters.' });
        }
        if (!looksLikeEmail(email)) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }
        const existing = await User.findOne({ $or: [{ username }, { email }] });
        if (existing) {
            const which = existing.username === username ? 'username' : 'email';
            return res.status(409).json({ error: `That ${which} is already taken.` });
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({ username, email, passwordHash });
        res.json({ token: makeToken(user), username: user.username });
    } catch (err) {
        console.error('signup failed:', err);
        res.status(500).json({ error: 'Could not create account. Please try again.' });
    }
});

// POST /auth/login  { username, password }  -> { token, username }
router.post('/login', requireDb, async (req, res) => {
    try {
        const username = String(req.body.username || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) {
            return res.status(401).json({ error: 'Invalid username or password.' });
        }
        res.json({ token: makeToken(user), username: user.username });
    } catch (err) {
        console.error('login failed:', err);
        res.status(500).json({ error: 'Could not log in. Please try again.' });
    }
});

// POST /auth/forgot-password  { email }  -> { message }
// Always responds with the same success message, whether or not the email
// exists. This avoids leaking which emails are registered (a common attack is
// to probe a reset form to discover valid accounts).
router.post('/forgot-password', requireDb, async (req, res) => {
    const genericMessage = 'If that email is registered, a reset link is on its way.';
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!looksLikeEmail(email)) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }
        const user = await User.findOne({ email });
        if (user) {
            // Make a random token: the raw token goes in the email link; only its
            // hash is stored. Even if the database leaked, the stored hash can't
            // be used to reset anyone's password.
            const rawToken = crypto.randomBytes(32).toString('hex');
            user.resetTokenHash = hashToken(rawToken);
            user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            await user.save();

            // Build the link back to our own site (works on localhost AND Render
            // automatically, since it's derived from the incoming request).
            const base = `${req.protocol}://${req.get('host')}`;
            const resetUrl = `${base}/reset.html?token=${rawToken}`;
            await sendResetEmail(user.email, resetUrl);
        }
        res.json({ message: genericMessage });
    } catch (err) {
        console.error('forgot-password failed:', err);
        // Still return the generic message so failures don't reveal account info.
        res.json({ message: genericMessage });
    }
});

// POST /auth/reset-password  { token, password }  -> { token, username }
router.post('/reset-password', requireDb, async (req, res) => {
    try {
        const rawToken = String(req.body.token || '');
        const password = String(req.body.password || '');
        if (!rawToken) {
            return res.status(400).json({ error: 'Missing reset token.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }
        // Find a user whose stored token hash matches AND hasn't expired yet.
        const user = await User.findOne({
            resetTokenHash: hashToken(rawToken),
            resetTokenExpires: { $gt: new Date() },
        });
        if (!user) {
            return res.status(400).json({ error: 'This reset link is invalid or has expired.' });
        }
        user.passwordHash = await bcrypt.hash(password, 10);
        // Invalidate the token so the link can't be reused.
        user.resetTokenHash = undefined;
        user.resetTokenExpires = undefined;
        await user.save();
        // Log them straight in after a successful reset.
        res.json({ token: makeToken(user), username: user.username });
    } catch (err) {
        console.error('reset-password failed:', err);
        res.status(500).json({ error: 'Could not reset password. Please try again.' });
    }
});

// GET /auth/me  (Authorization: Bearer <token>)  -> { username }
router.get('/me', (req, res) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) return res.status(401).json({ error: 'Not logged in.' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        res.json({ username: payload.username });
    } catch (err) {
        res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
});

module.exports = router;
