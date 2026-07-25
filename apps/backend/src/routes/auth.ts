import { Router } from 'express';
import argon2 from 'argon2';
import { prisma } from '../lib/prisma';
import { validate } from '../middleware/validate';
import { loginSchema } from './schemas';
import { signToken, cookieOptions, AUTH_COOKIE, requireAuth } from '../middleware/auth';
import { loginLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };
  const user = await prisma.user.findUnique({ where: { email } });
  // Message générique pour ne pas révéler l'existence du compte.
  const invalid = () => res.status(401).json({ error: 'Identifiants invalides.' });
  if (!user) return invalid();

  let ok = false;
  try {
    ok = await argon2.verify(user.passwordHash, password);
  } catch {
    ok = false;
  }
  if (!ok) return invalid();

  const token = signToken({ sub: user.id, email: user.email });
  res.cookie(AUTH_COOKIE, token, cookieOptions());
  return res.json({ user: { id: user.id, email: user.email } });
});

router.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE, { ...cookieOptions(), maxAge: undefined });
  return res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.user });
});

export default router;
