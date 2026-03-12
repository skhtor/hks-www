import { XeroClient, Contact, Contacts, Phone } from 'xero-node';
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
