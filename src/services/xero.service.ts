import { XeroClient } from 'xero-node';

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
