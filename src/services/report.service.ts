import { PrismaClient, EnrolmentStatus, InvoiceStatus, PaymentStatus, AttendanceStatus } from '@prisma/client';

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

export interface CancellationByMonth {
  month: string; // YYYY-MM
  cancellations: number;
  churnRate?: number; // percentage of active enrolments that cancelled
}

export interface ChurnReport {
  byMonth: CancellationByMonth[];
}

export interface AttendanceByClass {
  classId: string;
  className: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
}

export interface AttendanceByStudent {
  dancerId: string;
  dancerName: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  total: number;
}

export interface AttendanceReport {
  groupBy: 'class' | 'student';
  byClass?: AttendanceByClass[];
  byStudent?: AttendanceByStudent[];
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
   * Returns cancellations grouped by month with optional churn rate.
   * Uses updatedAt as the cancellation date (when status changed to CANCELLED).
   * Requirements: 13.6
   */
  async getChurnReport(includeChurnRate = false): Promise<ChurnReport> {
    const cancelledEnrolments = await prisma.enrolment.findMany({
      where: { status: EnrolmentStatus.CANCELLED },
      select: { updatedAt: true },
      orderBy: { updatedAt: 'asc' },
    });

    const monthMap = new Map<string, number>();
    for (const enrolment of cancelledEnrolments) {
      const d = enrolment.updatedAt;
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(month, (monthMap.get(month) ?? 0) + 1);
    }

    let activeCountByMonth: Map<string, number> | null = null;
    if (includeChurnRate && monthMap.size > 0) {
      // For each month, count enrolments that were active at the start of that month
      // (created before the month and not cancelled before the month)
      activeCountByMonth = new Map<string, number>();
      for (const month of monthMap.keys()) {
        const [year, mon] = month.split('-').map(Number);
        const startOfMonth = new Date(year, mon - 1, 1);
        const count = await prisma.enrolment.count({
          where: {
            createdAt: { lt: startOfMonth },
            OR: [
              { status: { not: EnrolmentStatus.CANCELLED } },
              { updatedAt: { gte: startOfMonth } },
            ],
          },
        });
        activeCountByMonth.set(month, count);
      }
    }

    const byMonth: CancellationByMonth[] = Array.from(monthMap.entries()).map(
      ([month, cancellations]) => {
        const entry: CancellationByMonth = { month, cancellations };
        if (includeChurnRate && activeCountByMonth) {
          const activeCount = activeCountByMonth.get(month) ?? 0;
          entry.churnRate =
            activeCount > 0
              ? Math.round((cancellations / activeCount) * 10000) / 100
              : 0;
        }
        return entry;
      }
    );

    return { byMonth };
  }

  /**
   * Returns attendance trends grouped by class or student.
   * Requirements: 17.4
   */
  async getAttendanceReport(groupBy: 'class' | 'student' = 'class'): Promise<AttendanceReport> {
    if (groupBy === 'class') {
      const records = await prisma.attendanceRecord.findMany({
        select: {
          classId: true,
          status: true,
          class: { select: { name: true } },
        },
      });

      const classMap = new Map<string, { className: string; present: number; absent: number; late: number; excused: number }>();
      for (const r of records) {
        const entry = classMap.get(r.classId) ?? { className: r.class.name, present: 0, absent: 0, late: 0, excused: 0 };
        if (r.status === AttendanceStatus.PRESENT) entry.present++;
        else if (r.status === AttendanceStatus.ABSENT) entry.absent++;
        else if (r.status === AttendanceStatus.LATE) entry.late++;
        else if (r.status === AttendanceStatus.EXCUSED) entry.excused++;
        classMap.set(r.classId, entry);
      }

      const byClass: AttendanceByClass[] = Array.from(classMap.entries()).map(([classId, data]) => ({
        classId,
        className: data.className,
        present: data.present,
        absent: data.absent,
        late: data.late,
        excused: data.excused,
        total: data.present + data.absent + data.late + data.excused,
      }));

      return { groupBy: 'class', byClass };
    } else {
      const records = await prisma.attendanceRecord.findMany({
        select: {
          dancerId: true,
          status: true,
          dancer: { select: { firstName: true, lastName: true } },
        },
      });

      const dancerMap = new Map<string, { dancerName: string; present: number; absent: number; late: number; excused: number }>();
      for (const r of records) {
        const entry = dancerMap.get(r.dancerId) ?? {
          dancerName: `${r.dancer.firstName} ${r.dancer.lastName}`,
          present: 0,
          absent: 0,
          late: 0,
          excused: 0,
        };
        if (r.status === AttendanceStatus.PRESENT) entry.present++;
        else if (r.status === AttendanceStatus.ABSENT) entry.absent++;
        else if (r.status === AttendanceStatus.LATE) entry.late++;
        else if (r.status === AttendanceStatus.EXCUSED) entry.excused++;
        dancerMap.set(r.dancerId, entry);
      }

      const byStudent: AttendanceByStudent[] = Array.from(dancerMap.entries()).map(([dancerId, data]) => ({
        dancerId,
        dancerName: data.dancerName,
        present: data.present,
        absent: data.absent,
        late: data.late,
        excused: data.excused,
        total: data.present + data.absent + data.late + data.excused,
      }));

      return { groupBy: 'student', byStudent };
    }
  }

  /**
   * Converts report data to CSV string.
   * Requirements: 13.7
   */
  exportToCsv(
    _reportType: 'enrolment' | 'capacity' | 'revenue' | 'outstanding' | 'churn' | 'attendance',
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
