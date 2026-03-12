import { PrismaClient, EnrolmentStatus, InvoiceStatus, PaymentStatus } from '@prisma/client';

const prisma = new PrismaClient();

export interface EnrolmentReportByClass {
  classId: string;
  className: string;
  activeCount: number;
  trialCount: number;
}

export interface EnrolmentReport {
  byClass: EnrolmentReportByClass[];
  newThisMonth: number;
}

export interface CapacityReportClass {
  classId: string;
  className: string;
  capacity: number;
  enrolled: number;
  utilizationPercent: number;
}

export interface CapacityReport {
  classes: CapacityReportClass[];
}

export interface RevenueByMonth {
  month: string; // YYYY-MM
  revenue: number;
  paymentCount: number;
}

export interface RevenueReport {
  byMonth: RevenueByMonth[];
}

export interface OutstandingInvoice {
  invoiceId: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  amount: number;
  dueDate: Date;
  daysPastDue: number;
}

export interface OutstandingPaymentsReport {
  invoices: OutstandingInvoice[];
}

export class ReportService {
  /**
   * Returns enrolment report: active/trial counts by class, and new enrolments this month.
   * Requirements: 13.1, 13.5
   */
  async getEnrolmentReport(): Promise<EnrolmentReport> {
    const classes = await prisma.class.findMany({
      select: {
        id: true,
        name: true,
        enrolments: {
          where: {
            status: { in: [EnrolmentStatus.ACTIVE, EnrolmentStatus.TRIAL] },
          },
          select: { status: true },
        },
      },
    });

    const byClass: EnrolmentReportByClass[] = classes.map((cls) => ({
      classId: cls.id,
      className: cls.name,
      activeCount: cls.enrolments.filter((e) => e.status === EnrolmentStatus.ACTIVE).length,
      trialCount: cls.enrolments.filter((e) => e.status === EnrolmentStatus.TRIAL).length,
    }));

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = await prisma.enrolment.count({
      where: {
        createdAt: { gte: startOfMonth },
      },
    });

    return { byClass, newThisMonth };
  }

  /**
   * Returns capacity utilization report per class.
   * Requirements: 13.2
   */
  async getCapacityReport(): Promise<CapacityReport> {
    const classes = await prisma.class.findMany({
      select: {
        id: true,
        name: true,
        capacity: true,
        enrolledCount: true,
      },
    });

    const result: CapacityReportClass[] = classes.map((cls) => {
      const utilizationPercent =
        cls.capacity > 0 ? Math.round((cls.enrolledCount / cls.capacity) * 100 * 100) / 100 : 0;
      return {
        classId: cls.id,
        className: cls.name,
        capacity: cls.capacity,
        enrolled: cls.enrolledCount,
        utilizationPercent,
      };
    });

    return { classes: result };
  }

  /**
   * Returns revenue aggregated by month from paid payments.
   * Requirements: 13.3
   */
  async getRevenueReport(): Promise<RevenueReport> {
    const payments = await prisma.payment.findMany({
      where: {
        status: PaymentStatus.PAID,
        paidAt: { not: null },
      },
      select: {
        amount: true,
        paidAt: true,
      },
      orderBy: { paidAt: 'asc' },
    });

    const monthMap = new Map<string, { revenue: number; paymentCount: number }>();

    for (const payment of payments) {
      if (!payment.paidAt) continue;
      const d = payment.paidAt;
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthMap.get(month) ?? { revenue: 0, paymentCount: 0 };
      existing.revenue = Math.round((existing.revenue + Number(payment.amount)) * 100) / 100;
      existing.paymentCount += 1;
      monthMap.set(month, existing);
    }

    const byMonth: RevenueByMonth[] = Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      revenue: data.revenue,
      paymentCount: data.paymentCount,
    }));

    return { byMonth };
  }

  /**
   * Returns outstanding (overdue) invoices with customer details and days past due.
   * Requirements: 13.4
   */
  async getOutstandingPaymentsReport(): Promise<OutstandingPaymentsReport> {
    const now = new Date();

    const overdueInvoices = await prisma.invoice.findMany({
      where: {
        status: InvoiceStatus.OVERDUE,
      },
      include: {
        customer: {
          select: { id: true, name: true },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    const invoices: OutstandingInvoice[] = overdueInvoices.map((inv) => {
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysPastDue = Math.max(0, Math.floor((now.getTime() - inv.dueDate.getTime()) / msPerDay));
      return {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        customerId: inv.customer.id,
        customerName: inv.customer.name,
        amount: Number(inv.total),
        dueDate: inv.dueDate,
        daysPastDue,
      };
    });

    return { invoices };
  }

  /**
   * Converts report data to CSV string.
   * Requirements: 13.7
   */
  exportToCsv(
    _reportType: 'enrolment' | 'capacity' | 'revenue' | 'outstanding',
    data: unknown[]
  ): string {
    if (data.length === 0) return '';

    const rows = data as Record<string, unknown>[];
    const headers = Object.keys(rows[0]);
    const csvLines: string[] = [headers.join(',')];

    for (const row of rows) {
      const values = headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = val instanceof Date ? val.toISOString() : String(val);
        // Escape fields containing commas, quotes, or newlines
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      csvLines.push(values.join(','));
    }

    return csvLines.join('\n');
  }
}

export const reportService = new ReportService();
