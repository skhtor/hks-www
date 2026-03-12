import { XeroClient, Contact, Contacts, Phone, Invoice as XeroInvoiceType, Invoices as XeroInvoicesType, LineItem, Payment as XeroPaymentType, Payments as XeroPaymentsType } from 'xero-node';
import { prisma } from '../config/database';
import { SyncType } from '@prisma/client';

/**
 * In-memory token storage for Xero OAuth 2.0 tokens.
 * Requirements: 18.4 - Store Xero API tokens securely.
 * For production, tokens should be stored in encrypted persistent storage.
 */
interface XeroTokenStore {
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiry: Date | null;
  tenantId: string | null;
}

const tokenStore: XeroTokenStore = {
  accessToken: null,
  refreshToken: null,
  tokenExpiry: null,
  tenantId: null,
};

/**
 * XeroService handles OAuth 2.0 authentication and provides an authenticated
 * Xero API client.
 *
 * Requirements: 10.5 - Validate credentials and display connection status.
 * Requirements: 18.4 - Store Xero API tokens securely.
 */
export class XeroService {
  private client: XeroClient;

  constructor() {
    this.client = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID ?? '',
      clientSecret: process.env.XERO_CLIENT_SECRET ?? '',
      redirectUris: [process.env.XERO_REDIRECT_URI ?? 'http://localhost:3000/api/xero/callback'],
      scopes: (process.env.XERO_SCOPES ?? 'openid profile email accounting.contacts accounting.transactions offline_access').split(' '),
    });
  }

  /**
   * Returns the Xero OAuth 2.0 authorization URL.
   * Requirements: 10.5
   */
  async getAuthorizationUrl(): Promise<string> {
    const consentUrl = await this.client.buildConsentUrl();
    return consentUrl;
  }

  /**
   * Exchanges an authorization code for access and refresh tokens.
   * Requirements: 10.5, 18.4
   */
  async exchangeCodeForTokens(code: string): Promise<void> {
    const tokenSet = await this.client.apiCallback(
      `${process.env.XERO_REDIRECT_URI ?? 'http://localhost:3000/api/xero/callback'}?code=${code}`
    );

    this.storeTokenSet(tokenSet);

    // Retrieve available tenants and store the first one
    const tenants = await this.client.updateTenants();
    if (tenants && tenants.length > 0) {
      tokenStore.tenantId = tenants[0].tenantId;
    }
  }

  /**
   * Refreshes the access token using the stored refresh token.
   * Requirements: 18.4
   */
  async refreshTokens(): Promise<void> {
    if (!tokenStore.refreshToken) {
      throw new Error('No refresh token available. Please re-authenticate with Xero.');
    }

    const tokenSet = await this.client.refreshWithRefreshToken(
      process.env.XERO_CLIENT_ID ?? '',
      process.env.XERO_CLIENT_SECRET ?? '',
      tokenStore.refreshToken
    );

    this.storeTokenSet(tokenSet);
  }

  /**
   * Returns true if the service has valid (non-expired) tokens.
   */
  isAuthenticated(): boolean {
    if (!tokenStore.accessToken || !tokenStore.tokenExpiry) {
      return false;
    }
    // Consider token expired 60 seconds before actual expiry to avoid edge cases
    const bufferMs = 60 * 1000;
    return tokenStore.tokenExpiry.getTime() - bufferMs > Date.now();
  }

  /**
   * Returns an authenticated XeroClient, auto-refreshing tokens if needed.
   * Requirements: 10.5, 18.4
   */
  async getClient(): Promise<XeroClient> {
    if (!tokenStore.accessToken) {
      throw new Error('Not authenticated with Xero. Please complete OAuth flow.');
    }

    if (!this.isAuthenticated()) {
      await this.refreshTokens();
    }

    return this.client;
  }

  /**
   * Returns the active Xero tenant ID.
   */
  getTenantId(): string | null {
    return tokenStore.tenantId;
  }

  /**
   * Returns the current connection status.
   */
  getStatus(): { connected: boolean; tenantId: string | null; tokenExpiry: Date | null } {
    return {
      connected: this.isAuthenticated(),
      tenantId: tokenStore.tenantId,
      tokenExpiry: tokenStore.tokenExpiry,
    };
  }

  /**
   * Disconnects from Xero by clearing the in-memory token store.
   * Requirements: 22.4
   */
  disconnect(): void {
    tokenStore.accessToken = null;
    tokenStore.refreshToken = null;
    tokenStore.tokenExpiry = null;
    tokenStore.tenantId = null;
  }

  /**
   * Tests the Xero connection by attempting to fetch tenant info.
   * Requirements: 30.1
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const client = await this.getClient();
      const tenants = await client.updateTenants();
      if (tenants && tenants.length > 0) {
        return { success: true, message: `Connected to Xero tenant: ${tenants[0].tenantName ?? tenants[0].tenantId}` };
      }
      return { success: true, message: 'Connected to Xero (no tenants found)' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to Xero';
      return { success: false, message };
    }
  }

  /**
   * Synchronizes a customer to Xero as a contact.
   * - If a XeroContact record already exists, updates the Xero contact.
   * - If not, searches Xero by email first to avoid duplicates (Req 10.6).
   *   - If found: links the existing Xero contact.
   *   - If not found: creates a new Xero contact.
   * - Updates lastSyncedAt and logs the result to SyncLog.
   *
   * Requirements: 10.1, 10.2, 10.4, 10.6
   */
  async syncContact(customerId: string): Promise<{ success: boolean; xeroContactId?: string; error?: string }> {
    // Look up customer with user (for email)
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: { user: true },
    });

    if (!customer) {
      await this.logSync(customerId, false, 'Customer not found');
      return { success: false, error: 'Customer not found' };
    }

    const client = await this.getClient();
    const tenantId = this.getTenantId();

    if (!tenantId) {
      await this.logSync(customerId, false, 'Xero tenant not configured');
      return { success: false, error: 'Xero tenant not configured' };
    }

    try {
      const existingXeroContact = await prisma.xeroContact.findUnique({
        where: { customerId },
      });

      let xeroContactId: string;

      if (existingXeroContact) {
        // Update existing Xero contact
        const contactPayload: Contact = {
          contactID: existingXeroContact.xeroContactId,
          name: customer.name,
          emailAddress: customer.user.email,
          phones: customer.mobile
            ? [{ phoneType: Phone.PhoneTypeEnum.DEFAULT, phoneNumber: customer.mobile }]
            : undefined,
        };

        await client.accountingApi.updateContact(tenantId, existingXeroContact.xeroContactId, {
          contacts: [contactPayload],
        });

        await prisma.xeroContact.update({
          where: { customerId },
          data: { lastSyncedAt: new Date() },
        });

        xeroContactId = existingXeroContact.xeroContactId;
      } else {
        // Search Xero for existing contact by email (idempotency / dedup)
        const searchResponse = await client.accountingApi.getContacts(
          tenantId,
          undefined, // ifModifiedSince
          `EmailAddress="${customer.user.email}"`, // where
          undefined, // order
          undefined, // ids
          undefined, // page
          undefined, // includeArchived
          undefined, // summaryOnly
          undefined, // searchTerm
        );

        const contacts: Contact[] = (searchResponse.body as Contacts).contacts ?? [];
        const matched = contacts.find(
          (c) => c.emailAddress?.toLowerCase() === customer.user.email.toLowerCase()
        );

        if (matched && matched.contactID) {
          // Link existing Xero contact
          xeroContactId = matched.contactID;
          await prisma.xeroContact.create({
            data: {
              customerId,
              xeroContactId,
              lastSyncedAt: new Date(),
            },
          });
        } else {
          // Create new Xero contact
          const newContact: Contact = {
            name: customer.name,
            emailAddress: customer.user.email,
            phones: customer.mobile
              ? [{ phoneType: Phone.PhoneTypeEnum.DEFAULT, phoneNumber: customer.mobile }]
              : undefined,
          };

          const createResponse = await client.accountingApi.createContacts(tenantId, {
            contacts: [newContact],
          });

          const created = ((createResponse.body as Contacts).contacts ?? [])[0];
          if (!created?.contactID) {
            throw new Error('Xero did not return a contact ID after creation');
          }

          xeroContactId = created.contactID;
          await prisma.xeroContact.create({
            data: {
              customerId,
              xeroContactId,
              lastSyncedAt: new Date(),
            },
          });
        }
      }

      await this.logSync(customerId, true);
      return { success: true, xeroContactId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error during contact sync';
      await this.logSync(customerId, false, message);
      return { success: false, error: message };
    }
  }

  /**
   * Synchronizes an invoice to Xero.
   * - Looks up the Invoice by id (including customer and xeroInvoice).
   * - Ensures the customer has a Xero contact (calls syncContact if needed).
   * - If a XeroInvoice record already exists: updates the Xero invoice.
   * - If not: creates a new Xero invoice with line items, account code, tax type,
   *   and AUTHORISED status, then creates the XeroInvoice link record.
   * - Logs the result to SyncLog.
   *
   * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
   */
  async syncInvoice(invoiceId: string): Promise<{ success: boolean; xeroInvoiceId?: string; error?: string }> {
    // Look up invoice with customer and existing xero link
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: true,
        xeroInvoice: true,
      },
    });

    if (!invoice) {
      await this.logInvoiceSync(invoiceId, false, 'Invoice not found');
      return { success: false, error: 'Invoice not found' };
    }

    // Ensure customer has a Xero contact
    let xeroContact = await prisma.xeroContact.findUnique({
      where: { customerId: invoice.customerId },
    });

    if (!xeroContact) {
      const contactResult = await this.syncContact(invoice.customerId);
      if (!contactResult.success) {
        await this.logInvoiceSync(invoiceId, false, `Contact sync failed: ${contactResult.error}`);
        return { success: false, error: `Contact sync failed: ${contactResult.error}` };
      }
      xeroContact = await prisma.xeroContact.findUnique({
        where: { customerId: invoice.customerId },
      });
    }

    if (!xeroContact) {
      await this.logInvoiceSync(invoiceId, false, 'Could not resolve Xero contact');
      return { success: false, error: 'Could not resolve Xero contact' };
    }

    const client = await this.getClient();
    const tenantId = this.getTenantId();

    if (!tenantId) {
      await this.logInvoiceSync(invoiceId, false, 'Xero tenant not configured');
      return { success: false, error: 'Xero tenant not configured' };
    }

    // Config from environment
    const accountCode = process.env.XERO_ACCOUNT_CODE ?? '200';
    const taxType = process.env.XERO_TAX_TYPE ?? 'OUTPUT';

    // Build line items from invoice.lineItems JSON
    const rawLineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
    const lineItems: LineItem[] = (rawLineItems as Array<Record<string, unknown>>).map((item) => ({
      description: String(item['description'] ?? ''),
      quantity: Number(item['quantity'] ?? 1),
      unitAmount: Number(item['unitAmount'] ?? 0),
      accountCode: String(item['accountCode'] ?? accountCode),
      taxType,
    }));

    try {
      let xeroInvoiceId: string;

      if (invoice.xeroInvoice) {
        // Update existing Xero invoice
        const updatePayload: XeroInvoiceType = {
          invoiceID: invoice.xeroInvoice.xeroInvoiceId,
          lineItems,
        };

        await client.accountingApi.updateInvoice(
          tenantId,
          invoice.xeroInvoice.xeroInvoiceId,
          { invoices: [updatePayload] },
          undefined,
          invoice.invoiceNumber, // idempotency key
        );

        await prisma.xeroInvoice.update({
          where: { invoiceId },
          data: { lastSyncedAt: new Date() },
        });

        xeroInvoiceId = invoice.xeroInvoice.xeroInvoiceId;
      } else {
        // Create new Xero invoice
        const dueDate = invoice.dueDate.toISOString().split('T')[0];

        const newInvoice: XeroInvoiceType = {
          type: XeroInvoiceType.TypeEnum.ACCREC,
          contact: { contactID: xeroContact.xeroContactId },
          invoiceNumber: invoice.invoiceNumber,
          dueDate,
          lineItems,
          status: XeroInvoiceType.StatusEnum.AUTHORISED,
        };

        const createResponse = await client.accountingApi.createInvoices(
          tenantId,
          { invoices: [newInvoice] } as XeroInvoicesType,
          undefined,
          undefined,
          invoice.invoiceNumber, // idempotency key
        );

        const created = ((createResponse.body as XeroInvoicesType).invoices ?? [])[0];
        if (!created?.invoiceID) {
          throw new Error('Xero did not return an invoice ID after creation');
        }

        xeroInvoiceId = created.invoiceID;

        await prisma.xeroInvoice.create({
          data: {
            invoiceId,
            xeroInvoiceId,
            lastSyncedAt: new Date(),
          },
        });
      }

      await this.logInvoiceSync(invoiceId, true);
      return { success: true, xeroInvoiceId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error during invoice sync';
      await this.logInvoiceSync(invoiceId, false, message);
      return { success: false, error: message };
    }
  }

  /**
   * Synchronizes a payment to Xero by marking the corresponding Xero invoice as paid.
   * - Looks up the Payment by id (including invoice and xeroInvoice link).
   * - Ensures the invoice has been synced to Xero first.
   * - Creates a payment record in Xero against the Xero invoice.
   * - Handles partial payments by recording the exact amount paid.
   * - Logs the result to SyncLog.
   *
   * Requirements: 12.1, 12.2, 12.4
   */
  async syncPayment(paymentId: string): Promise<{ success: boolean; xeroPaymentId?: string; error?: string }> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        invoice: {
          include: { xeroInvoice: true },
        },
      },
    });

    if (!payment) {
      await this.logPaymentSync(paymentId, false, 'Payment not found');
      return { success: false, error: 'Payment not found' };
    }

    if (payment.status !== 'PAID' && payment.status !== 'PARTIALLY_REFUNDED') {
      await this.logPaymentSync(paymentId, false, 'Payment is not in a paid state');
      return { success: false, error: 'Payment is not in a paid state' };
    }

    const xeroInvoice = payment.invoice.xeroInvoice;
    if (!xeroInvoice) {
      // Sync the invoice to Xero first
      const invoiceSyncResult = await this.syncInvoice(payment.invoiceId);
      if (!invoiceSyncResult.success) {
        await this.logPaymentSync(paymentId, false, `Invoice sync failed: ${invoiceSyncResult.error}`);
        return { success: false, error: `Invoice sync failed: ${invoiceSyncResult.error}` };
      }
    }

    // Re-fetch to get the xeroInvoice after potential sync
    const xeroInvoiceRecord = xeroInvoice ?? (await prisma.xeroInvoice.findUnique({
      where: { invoiceId: payment.invoiceId },
    }));

    if (!xeroInvoiceRecord) {
      await this.logPaymentSync(paymentId, false, 'Could not resolve Xero invoice');
      return { success: false, error: 'Could not resolve Xero invoice' };
    }

    const client = await this.getClient();
    const tenantId = this.getTenantId();

    if (!tenantId) {
      await this.logPaymentSync(paymentId, false, 'Xero tenant not configured');
      return { success: false, error: 'Xero tenant not configured' };
    }

    try {
      const paidDate = (payment.paidAt ?? payment.createdAt).toISOString().split('T')[0];

      const xeroPayload: XeroPaymentType = {
        invoice: { invoiceID: xeroInvoiceRecord.xeroInvoiceId },
        amount: Number(payment.amount),
        date: paidDate,
      };

      const response = await client.accountingApi.createPayment(
        tenantId,
        xeroPayload,
        paymentId, // idempotency key
      );

      const created = (response.body as XeroPaymentsType).payments?.[0];
      if (!created?.paymentID) {
        throw new Error('Xero did not return a payment ID after creation');
      }

      await this.logPaymentSync(paymentId, true);
      return { success: true, xeroPaymentId: created.paymentID };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error during payment sync';
      await this.logPaymentSync(paymentId, false, message);
      return { success: false, error: message };
    }
  }

  /**
   * Retries a failed sync operation identified by its SyncLog ID.
   * Increments retryCount and lastRetryAt, then re-runs the appropriate sync.
   * Requirements: 10.3, 11.6, 12.3, 19.2, 19.3
   */
  async retrySync(syncLogId: string): Promise<{ success: boolean; error?: string }> {
    const syncLog = await prisma.syncLog.findUnique({ where: { id: syncLogId } });
    if (!syncLog) {
      return { success: false, error: 'Sync log entry not found' };
    }

    if (syncLog.success) {
      return { success: false, error: 'Sync log entry already succeeded' };
    }

    // Update retry metadata
    await prisma.syncLog.update({
      where: { id: syncLogId },
      data: {
        retryCount: { increment: 1 },
        lastRetryAt: new Date(),
      },
    });

    let result: { success: boolean; error?: string };

    switch (syncLog.syncType) {
      case SyncType.CONTACT:
        result = await this.syncContact(syncLog.entityId);
        break;
      case SyncType.INVOICE:
        result = await this.syncInvoice(syncLog.entityId);
        break;
      case SyncType.PAYMENT:
        result = await this.syncPayment(syncLog.entityId);
        break;
      default:
        return { success: false, error: `Unknown sync type: ${syncLog.syncType}` };
    }

    return result;
  }

  /**
   * Returns failed sync log entries with optional filtering.
   * Requirements: 10.3, 11.6, 12.3, 19.2, 19.3
   */
  async getSyncErrors(filters?: {
    syncType?: SyncType;
    limit?: number;
    offset?: number;
  }): Promise<{ id: string; entityType: string; entityId: string; syncType: string; errorMessage: string | null; retryCount: number; lastRetryAt: Date | null; createdAt: Date }[]> {
    return prisma.syncLog.findMany({
      where: {
        success: false,
        ...(filters?.syncType ? { syncType: filters.syncType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit ?? 50,
      skip: filters?.offset ?? 0,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        syncType: true,
        errorMessage: true,
        retryCount: true,
        lastRetryAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * Writes a SyncLog entry for a contact sync operation.
   */
  private async logSync(customerId: string, success: boolean, errorMessage?: string): Promise<void> {
    await prisma.syncLog.create({
      data: {
        entityType: 'CUSTOMER',
        entityId: customerId,
        syncType: SyncType.CONTACT,
        success,
        errorMessage: errorMessage ?? null,
      },
    });
  }

  /**
   * Writes a SyncLog entry for an invoice sync operation.
   */
  private async logInvoiceSync(invoiceId: string, success: boolean, errorMessage?: string): Promise<void> {
    await prisma.syncLog.create({
      data: {
        entityType: 'INVOICE',
        entityId: invoiceId,
        syncType: SyncType.INVOICE,
        success,
        errorMessage: errorMessage ?? null,
      },
    });
  }

  /**
   * Writes a SyncLog entry for a payment sync operation.
   */
  private async logPaymentSync(paymentId: string, success: boolean, errorMessage?: string): Promise<void> {
    await prisma.syncLog.create({
      data: {
        entityType: 'PAYMENT',
        entityId: paymentId,
        syncType: SyncType.PAYMENT,
        success,
        errorMessage: errorMessage ?? null,
      },
    });
  }

  /**
   * Retries a failed sync with exponential backoff.
   * Attempts up to maxRetries times, doubling the delay each attempt (capped at maxDelay).
   * Updates retryCount and lastRetryAt in SyncLog on each attempt.
   * Requirements: 10.3, 11.6, 12.3, 12.6, 19.2, 19.3
   */
  async retrySyncWithBackoff(
    syncLogId: string,
    options: { maxRetries?: number; initialDelayMs?: number; maxDelayMs?: number } = {}
  ): Promise<{ success: boolean; attempts: number; error?: string }> {
    const maxRetries = options.maxRetries ?? 5;
    const initialDelay = options.initialDelayMs ?? 1000;
    const maxDelay = options.maxDelayMs ?? 60000;

    let delay = initialDelay;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.retrySync(syncLogId);
      if (result.success) {
        return { success: true, attempts: attempt };
      }

      lastError = result.error;

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, maxDelay);
      }
    }

    return { success: false, attempts: maxRetries, error: lastError };
  }

  /**
   * Stores token data from a Xero token set response.
   */
  private storeTokenSet(tokenSet: Record<string, unknown>): void {
    tokenStore.accessToken = (tokenSet.access_token as string) ?? null;
    tokenStore.refreshToken = (tokenSet.refresh_token as string) ?? null;

    const expiresIn = tokenSet.expires_in as number | undefined;
    if (expiresIn) {
      tokenStore.tokenExpiry = new Date(Date.now() + expiresIn * 1000);
    } else {
      // Default 30-minute expiry if not provided
      tokenStore.tokenExpiry = new Date(Date.now() + 30 * 60 * 1000);
    }
  }
}

export const xeroService = new XeroService();
