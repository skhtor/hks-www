import { NotificationType } from '@prisma/client';
import { randomUUID } from 'crypto';

export interface NotificationTemplate {
  id: string;
  type: NotificationType;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RenderResult {
  subject: string;
  body: string;
}

export class TemplateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateValidationError';
  }
}

export class TemplateNotFoundError extends Error {
  constructor(id: string) {
    super(`Template not found: ${id}`);
    this.name = 'TemplateNotFoundError';
  }
}

// Default templates for all NotificationType values
const DEFAULT_TEMPLATES: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    type: NotificationType.PAYMENT_CONFIRMATION,
    name: 'Payment Confirmation',
    subject: 'Payment Confirmed - {{invoiceNumber}}',
    body: 'Dear {{customerName}},\n\nYour payment of {{amount}} for invoice {{invoiceNumber}} has been confirmed.\n\nThank you for your payment.\n\nRegards,\nThe Dance School Team',
    variables: ['customerName', 'amount', 'invoiceNumber'],
    active: true,
  },
  {
    type: NotificationType.PAYMENT_REMINDER,
    name: 'Payment Reminder',
    subject: 'Payment Reminder - Invoice {{invoiceNumber}} Due {{dueDate}}',
    body: 'Dear {{customerName}},\n\nThis is a reminder that invoice {{invoiceNumber}} for {{amount}} is due on {{dueDate}}.\n\nPlease arrange payment at your earliest convenience.\n\nRegards,\nThe Dance School Team',
    variables: ['customerName', 'amount', 'invoiceNumber', 'dueDate'],
    active: true,
  },
  {
    type: NotificationType.PAYMENT_OVERDUE,
    name: 'Payment Overdue',
    subject: 'Overdue Payment - Invoice {{invoiceNumber}}',
    body: 'Dear {{customerName}},\n\nInvoice {{invoiceNumber}} for {{amount}} is now overdue. It was due on {{dueDate}}.\n\nPlease contact us to arrange payment immediately.\n\nRegards,\nThe Dance School Team',
    variables: ['customerName', 'amount', 'invoiceNumber', 'dueDate'],
    active: true,
  },
  {
    type: NotificationType.TERM_REMINDER,
    name: 'Term Reminder',
    subject: 'New Term Starting {{termStartDate}}',
    body: 'Dear {{customerName}},\n\nThis is a reminder that the new term starts on {{termStartDate}}.\n\nClasses enrolled: {{classList}}\n\nWe look forward to seeing you!\n\nRegards,\nThe Dance School Team',
    variables: ['customerName', 'termStartDate', 'classList'],
    active: true,
  },
  {
    type: NotificationType.CLASS_CHANGE,
    name: 'Class Change Notification',
    subject: 'Class Change Notice - {{className}}',
    body: 'Dear {{customerName}},\n\nWe would like to inform you of a change to {{className}}.\n\n{{changeDetails}}\n\nIf you have any questions, please contact us.\n\nRegards,\nThe Dance School Team',
    variables: ['customerName', 'className', 'changeDetails'],
    active: true,
  },
  {
    type: NotificationType.WAITLIST_OFFER,
    name: 'Waitlist Offer',
    subject: 'A Spot Has Opened in {{className}}!',
    body: 'Dear {{customerName}},\n\nGreat news! A spot has opened in {{className}} for {{dancerName}}.\n\nThis offer expires on {{expiryDate}}. Please contact us to confirm your enrolment.\n\nRegards,\nThe Dance School Team',
    variables: ['customerName', 'className', 'dancerName', 'expiryDate'],
    active: true,
  },
  {
    type: NotificationType.TRIAL_FOLLOWUP,
    name: 'Trial Follow-up',
    subject: 'How Was Your Trial Class?',
    body: 'Dear {{customerName}},\n\nThank you for attending the trial class for {{dancerName}} in {{className}}.\n\nWe hope you enjoyed the experience! If you would like to enrol, please contact us by {{enrollmentDeadline}}.\n\nRegards,\nThe Dance School Team',
    variables: ['customerName', 'dancerName', 'className', 'enrollmentDeadline'],
    active: true,
  },
];

class NotificationTemplateService {
  private templates: Map<string, NotificationTemplate> = new Map();

  constructor() {
    this.seedDefaultTemplates();
  }

  private seedDefaultTemplates(): void {
    for (const tpl of DEFAULT_TEMPLATES) {
      const now = new Date();
      const template: NotificationTemplate = {
        ...tpl,
        id: randomUUID(),
        createdAt: now,
        updatedAt: now,
      };
      this.templates.set(template.id, template);
    }
  }

  /**
   * Validates template syntax:
   * - No unclosed {{ or }} brackets
   * - All {{variable}} references are declared in the variables array
   */
  validateTemplate(subject: string, body: string, variables: string[]): void {
    const combined = `${subject}\n${body}`;

    // Check for unclosed {{ (opening without closing)
    const openCount = (combined.match(/\{\{/g) || []).length;
    const closeCount = (combined.match(/\}\}/g) || []).length;
    if (openCount !== closeCount) {
      throw new TemplateValidationError(
        'Template has mismatched {{ }} brackets'
      );
    }

    // Check for malformed single braces that aren't part of {{ }}
    if (/(?<!\{)\{(?!\{)/.test(combined) || /(?<!\})\}(?!\})/.test(combined)) {
      throw new TemplateValidationError(
        'Template contains invalid single brace characters'
      );
    }

    // Extract all {{variable}} references
    const refs = combined.match(/\{\{(\w+)\}\}/g) || [];
    const referencedVars = refs.map((r) => r.slice(2, -2));

    // All referenced variables must be declared
    const undeclared = referencedVars.filter((v) => !variables.includes(v));
    if (undeclared.length > 0) {
      throw new TemplateValidationError(
        `Template references undeclared variables: ${undeclared.join(', ')}`
      );
    }
  }

  createTemplate(
    data: Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ): NotificationTemplate {
    this.validateTemplate(data.subject, data.body, data.variables);
    const now = new Date();
    const template: NotificationTemplate = {
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.templates.set(template.id, template);
    return template;
  }

  getTemplate(id: string): NotificationTemplate {
    const template = this.templates.get(id);
    if (!template) throw new TemplateNotFoundError(id);
    return template;
  }

  updateTemplate(
    id: string,
    data: Partial<Omit<NotificationTemplate, 'id' | 'createdAt' | 'updatedAt'>>
  ): NotificationTemplate {
    const existing = this.getTemplate(id);
    const updated: NotificationTemplate = {
      ...existing,
      ...data,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };
    // Validate after merge
    this.validateTemplate(updated.subject, updated.body, updated.variables);
    this.templates.set(id, updated);
    return updated;
  }

  deleteTemplate(id: string): void {
    if (!this.templates.has(id)) throw new TemplateNotFoundError(id);
    this.templates.delete(id);
  }

  listTemplates(type?: NotificationType): NotificationTemplate[] {
    const all = Array.from(this.templates.values());
    if (type) return all.filter((t) => t.type === type);
    return all;
  }

  /**
   * Renders a template by substituting {{variable}} placeholders with provided values.
   * Missing variables are left as-is.
   */
  renderTemplate(
    templateId: string,
    variables: Record<string, string>
  ): RenderResult {
    const template = this.getTemplate(templateId);

    const substitute = (text: string): string =>
      text.replace(/\{\{(\w+)\}\}/g, (_, key) =>
        key in variables ? variables[key] : `{{${key}}}`
      );

    return {
      subject: substitute(template.subject),
      body: substitute(template.body),
    };
  }
}

export const notificationTemplateService = new NotificationTemplateService();
