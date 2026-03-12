import { NotificationType } from '@prisma/client';
import { prisma } from '../config/database';
import { emailService } from './email.service';
import { notificationTemplateService } from './notification-template.service';

class NotificationService {
  private async getCustomerEmail(customerId: string): Promise<{ email: string; name: string }> {
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: { user: true },
    });
    return { email: customer.user.email, name: customer.name };
  }

  private getTemplateForType(type: NotificationType): string {
    const templates = notificationTemplateService.listTemplates(type);
    const active = templates.find((t) => t.active);
    if (!active) throw new Error(`No active template found for type: ${type}`);
    return active.id;
  }

  private async logNotification(
    customerId: string,
    type: NotificationType,
    templateId: string,
    variables: Record<string, string>,
    status: string,
    sentAt?: Date
  ): Promise<void> {
    await prisma.notificationLog.create({
      data: {
        customerId,
        type,
        templateId,
        variables,
        status,
        sentAt: sentAt ?? null,
      },
    });
  }

  async sendPaymentConfirmation(
    customerId: string,
    invoiceId: string,
    amount: number
  ): Promise<void> {
    const type = NotificationType.PAYMENT_CONFIRMATION;
    const { email, name } = await this.getCustomerEmail(customerId);
    const templateId = this.getTemplateForType(type);
    const variables: Record<string, string> = {
      customerName: name,
      invoiceNumber: invoiceId,
      amount: `$${amount.toFixed(2)}`,
      date: new Date().toLocaleDateString('en-AU'),
    };

    try {
      await emailService.sendTemplatedEmail(email, templateId, variables);
      await this.logNotification(customerId, type, templateId, variables, 'SENT', new Date());
    } catch (err) {
      await this.logNotification(customerId, type, templateId, variables, 'FAILED');
      throw err;
    }
  }

  async sendPaymentReminder(
    customerId: string,
    invoiceId: string,
    dueDate: Date,
    amount: number
  ): Promise<void> {
    const type = NotificationType.PAYMENT_REMINDER;
    const { email, name } = await this.getCustomerEmail(customerId);
    const templateId = this.getTemplateForType(type);
    const variables: Record<string, string> = {
      customerName: name,
      invoiceNumber: invoiceId,
      amount: `$${amount.toFixed(2)}`,
      dueDate: dueDate.toLocaleDateString('en-AU'),
    };

    try {
      await emailService.sendTemplatedEmail(email, templateId, variables);
      await this.logNotification(customerId, type, templateId, variables, 'SENT', new Date());
    } catch (err) {
      await this.logNotification(customerId, type, templateId, variables, 'FAILED');
      throw err;
    }
  }

  async sendOverdueNotification(
    customerId: string,
    invoiceId: string,
    amount: number
  ): Promise<void> {
    const type = NotificationType.PAYMENT_OVERDUE;
    const { email, name } = await this.getCustomerEmail(customerId);
    const templateId = this.getTemplateForType(type);
    const variables: Record<string, string> = {
      customerName: name,
      invoiceNumber: invoiceId,
      amount: `$${amount.toFixed(2)}`,
      dueDate: new Date().toLocaleDateString('en-AU'),
    };

    try {
      await emailService.sendTemplatedEmail(email, templateId, variables);
      await this.logNotification(customerId, type, templateId, variables, 'SENT', new Date());
    } catch (err) {
      await this.logNotification(customerId, type, templateId, variables, 'FAILED');
      throw err;
    }
  }

  async sendTermReminder(
    customerId: string,
    termName: string,
    startDate: Date
  ): Promise<void> {
    const type = NotificationType.TERM_REMINDER;
    const { email, name } = await this.getCustomerEmail(customerId);
    const templateId = this.getTemplateForType(type);
    const variables: Record<string, string> = {
      customerName: name,
      termStartDate: startDate.toLocaleDateString('en-AU'),
      classList: termName,
    };

    try {
      await emailService.sendTemplatedEmail(email, templateId, variables);
      await this.logNotification(customerId, type, templateId, variables, 'SENT', new Date());
    } catch (err) {
      await this.logNotification(customerId, type, templateId, variables, 'FAILED');
      throw err;
    }
  }

  async sendClassChangeNotification(
    customerId: string,
    className: string,
    changeDescription: string
  ): Promise<void> {
    const type = NotificationType.CLASS_CHANGE;
    const { email, name } = await this.getCustomerEmail(customerId);
    const templateId = this.getTemplateForType(type);
    const variables: Record<string, string> = {
      customerName: name,
      className,
      changeDetails: changeDescription,
    };

    try {
      await emailService.sendTemplatedEmail(email, templateId, variables);
      await this.logNotification(customerId, type, templateId, variables, 'SENT', new Date());
    } catch (err) {
      await this.logNotification(customerId, type, templateId, variables, 'FAILED');
      throw err;
    }
  }

  async sendWaitlistOffer(
    customerId: string,
    className: string,
    expiresAt: Date
  ): Promise<void> {
    const type = NotificationType.WAITLIST_OFFER;
    const { email, name } = await this.getCustomerEmail(customerId);
    const templateId = this.getTemplateForType(type);
    const variables: Record<string, string> = {
      customerName: name,
      className,
      dancerName: name,
      expiryDate: expiresAt.toLocaleDateString('en-AU'),
    };

    try {
      await emailService.sendTemplatedEmail(email, templateId, variables);
      await this.logNotification(customerId, type, templateId, variables, 'SENT', new Date());
    } catch (err) {
      await this.logNotification(customerId, type, templateId, variables, 'FAILED');
      throw err;
    }
  }
}

export const notificationService = new NotificationService();
