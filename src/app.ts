import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { getRedisClient } from './config/redis';
import { sanitizeInput, requestId } from './middleware/security.middleware';
import { cacheResponse } from './middleware/cache.middleware';
import authRoutes from './routes/auth.routes';
import customerRoutes from './routes/customer.routes';
import dancerRoutes from './routes/dancer.routes';
import teacherRoutes from './routes/teacher.routes';
import classRoutes from './routes/class.routes';
import timetableRoutes from './routes/timetable.routes';
import feeRoutes from './routes/fee.routes';
import enrolmentRoutes from './routes/enrolment.routes';
import paymentRoutes from './routes/payment.routes';
import invoiceRoutes from './routes/invoice.routes';
import xeroRoutes from './routes/xero.routes';
import notificationTemplateRoutes from './routes/notification-template.routes';
import reportRoutes from './routes/report.routes';
import locationRoutes from './routes/location.routes';
import merchandiseRoutes from './routes/merchandise.routes';
import termRoutes from './routes/term.routes';
import cancellationPolicyRoutes from './routes/cancellation-policy.routes';

export const createApp = (): Application => {
  const app = express();

  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));

  app.use(cors({
    origin: config.env === 'production'
      ? (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
      : true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  }));

  // Request ID tracking
  app.use(requestId);

  // Response compression
  app.use(compression());

  // Rate limiting - strict for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/auth', authLimiter);
  app.use('/api/', limiter);

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Cookie parsing (required for HttpOnly auth cookies)
  app.use(cookieParser());

  // Input sanitization
  app.use(sanitizeInput);

  // Health check endpoint
  app.get('/health', async (_req: Request, res: Response) => {
    const checks: Record<string, string> = { api: 'ok' };

    // Check Redis
    try {
      const redis = getRedisClient();
      if (redis.isOpen) {
        await redis.ping();
        checks.redis = 'ok';
      } else {
        checks.redis = 'disconnected';
      }
    } catch {
      checks.redis = 'error';
    }

    const allOk = Object.values(checks).every((v) => v === 'ok');
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
      environment: config.env,
    });
  });

  // API routes
  app.get('/api', (_req: Request, res: Response) => {
    res.json({
      message: 'Dance School Management Platform API',
      version: '1.0.0',
    });
  });

  // Auth routes
  app.use('/api/auth', authRoutes);

  // Customer routes
  app.use('/api/customers', customerRoutes);

  // Dancer routes
  app.use('/api/dancers', dancerRoutes);

  // Teacher routes
  app.use('/api/teachers', teacherRoutes);
  app.use('/api/teacher', teacherRoutes);

  // Class routes
  app.use('/api/classes', classRoutes);

  // Timetable routes (public) - cached 5 min
  app.use('/api/timetable', cacheResponse(300, 'timetable'), timetableRoutes);

  // Fee routes - pricing rules cached 1 hour for GET
  app.use('/api/fees', cacheResponse(3600, 'fees'), feeRoutes);

  // Enrolment routes
  app.use('/api/enrolments', enrolmentRoutes);

  // Payment routes (webhook must be before express.json to receive raw body)
  app.use('/api/payments', paymentRoutes);

  // Invoice routes
  app.use('/api/invoices', invoiceRoutes);

  // Xero integration routes
  app.use('/api/xero', xeroRoutes);

  // Notification template routes
  app.use('/api/notification-templates', notificationTemplateRoutes);

  // Report routes
  app.use('/api/reports', reportRoutes);

  // Location routes
  app.use('/api/locations', locationRoutes);

  // Merchandise routes
  app.use('/api/merchandise', merchandiseRoutes);

  // Term routes
  app.use('/api/terms', termRoutes);

  // Cancellation policy routes
  app.use('/api/cancellation-policies', cancellationPolicyRoutes);

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not Found' });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
      error: config.env === 'production' ? 'Internal Server Error' : err.message,
    });
  });

  return app;
};
