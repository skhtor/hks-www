import { config } from '../../config/env';

describe('Environment Configuration', () => {
  it('should load environment variables', () => {
    expect(config).toBeDefined();
    expect(config.env).toBe('test');
    expect(config.port).toBeGreaterThan(0);
  });

  it('should have database configuration', () => {
    expect(config.database.url).toBeDefined();
    expect(config.database.url).toContain('postgresql://');
  });

  it('should have Redis configuration', () => {
    expect(config.redis.host).toBeDefined();
    expect(config.redis.port).toBeGreaterThan(0);
  });

  it('should have JWT configuration', () => {
    expect(config.jwt.secret).toBeDefined();
    expect(config.jwt.refreshSecret).toBeDefined();
    expect(config.jwt.expiresIn).toBeDefined();
  });

  it('should have bcrypt configuration', () => {
    expect(config.bcrypt.rounds).toBeGreaterThan(0);
    expect(config.bcrypt.rounds).toBeLessThanOrEqual(12);
  });
});
