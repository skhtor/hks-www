import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/env';
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

export const createApp = (): Application => {
  const app = express();

  // Security middleware
  app.use(helmet());
  app.use(cors());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later.',
  });
  app.use('/api/', limiter);

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
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

  // Timetable routes (public)
  app.use('/api/timetable', timetableRoutes);

  // Fee routes
  app.use('/api/fees', feeRoutes);

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
