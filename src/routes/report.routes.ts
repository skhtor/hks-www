import { Router, Request, Response } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { reportService } from '../services/report.service';

const router = Router();

// All report routes require ADMIN role
router.use(authenticate, authorize(UserRole.ADMIN));

/**
 * GET /api/reports/enrolments
 * Enrolment report: active/trial counts by class, new enrolments this month.
 * Requirements: 13.1, 13.5
 */
router.get('/enrolments', async (_req: Request, res: Response) => {
  try {
    const report = await reportService.getEnrolmentReport();
    res.json({ success: true, data: report });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/reports/capacity
 * Capacity utilization report per class.
 * Requirements: 13.2
 */
router.get('/capacity', async (_req: Request, res: Response) => {
  try {
    const report = await reportService.getCapacityReport();
    res.json({ success: true, data: report });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/reports/revenue
 * Revenue by month from paid payments.
 * Requirements: 13.3
 */
router.get('/revenue', async (_req: Request, res: Response) => {
  try {
    const report = await reportService.getRevenueReport();
    res.json({ success: true, data: report });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/reports/outstanding-payments
 * Overdue invoices with customer details and days past due.
 * Requirements: 13.4
 */
router.get('/outstanding-payments', async (_req: Request, res: Response) => {
  try {
    const report = await reportService.getOutstandingPaymentsReport();
    res.json({ success: true, data: report });
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/reports/enrolments/export
 * CSV export of enrolment report (byClass rows).
 * Requirements: 13.7
 */
router.get('/enrolments/export', async (_req: Request, res: Response) => {
  try {
    const report = await reportService.getEnrolmentReport();
    const csv = reportService.exportToCsv('enrolment', report.byClass);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="report-enrolment.csv"');
    res.send(csv);
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/reports/capacity/export
 * CSV export of capacity report.
 * Requirements: 13.7
 */
router.get('/capacity/export', async (_req: Request, res: Response) => {
  try {
    const report = await reportService.getCapacityReport();
    const csv = reportService.exportToCsv('capacity', report.classes);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="report-capacity.csv"');
    res.send(csv);
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/reports/revenue/export
 * CSV export of revenue report.
 * Requirements: 13.7
 */
router.get('/revenue/export', async (_req: Request, res: Response) => {
  try {
    const report = await reportService.getRevenueReport();
    const csv = reportService.exportToCsv('revenue', report.byMonth);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="report-revenue.csv"');
    res.send(csv);
  } catch (error) {
    handleError(error, res);
  }
});

/**
 * GET /api/reports/outstanding-payments/export
 * CSV export of outstanding payments report.
 * Requirements: 13.7
 */
router.get('/outstanding-payments/export', async (_req: Request, res: Response) => {
  try {
    const report = await reportService.getOutstandingPaymentsReport();
    const csv = reportService.exportToCsv('outstanding', report.invoices);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="report-outstanding.csv"');
    res.send(csv);
  } catch (error) {
    handleError(error, res);
  }
});

function handleError(error: unknown, res: Response): void {
  console.error('Report error:', error);
  res.status(500).json({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}

export default router;
