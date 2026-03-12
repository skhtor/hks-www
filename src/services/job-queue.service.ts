import { getRedisClient } from '../config/redis';
import { notificationService } from './notification.service';
import { xeroService } from './xero.service';

export type JobType =
  | 'send-notification'
  | 'xero-sync-contact'
  | 'xero-sync-invoice'
  | 'xero-sync-payment';

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
}

const QUEUE_PREFIX = 'job-queue';
const POLL_INTERVAL_MS = 5000;

class JobQueueService {
  private workerInterval: ReturnType<typeof setInterval> | null = null;

  /**
   * Enqueues a new job into the Redis list for the given type.
   * Uses LPUSH so RPOP gives FIFO order.
   * Requirements: 12.5, 19.2
   */
  async enqueueJob(
    type: string,
    payload: Record<string, unknown>,
    maxAttempts = 3
  ): Promise<string> {
    const id = crypto.randomUUID();
    const job: Job = {
      id,
      type,
      payload,
      attempts: 0,
      maxAttempts,
      createdAt: new Date().toISOString(),
    };

    const client = getRedisClient();
    await client.lPush(`${QUEUE_PREFIX}:${type}`, JSON.stringify(job));
    return id;
  }

  /**
   * Processes a single job, routing to the appropriate handler.
   * On failure, re-enqueues with incremented attempts and exponential backoff delay.
   * Requirements: 19.2
   */
  async processJob(job: Job): Promise<void> {
    try {
      if (job.type === 'send-notification') {
        await this.processNotificationJob(job.payload);
      } else if (
        job.type === 'xero-sync-contact' ||
        job.type === 'xero-sync-invoice' ||
        job.type === 'xero-sync-payment'
      ) {
        await this.processXeroSyncJob(job.payload);
      } else {
        console.warn(`[JobQueue] Unknown job type: ${job.type}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[JobQueue] Job ${job.id} (${job.type}) failed: ${message}`);

      const nextAttempts = job.attempts + 1;
      if (nextAttempts < job.maxAttempts) {
        // Exponential backoff: 2^attempts seconds (1s, 2s, 4s, ...)
        const delayMs = Math.pow(2, nextAttempts) * 1000;
        const retryJob: Job = { ...job, attempts: nextAttempts };

        setTimeout(async () => {
          try {
            const client = getRedisClient();
            await client.lPush(`${QUEUE_PREFIX}:${job.type}`, JSON.stringify(retryJob));
          } catch (redisErr) {
            console.error(`[JobQueue] Failed to re-enqueue job ${job.id}:`, redisErr);
          }
        }, delayMs);
      } else {
        console.error(
          `[JobQueue] Job ${job.id} (${job.type}) exhausted ${job.maxAttempts} attempts. Dropping.`
        );
      }
    }
  }

  /**
   * Routes notification jobs to the appropriate notificationService method.
   * Requirements: 12.5
   */
  private async processNotificationJob(payload: Record<string, unknown>): Promise<void> {
    const { notificationType } = payload;

    switch (notificationType) {
      case 'PAYMENT_CONFIRMATION':
        await notificationService.sendPaymentConfirmation(
          payload.customerId as string,
          payload.invoiceId as string,
          payload.amount as number
        );
        break;
      case 'PAYMENT_REMINDER':
        await notificationService.sendPaymentReminder(
          payload.customerId as string,
          payload.invoiceId as string,
          new Date(payload.dueDate as string),
          payload.amount as number
        );
        break;
      case 'PAYMENT_OVERDUE':
        await notificationService.sendOverdueNotification(
          payload.customerId as string,
          payload.invoiceId as string,
          payload.amount as number
        );
        break;
      case 'TERM_REMINDER':
        await notificationService.sendTermReminder(
          payload.customerId as string,
          payload.termName as string,
          new Date(payload.startDate as string)
        );
        break;
      case 'CLASS_CHANGE':
        await notificationService.sendClassChangeNotification(
          payload.customerId as string,
          payload.className as string,
          payload.changeDescription as string
        );
        break;
      case 'WAITLIST_OFFER':
        await notificationService.sendWaitlistOffer(
          payload.customerId as string,
          payload.className as string,
          new Date(payload.expiresAt as string)
        );
        break;
      default:
        throw new Error(`Unknown notificationType: ${notificationType as string}`);
    }
  }

  /**
   * Routes Xero sync jobs to the appropriate xeroService method.
   * Requirements: 19.2
   */
  private async processXeroSyncJob(payload: Record<string, unknown>): Promise<void> {
    const { syncType } = payload;

    switch (syncType) {
      case 'contact':
        await xeroService.syncContact(payload.customerId as string);
        break;
      case 'invoice':
        await xeroService.syncInvoice(payload.invoiceId as string);
        break;
      case 'payment':
        await xeroService.syncPayment(payload.paymentId as string);
        break;
      default:
        throw new Error(`Unknown syncType: ${syncType as string}`);
    }
  }

  /**
   * Starts a polling worker that dequeues and processes jobs every 5 seconds.
   * Polls all known job types in each tick.
   */
  startWorker(): void {
    if (this.workerInterval) {
      console.warn('[JobQueue] Worker already running');
      return;
    }

    const jobTypes: JobType[] = [
      'send-notification',
      'xero-sync-contact',
      'xero-sync-invoice',
      'xero-sync-payment',
    ];

    this.workerInterval = setInterval(async () => {
      const client = getRedisClient();
      for (const type of jobTypes) {
        try {
          const raw = await client.rPop(`${QUEUE_PREFIX}:${type}`);
          if (raw) {
            const job = JSON.parse(raw) as Job;
            // Process without awaiting so the interval isn't blocked
            this.processJob(job).catch((err) => {
              console.error(`[JobQueue] Unhandled error processing job:`, err);
            });
          }
        } catch (err) {
          console.error(`[JobQueue] Error polling queue ${type}:`, err);
        }
      }
    }, POLL_INTERVAL_MS);

    console.log('[JobQueue] Worker started');
  }

  /** Stops the polling worker. */
  stopWorker(): void {
    if (this.workerInterval) {
      clearInterval(this.workerInterval);
      this.workerInterval = null;
      console.log('[JobQueue] Worker stopped');
    }
  }
}

export const jobQueueService = new JobQueueService();
