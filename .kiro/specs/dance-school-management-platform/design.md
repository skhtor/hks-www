# Design Document: Dance School Management Platform

## Overview

The Dance School Management Platform is a full-stack web application built on a modern, API-first architecture. The system consists of three main components:

1. **Public Website**: Marketing pages, timetable browsing, and registration entry points
2. **Customer Portal**: Authenticated area for managing dancer profiles, enrolments, and payments
3. **Staff Portal**: Separate authenticated areas for teachers and administrators

The platform integrates with two critical external services:
- **Xero API**: For contact management, invoice generation, and payment reconciliation
- **Payment Gateway** (e.g., Stripe): For secure online payment processing

The architecture prioritizes:
- **Automation**: Minimize manual admin work through automated billing, notifications, and sync
- **Reliability**: Idempotent operations, retry logic, and graceful degradation
- **Flexibility**: Configurable pricing rules, policies, and workflows
- **Security**: Role-based access control, encrypted credentials, audit logging
- **Performance**: Sub-300ms page loads, efficient caching, background job processing

## Architecture

### System Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        PW[Public Website]
        CP[Customer Portal]
        TP[Teacher Portal]
        AP[Admin Portal]
    end
    
    subgraph "API Layer"
        API[REST API Gateway]
        AUTH[Authentication Service]
    end
    
    subgraph "Application Layer"
        US[User Service]
        CS[Class Service]
        ES[Enrolment Service]
        FE[Fee Engine]
        PS[Payment Service]
        NS[Notification Service]
        RS[Reporting Service]
    end
    
    subgraph "Integration Layer"
        XS[Xero Sync Service]
        PG[Payment Gateway Client]
        JQ[Job Queue]
    end
    
    subgraph "Data Layer"
        DB[(PostgreSQL Database)]
        CACHE[(Redis Cache)]
    end
    
    subgraph "External Services"
        XERO[Xero API]
        STRIPE[Stripe API]
        EMAIL[Email Service]
    end
    
    PW --> API
    CP --> API
    TP --> API
    AP --> API
    
    API --> AUTH
    API --> US
    API --> CS
    API --> ES
    API --> FE
    API --> PS
    API --> RS
    
    US --> DB
    CS --> DB
    ES --> DB
    ES --> FE
    PS --> PG
    PS --> XS
    
    XS --> JQ
    NS --> JQ
    
    JQ --> XERO
    JQ --> EMAIL
    PG --> STRIPE
    
    US --> CACHE
    CS --> CACHE
    
    XS --> DB
    NS --> DB
```

### Technology Stack Recommendations

**Frontend:**
- React or Next.js for server-side rendering and SEO
- TypeScript for type safety
- Tailwind CSS for responsive design
- React Query for API state management

**Backend:**
- Node.js with Express or NestJS (TypeScript)
- Alternative: Python with FastAPI or Django REST Framework
- JWT for authentication tokens
- Passport.js or similar for OAuth support

**Database:**
- PostgreSQL for relational data with ACID guarantees
- Redis for caching and session storage
- Database migrations with Prisma or TypeORM

**Infrastructure:**
- Docker containers for consistent deployment
- Background job processing with Bull (Node.js) or Celery (Python)
- AWS/Azure/GCP for hosting
- CloudFront or similar CDN for static assets

**External Integrations:**
- Xero OAuth 2.0 SDK
- Stripe SDK for payment processing
- SendGrid or AWS SES for transactional emails
- Optional: Twilio for SMS notifications

### Deployment Architecture

```mermaid
graph LR
    subgraph "CDN"
        CF[CloudFront]
    end
    
    subgraph "Load Balancer"
        ALB[Application Load Balancer]
    end
    
    subgraph "Application Tier"
        API1[API Server 1]
        API2[API Server 2]
        WORKER1[Background Worker 1]
        WORKER2[Background Worker 2]
    end
    
    subgraph "Data Tier"
        RDS[(RDS PostgreSQL)]
        REDIS[(ElastiCache Redis)]
    end
    
    CF --> ALB
    ALB --> API1
    ALB --> API2
    
    API1 --> RDS
    API2 --> RDS
    API1 --> REDIS
    API2 --> REDIS
    
    WORKER1 --> RDS
    WORKER2 --> RDS
    WORKER1 --> REDIS
    WORKER2 --> REDIS
```

## Components and Interfaces

### 1. Authentication Service

**Responsibilities:**
- User registration and login
- Password hashing and validation
- JWT token generation and validation
- Role-based access control enforcement
- Optional OAuth integration
- MFA support for staff accounts

**Key Interfaces:**

```typescript
interface AuthService {
  register(email: string, password: string, role: UserRole): Promise<User>
  login(email: string, password: string): Promise<AuthToken>
  validateToken(token: string): Promise<User>
  refreshToken(refreshToken: string): Promise<AuthToken>
  resetPassword(email: string): Promise<void>
  changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void>
  enableMFA(userId: string): Promise<MFASecret>
  verifyMFA(userId: string, code: string): Promise<boolean>
}

interface AuthToken {
  accessToken: string
  refreshToken: string
  expiresIn: number
  user: UserProfile
}

enum UserRole {
  PUBLIC = 'public',
  CUSTOMER = 'customer',
  TEACHER = 'teacher',
  ADMIN = 'admin'
}
```

### 2. User Service

**Responsibilities:**
- Customer account management
- Dancer profile CRUD operations
- Household management
- Teacher profile management
- Access control policy enforcement

**Key Interfaces:**

```typescript
interface UserService {
  createCustomerAccount(data: CustomerRegistration): Promise<Customer>
  getCustomer(customerId: string): Promise<Customer>
  updateCustomer(customerId: string, data: Partial<Customer>): Promise<Customer>
  
  addDancer(customerId: string, data: DancerProfile): Promise<Dancer>
  updateDancer(dancerId: string, data: Partial<DancerProfile>): Promise<Dancer>
  getDancersForCustomer(customerId: string): Promise<Dancer[]>
  
  createTeacher(data: TeacherProfile): Promise<Teacher>
  getTeacher(teacherId: string): Promise<Teacher>
  updateTeacher(teacherId: string, data: Partial<TeacherProfile>): Promise<Teacher>
  listTeachers(): Promise<Teacher[]>
}

interface Customer {
  id: string
  email: string
  name: string
  mobile: string
  address?: Address
  householdId: string
  createdAt: Date
  updatedAt: Date
}

interface Dancer {
  id: string
  householdId: string
  firstName: string
  lastName: string
  dateOfBirth: Date
  emergencyContact: EmergencyContact
  medicalNotes?: string
  allergies?: string
  photoConsent: boolean
  skillLevel?: string
  createdAt: Date
  updatedAt: Date
}

interface Teacher {
  id: string
  userId: string
  name: string
  email: string
  bio?: string
  specialties: string[]
  photoUrl?: string
  createdAt: Date
  updatedAt: Date
}
```

### 3. Class Service

**Responsibilities:**
- Class CRUD operations
- Timetable generation and filtering
- Capacity management
- Teacher assignment
- Studio room allocation
- Scheduling conflict detection

**Key Interfaces:**

```typescript
interface ClassService {
  createClass(data: ClassDefinition): Promise<Class>
  updateClass(classId: string, data: Partial<ClassDefinition>): Promise<Class>
  deleteClass(classId: string): Promise<void>
  getClass(classId: string): Promise<Class>
  
  getTimetable(filters: TimetableFilters): Promise<Class[]>
  getClassesForTeacher(teacherId: string): Promise<Class[]>
  
  checkCapacity(classId: string): Promise<CapacityInfo>
  validateScheduling(data: ClassDefinition): Promise<ValidationResult>
  assignTeacher(classId: string, teacherId: string): Promise<Class>
  assignSubstitute(classId: string, teacherId: string, date: Date): Promise<void>
}

interface Class {
  id: string
  name: string
  description?: string
  style: string
  level: string
  ageRange?: AgeRange
  dayOfWeek: DayOfWeek
  startTime: Time
  duration: number // minutes
  locationId: string
  roomId?: string
  teacherId: string
  capacity: number
  enrolledCount: number
  startDate?: Date
  endDate?: Date
  pricingRuleId: string
  createdAt: Date
  updatedAt: Date
}

interface TimetableFilters {
  ageGroup?: string
  level?: string
  style?: string
  locationId?: string
  teacherId?: string
  dayOfWeek?: DayOfWeek
}

interface CapacityInfo {
  capacity: number
  enrolled: number
  available: number
  waitlistCount: number
}
```

### 4. Enrolment Service

**Responsibilities:**
- Enrolment creation and management
- Waitlist management
- Trial booking handling
- Enrolment status tracking
- Capacity enforcement with locking

**Key Interfaces:**

```typescript
interface EnrolmentService {
  createEnrolment(data: EnrolmentRequest): Promise<Enrolment>
  createBulkEnrolment(data: BulkEnrolmentRequest): Promise<Enrolment[]>
  cancelEnrolment(enrolmentId: string, effectiveDate: Date): Promise<Enrolment>
  moveEnrolment(enrolmentId: string, newClassId: string): Promise<Enrolment>
  
  getEnrolmentsForDancer(dancerId: string): Promise<Enrolment[]>
  getEnrolmentsForClass(classId: string): Promise<Enrolment[]>
  
  addToWaitlist(dancerId: string, classId: string): Promise<WaitlistEntry>
  processWaitlist(classId: string): Promise<void>
  
  createTrialBooking(data: TrialBookingRequest): Promise<Enrolment>
  convertTrialToFull(enrolmentId: string): Promise<Enrolment>
}

interface Enrolment {
  id: string
  dancerId: string
  classId: string
  status: EnrolmentStatus
  startDate: Date
  endDate?: Date
  isTrial: boolean
  createdAt: Date
  updatedAt: Date
}

enum EnrolmentStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  TRIAL = 'trial'
}

interface WaitlistEntry {
  id: string
  dancerId: string
  classId: string
  position: number
  createdAt: Date
  expiresAt?: Date
}
```

### 5. Fee Engine

**Responsibilities:**
- Fee calculation based on configurable rules
- Discount application
- Proration calculation
- One-time fee handling
- Pricing rule management

**Key Interfaces:**

```typescript
interface FeeEngine {
  calculateFees(request: FeeCalculationRequest): Promise<FeeBreakdown>
  applyDiscounts(fees: FeeBreakdown, eligibility: DiscountEligibility): Promise<FeeBreakdown>
  calculateProration(monthlyFee: number, startDate: Date, billingCycle: BillingCycle): Promise<number>
  
  createPricingRule(rule: PricingRule): Promise<PricingRule>
  updatePricingRule(ruleId: string, rule: Partial<PricingRule>): Promise<PricingRule>
  getPricingRules(): Promise<PricingRule[]>
  
  createDiscount(discount: DiscountRule): Promise<DiscountRule>
  getActiveDiscounts(): Promise<DiscountRule[]>
}

interface FeeCalculationRequest {
  enrolments: EnrolmentRequest[]
  householdId: string
  startDate: Date
  billingCycle: BillingCycle
}

interface FeeBreakdown {
  subtotal: number
  discounts: DiscountApplication[]
  oneTimeFees: OneTimeFee[]
  prorationAdjustment: number
  gst: number
  total: number
  lineItems: FeeLineItem[]
}

interface PricingRule {
  id: string
  name: string
  type: PricingRuleType
  classCountMin: number
  classCountMax?: number
  monthlyFee: number
  termFee?: number
  locationId?: string
  priority: number
  active: boolean
}

enum PricingRuleType {
  PER_CLASS = 'per_class',
  TIERED_BUNDLE = 'tiered_bundle',
  TERM_BASED = 'term_based'
}

interface DiscountRule {
  id: string
  name: string
  type: DiscountType
  value: number // percentage or fixed amount
  eligibilityCriteria: EligibilityCriteria
  priority: number
  active: boolean
  startDate?: Date
  endDate?: Date
}

enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
  FAMILY = 'family',
  CONCESSION = 'concession',
  TRIAL = 'trial'
}
```

### 6. Payment Service

**Responsibilities:**
- Payment processing via gateway
- Payment status tracking
- Subscription management
- Receipt generation
- Payment reconciliation with Xero

**Key Interfaces:**

```typescript
interface PaymentService {
  createPayment(data: PaymentRequest): Promise<Payment>
  processPayment(paymentId: string): Promise<PaymentResult>
  refundPayment(paymentId: string, amount: number, reason: string): Promise<Refund>
  
  createSubscription(data: SubscriptionRequest): Promise<Subscription>
  cancelSubscription(subscriptionId: string): Promise<void>
  updatePaymentMethod(customerId: string, paymentMethodId: string): Promise<void>
  
  getPaymentsForCustomer(customerId: string): Promise<Payment[]>
  getPaymentStatus(paymentId: string): Promise<PaymentStatus>
  
  generateReceipt(paymentId: string): Promise<Receipt>
}

interface Payment {
  id: string
  customerId: string
  invoiceId: string
  amount: number
  currency: string
  status: PaymentStatus
  gatewayPaymentId: string
  paymentMethod: PaymentMethod
  createdAt: Date
  paidAt?: Date
}

enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PAID = 'paid',
  FAILED = 'failed',
  REFUNDED = 'refunded',
  PARTIALLY_REFUNDED = 'partially_refunded'
}

interface PaymentResult {
  success: boolean
  payment: Payment
  error?: PaymentError
}
```

### 7. Xero Sync Service

**Responsibilities:**
- Contact synchronization
- Invoice generation
- Payment reconciliation
- Sync error handling and retry
- Idempotency management

**Key Interfaces:**

```typescript
interface XeroSyncService {
  syncContact(customerId: string): Promise<XeroSyncResult>
  syncInvoice(invoiceId: string): Promise<XeroSyncResult>
  syncPayment(paymentId: string): Promise<XeroSyncResult>
  
  createOrMatchContact(customer: Customer): Promise<XeroContact>
  createInvoice(invoice: Invoice, config: XeroConfig): Promise<XeroInvoice>
  recordPayment(payment: Payment, xeroInvoiceId: string): Promise<XeroPayment>
  
  retryFailedSync(syncLogId: string): Promise<XeroSyncResult>
  getSyncStatus(): Promise<XeroSyncStatus>
  getSyncErrors(filters: SyncErrorFilters): Promise<SyncError[]>
}

interface XeroSyncResult {
  success: boolean
  xeroId?: string
  error?: SyncError
  syncLogId: string
}

interface XeroConfig {
  tenantId: string
  revenueAccountCode: string
  taxType: string
  trackingCategories: TrackingCategory[]
  invoiceStatus: 'DRAFT' | 'APPROVED'
  invoiceTiming: 'IMMEDIATE' | 'BATCH'
}

interface SyncError {
  id: string
  entityType: string
  entityId: string
  errorMessage: string
  errorCode?: string
  retryCount: number
  lastRetryAt?: Date
  createdAt: Date
}
```

### 8. Notification Service

**Responsibilities:**
- Email notification sending
- SMS notification sending (optional)
- Template management
- Notification scheduling
- Delivery tracking

**Key Interfaces:**

```typescript
interface NotificationService {
  sendEmail(data: EmailNotification): Promise<NotificationResult>
  sendSMS(data: SMSNotification): Promise<NotificationResult>
  
  scheduleNotification(data: ScheduledNotification): Promise<void>
  
  getTemplate(templateId: string): Promise<NotificationTemplate>
  updateTemplate(templateId: string, template: Partial<NotificationTemplate>): Promise<NotificationTemplate>
  
  getNotificationHistory(customerId: string): Promise<NotificationLog[]>
}

interface EmailNotification {
  to: string
  templateId: string
  variables: Record<string, any>
  attachments?: Attachment[]
}

interface NotificationTemplate {
  id: string
  name: string
  type: NotificationType
  subject: string
  bodyHtml: string
  bodyText: string
  variables: string[]
}

enum NotificationType {
  PAYMENT_CONFIRMATION = 'payment_confirmation',
  PAYMENT_REMINDER = 'payment_reminder',
  PAYMENT_OVERDUE = 'payment_overdue',
  TERM_REMINDER = 'term_reminder',
  CLASS_CHANGE = 'class_change',
  WAITLIST_OFFER = 'waitlist_offer',
  TRIAL_FOLLOWUP = 'trial_followup'
}
```

### 9. Reporting Service

**Responsibilities:**
- Report generation
- Data aggregation
- Export functionality
- Performance metrics

**Key Interfaces:**

```typescript
interface ReportingService {
  generateEnrolmentReport(filters: ReportFilters): Promise<EnrolmentReport>
  generateRevenueReport(filters: ReportFilters): Promise<RevenueReport>
  generateCapacityReport(filters: ReportFilters): Promise<CapacityReport>
  generateOutstandingPaymentsReport(): Promise<OutstandingPaymentsReport>
  generateChurnReport(filters: ReportFilters): Promise<ChurnReport>
  
  exportReport(reportId: string, format: ExportFormat): Promise<ExportResult>
}

interface EnrolmentReport {
  totalEnrolments: number
  activeEnrolments: number
  enrolmentsByClass: ClassEnrolmentSummary[]
  newEnrolmentsThisMonth: number
  period: DateRange
}

interface RevenueReport {
  totalRevenue: number
  revenueByMonth: MonthlyRevenue[]
  revenueByClass: ClassRevenue[]
  outstandingAmount: number
  period: DateRange
}
```

## Data Models

### Core Entities

```mermaid
erDiagram
    UserAccount ||--o{ Customer : "is"
    UserAccount ||--o{ Teacher : "is"
    Customer ||--|| Household : "belongs to"
    Household ||--o{ Dancer : "contains"
    Dancer ||--o{ Enrolment : "has"
    Class ||--o{ Enrolment : "has"
    Class ||--|| Teacher : "taught by"
    Class ||--|| Location : "held at"
    Class ||--|| PricingRule : "uses"
    Enrolment ||--|| Invoice : "generates"
    Invoice ||--o{ Payment : "paid by"
    Invoice ||--|| XeroInvoice : "synced to"
    Customer ||--|| XeroContact : "synced to"
    Class ||--o{ WaitlistEntry : "has"
    Dancer ||--o{ WaitlistEntry : "on"
    Class ||--o{ AttendanceRecord : "has"
    Dancer ||--o{ AttendanceRecord : "has"
    
    UserAccount {
        uuid id PK
        string email UK
        string passwordHash
        enum role
        boolean mfaEnabled
        timestamp createdAt
        timestamp updatedAt
    }
    
    Customer {
        uuid id PK
        uuid userId FK
        uuid householdId FK
        string name
        string mobile
        jsonb address
        timestamp createdAt
        timestamp updatedAt
    }
    
    Household {
        uuid id PK
        string name
        timestamp createdAt
    }
    
    Dancer {
        uuid id PK
        uuid householdId FK
        string firstName
        string lastName
        date dateOfBirth
        jsonb emergencyContact
        text medicalNotes
        text allergies
        boolean photoConsent
        string skillLevel
        timestamp createdAt
        timestamp updatedAt
    }
    
    Teacher {
        uuid id PK
        uuid userId FK
        string name
        string email
        text bio
        string[] specialties
        string photoUrl
        timestamp createdAt
        timestamp updatedAt
    }
    
    Location {
        uuid id PK
        string name
        jsonb address
        string contactPhone
        timestamp createdAt
    }
    
    Class {
        uuid id PK
        string name
        text description
        string style
        string level
        jsonb ageRange
        enum dayOfWeek
        time startTime
        integer duration
        uuid locationId FK
        uuid roomId FK
        uuid teacherId FK
        integer capacity
        integer enrolledCount
        date startDate
        date endDate
        uuid pricingRuleId FK
        timestamp createdAt
        timestamp updatedAt
    }
    
    Enrolment {
        uuid id PK
        uuid dancerId FK
        uuid classId FK
        enum status
        date startDate
        date endDate
        boolean isTrial
        timestamp createdAt
        timestamp updatedAt
    }
    
    PricingRule {
        uuid id PK
        string name
        enum type
        integer classCountMin
        integer classCountMax
        decimal monthlyFee
        decimal termFee
        uuid locationId FK
        integer priority
        boolean active
        timestamp createdAt
        timestamp updatedAt
    }
    
    DiscountRule {
        uuid id PK
        string name
        enum type
        decimal value
        jsonb eligibilityCriteria
        integer priority
        boolean active
        date startDate
        date endDate
        timestamp createdAt
    }
    
    Invoice {
        uuid id PK
        uuid customerId FK
        uuid householdId FK
        string invoiceNumber UK
        decimal subtotal
        decimal discountAmount
        decimal gstAmount
        decimal total
        enum status
        date dueDate
        date paidDate
        string xeroInvoiceId
        jsonb lineItems
        timestamp createdAt
        timestamp updatedAt
    }
    
    Payment {
        uuid id PK
        uuid invoiceId FK
        uuid customerId FK
        decimal amount
        string currency
        enum status
        string gatewayPaymentId
        jsonb paymentMethod
        timestamp paidAt
        timestamp createdAt
    }
    
    XeroContact {
        uuid id PK
        uuid customerId FK
        string xeroContactId UK
        timestamp lastSyncedAt
        timestamp createdAt
    }
    
    XeroInvoice {
        uuid id PK
        uuid invoiceId FK
        string xeroInvoiceId UK
        timestamp lastSyncedAt
        timestamp createdAt
    }
    
    WaitlistEntry {
        uuid id PK
        uuid dancerId FK
        uuid classId FK
        integer position
        timestamp expiresAt
        timestamp createdAt
    }
    
    AttendanceRecord {
        uuid id PK
        uuid enrolmentId FK
        uuid classId FK
        uuid dancerId FK
        date classDate
        enum status
        text notes
        timestamp markedAt
        uuid markedBy FK
    }
    
    SyncLog {
        uuid id PK
        enum entityType
        uuid entityId
        enum syncType
        boolean success
        text errorMessage
        string errorCode
        integer retryCount
        timestamp lastRetryAt
        timestamp createdAt
    }
    
    NotificationLog {
        uuid id PK
        uuid customerId FK
        enum type
        string templateId
        jsonb variables
        enum status
        timestamp sentAt
        timestamp createdAt
    }
    
    AuditLog {
        uuid id PK
        uuid userId FK
        enum action
        string entityType
        uuid entityId
        jsonb changes
        timestamp createdAt
    }
```

### Database Indexes

**Critical indexes for performance:**

```sql
-- User lookups
CREATE INDEX idx_user_email ON user_account(email);
CREATE INDEX idx_user_role ON user_account(role);

-- Customer and dancer lookups
CREATE INDEX idx_customer_household ON customer(household_id);
CREATE INDEX idx_dancer_household ON dancer(household_id);

-- Class queries
CREATE INDEX idx_class_teacher ON class(teacher_id);
CREATE INDEX idx_class_location ON class(location_id);
CREATE INDEX idx_class_day_time ON class(day_of_week, start_time);
CREATE INDEX idx_class_active ON class(start_date, end_date) WHERE end_date IS NULL OR end_date > CURRENT_DATE;

-- Enrolment queries
CREATE INDEX idx_enrolment_dancer ON enrolment(dancer_id);
CREATE INDEX idx_enrolment_class ON enrolment(class_id);
CREATE INDEX idx_enrolment_status ON enrolment(status);
CREATE INDEX idx_enrolment_active ON enrolment(class_id, status) WHERE status = 'active';

-- Invoice and payment queries
CREATE INDEX idx_invoice_customer ON invoice(customer_id);
CREATE INDEX idx_invoice_status ON invoice(status);
CREATE INDEX idx_invoice_due_date ON invoice(due_date) WHERE status != 'paid';
CREATE INDEX idx_payment_invoice ON payment(invoice_id);
CREATE INDEX idx_payment_customer ON payment(customer_id);

-- Xero sync queries
CREATE INDEX idx_xero_contact_customer ON xero_contact(customer_id);
CREATE INDEX idx_xero_invoice_invoice ON xero_invoice(invoice_id);
CREATE INDEX idx_sync_log_entity ON sync_log(entity_type, entity_id);
CREATE INDEX idx_sync_log_failed ON sync_log(success, retry_count) WHERE success = false;

-- Waitlist queries
CREATE INDEX idx_waitlist_class ON waitlist_entry(class_id, position);
CREATE INDEX idx_waitlist_dancer ON waitlist_entry(dancer_id);

-- Attendance queries
CREATE INDEX idx_attendance_class_date ON attendance_record(class_id, class_date);
CREATE INDEX idx_attendance_dancer ON attendance_record(dancer_id);
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

The following properties define the correctness criteria for the Dance School Management Platform. Each property is universally quantified and references the specific requirements it validates. These properties will be implemented as property-based tests to ensure comprehensive validation across all possible inputs.

### Authentication and Authorization Properties

**Property 1: Account Creation Uniqueness**
*For any* email address, creating multiple customer accounts with that email should result in exactly one account, with subsequent attempts rejected due to uniqueness constraints.
**Validates: Requirements 1.1**

**Property 2: Authentication Round Trip**
*For any* valid customer account, logging in with correct credentials should grant access to the customer portal with the correct user identity and role.
**Validates: Requirements 1.2**

**Property 3: Profile Update Persistence**
*For any* customer or dancer profile update, immediately reading back the profile should return the updated values (round-trip property).
**Validates: Requirements 1.6**

**Property 4: Password Strength Enforcement**
*For any* password that violates strength requirements (minimum length, complexity rules), account creation or password change should be rejected.
**Validates: Requirements 1.7**

**Property 5: Role-Based Access Control**
*For any* user and resource, access should be granted if and only if the user's role has permission for that resource type.
**Validates: Requirements 2.2**

**Property 6: Teacher Class Visibility**
*For any* teacher, the set of visible classes should equal exactly the set of classes assigned to that teacher.
**Validates: Requirements 2.3**

**Property 7: Teacher Access Restrictions**
*For any* teacher and any admin feature or unassigned class, access attempts should be denied.
**Validates: Requirements 2.7**

### Timetable and Filtering Properties

**Property 8: Timetable Filter Correctness**
*For any* filter criteria (age group, level, style, location, teacher, day), all returned classes should match the filter, and all matching classes should be returned.
**Validates: Requirements 3.2**

**Property 9: Class Display Completeness**
*For any* class displayed in the timetable, the display should contain time, duration, teacher name, remaining capacity, and price basis.
**Validates: Requirements 3.3**

### Enrolment and Capacity Properties

**Property 10: Fee Calculation Determinism**
*For any* set of selected classes and customer profile, calculating fees multiple times should produce identical results (deterministic calculation).
**Validates: Requirements 4.2**

**Property 11: Discount Application Correctness**
*For any* enrolment with eligible discounts, the final fee should equal the base fee minus correctly calculated discount amounts.
**Validates: Requirements 4.3**

**Property 12: Capacity Enforcement**
*For any* class at full capacity, enrolment attempts should be rejected, and the enrolled count should never exceed the capacity limit.
**Validates: Requirements 4.4, 8.6**

**Property 13: Enrolment Count Invariant**
*For any* class, the enrolled count should equal the number of active enrolments for that class.
**Validates: Requirements 4.7**

**Property 14: Capacity Adjustment on Move**
*For any* enrolment move from class A to class B, the enrolled count of A should decrease by 1 and the enrolled count of B should increase by 1.
**Validates: Requirements 9.1**

### Fee Engine Properties

**Property 15: Per-Class Pricing Calculation**
*For any* number of classes N with per-class pricing rule, the monthly fee should equal N × per-class rate.
**Validates: Requirements 5.1**

**Property 16: Tiered Bundle Pricing**
*For any* class count, the applied pricing tier should be the one where classCountMin ≤ count ≤ classCountMax, and the fee should match that tier's rate.
**Validates: Requirements 5.2**

**Property 17: Family Discount Application**
*For any* household with multiple dancers, the total fee should include the configured family discount percentage applied to the appropriate dancers.
**Validates: Requirements 5.3**

**Property 18: Proration Calculation**
*For any* start date within a billing cycle, the prorated fee should equal (monthly fee × remaining days) / total days in cycle.
**Validates: Requirements 5.6**

**Property 19: GST Calculation**
*For any* fee calculation, the GST amount should equal 10% of the subtotal (Australian GST rate).
**Validates: Requirements 5.7**

**Property 20: Invoice Total Integrity**
*For any* invoice, the total should equal the sum of all line item amounts plus GST minus discounts.
**Validates: Requirements 19.4**

### Payment Properties

**Property 21: Payment Status Consistency**
*For any* successful payment, the payment record status should be "Paid" and the associated invoice status should be updated accordingly.
**Validates: Requirements 6.3**

**Property 22: Payment State Machine**
*For any* payment, status transitions should follow valid paths: Pending → Processing → (Paid | Failed), and Paid → (Refunded | Partially_Refunded).
**Validates: Requirements 6.7**

### Xero Integration Properties

**Property 23: Contact Sync Idempotency**
*For any* customer, creating or syncing the customer multiple times should result in exactly one Xero contact (idempotency).
**Validates: Requirements 10.1, 10.4**

**Property 24: Contact Email Uniqueness**
*For any* customer email that matches an existing Xero contact, no new Xero contact should be created.
**Validates: Requirements 10.6**

**Property 25: Invoice Generation Idempotency**
*For any* enrolment, confirming the enrolment multiple times with the same idempotency key should result in exactly one Xero invoice.
**Validates: Requirements 11.1, 11.5**

**Property 26: Payment Reconciliation**
*For any* successful payment in the system, the corresponding Xero invoice should be marked as paid with the correct payment amount.
**Validates: Requirements 12.1**

**Property 27: Partial Payment Recording**
*For any* partial payment, the Xero payment record should reflect the exact partial amount paid.
**Validates: Requirements 12.4**

### Waitlist Properties

**Property 28: Waitlist Ordering**
*For any* waitlist, entries should be ordered by position, and positions should be sequential starting from 1 with no gaps.
**Validates: Requirements 15.2**

**Property 29: Waitlist Queue Processing**
*For any* class with a waitlist, when a spot opens, the customer at position 1 should be offered the spot first.
**Validates: Requirements 15.3**

**Property 30: Waitlist Progression**
*For any* waitlist offer that expires, the next customer in queue (position 2 becomes position 1) should be offered the spot.
**Validates: Requirements 15.5**

### Trial and Attendance Properties

**Property 31: Trial Enrolment Creation**
*For any* trial booking, exactly one enrolment record should be created with isTrial=true and status="trial".
**Validates: Requirements 16.2**

**Property 32: Trial Booking Limits**
*For any* dancer, attempting to book multiple trials for the same class or studio (based on config) should be rejected after the first trial.
**Validates: Requirements 16.5**

**Property 33: Attendance Record Persistence**
*For any* attendance marking, a record should exist with the correct dancer, class, date, status, and timestamp.
**Validates: Requirements 17.2**

### Security Properties

**Property 34: Password Hashing**
*For any* stored password, the database value should be a hash, not plaintext, and should verify correctly against the original password.
**Validates: Requirements 18.1**

**Property 35: Card Number Security**
*For any* payment method stored in the database, full card numbers should never appear—only tokenized references.
**Validates: Requirements 18.3**

### Data Integrity Properties

**Property 36: Invoice Generation Idempotency**
*For any* invoice generation request with the same idempotency key, multiple requests should result in exactly one invoice.
**Validates: Requirements 19.1**

**Property 37: Concurrent Capacity Enforcement**
*For any* class under concurrent enrolment attempts, the final enrolled count should never exceed capacity, even with race conditions.
**Validates: Requirements 19.5**

**Property 38: Referential Integrity**
*For any* payment, the referenced invoice should exist, and for any invoice, the referenced enrolments should exist.
**Validates: Requirements 19.6**

**Property 39: Audit Log Completeness**
*For any* admin action (enrolment change, class update, user creation), an audit log entry should be created with action type, entity, and changes.
**Validates: Requirements 9.6**

### Configuration and Operations Properties

**Property 40: Configuration Immediate Effect**
*For any* pricing rule update, fee calculations performed after the update should use the new rule values.
**Validates: Requirements 22.6**

**Property 41: Room Scheduling Conflicts**
*For any* time slot and room, at most one class should be scheduled in that room at that time.
**Validates: Requirements 24.1**

**Property 42: Teacher Scheduling Conflicts**
*For any* time slot, a teacher should be assigned to at most one class at that time.
**Validates: Requirements 24.2**

### Transaction Properties

**Property 43: Bulk Enrolment Atomicity**
*For any* multi-dancer enrolment, either all enrolment records should be created successfully, or none should be created (atomic transaction).
**Validates: Requirements 25.4**

### Business Logic Properties

**Property 44: Refund Calculation**
*For any* cancellation with effective date, the refund amount should match the configured policy calculation based on notice period and refund percentage.
**Validates: Requirements 26.2**

**Property 45: Inventory Constraint**
*For any* merchandise item with zero inventory, purchase attempts should be rejected.
**Validates: Requirements 27.5**

**Property 46: Location Filtering**
*For any* location filter, all returned classes should be at the selected location, and all classes at that location should be returned.
**Validates: Requirements 28.3**

## Error Handling

### Error Categories

The system must handle errors gracefully across several categories:

1. **Validation Errors**: Invalid input data, constraint violations
2. **Business Logic Errors**: Capacity exceeded, scheduling conflicts, insufficient permissions
3. **Integration Errors**: Xero API failures, payment gateway errors
4. **System Errors**: Database failures, network timeouts, unexpected exceptions

### Error Handling Strategy

**Validation Errors:**
- Return 400 Bad Request with detailed error messages
- Include field-level validation errors in response
- Log validation failures for monitoring

**Business Logic Errors:**
- Return 409 Conflict for capacity/scheduling conflicts
- Return 403 Forbidden for permission violations
- Return 422 Unprocessable Entity for business rule violations
- Provide clear error messages explaining the constraint

**Integration Errors:**
- Queue failed operations for retry with exponential backoff
- Log errors to sync_log table with retry count
- Display sync errors in admin portal with manual retry option
- Implement circuit breaker pattern for external services
- Graceful degradation: allow core operations to continue if Xero is unavailable

**System Errors:**
- Return 500 Internal Server Error for unexpected failures
- Log full stack traces for debugging
- Alert administrators for critical failures
- Implement database transaction rollback for data consistency

### Retry Logic

**Xero Sync Operations:**
```typescript
interface RetryConfig {
  maxRetries: 5
  initialDelay: 1000 // ms
  maxDelay: 60000 // ms
  backoffMultiplier: 2
}

async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  config: RetryConfig
): Promise<T> {
  let lastError: Error
  let delay = config.initialDelay
  
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (attempt < config.maxRetries) {
        await sleep(delay)
        delay = Math.min(delay * config.backoffMultiplier, config.maxDelay)
      }
    }
  }
  
  throw new MaxRetriesExceededError(lastError)
}
```

**Payment Processing:**
- Single retry for transient network errors
- No automatic retry for declined cards
- Notify customer immediately on failure
- Log all payment attempts for reconciliation

### Idempotency Implementation

**Idempotency Keys:**
- Generate unique keys for invoice and contact creation
- Store keys in database with operation result
- Check for existing key before executing operation
- Return cached result if key exists

```typescript
interface IdempotentOperation<T> {
  key: string
  operation: () => Promise<T>
  ttl: number // seconds
}

async function executeIdempotent<T>(
  op: IdempotentOperation<T>
): Promise<T> {
  // Check cache/database for existing result
  const cached = await getIdempotencyResult(op.key)
  if (cached) {
    return cached.result
  }
  
  // Execute operation
  const result = await op.operation()
  
  // Store result with key
  await storeIdempotencyResult(op.key, result, op.ttl)
  
  return result
}
```

### Concurrency Control

**Optimistic Locking:**
- Use version numbers on enrolment and class records
- Detect concurrent modifications
- Retry with fresh data on conflict

**Pessimistic Locking:**
- Lock class records during capacity checks
- Prevent race conditions on enrolment
- Release locks promptly to avoid deadlocks

```sql
-- Pessimistic lock for capacity check
BEGIN TRANSACTION;

SELECT enrolled_count, capacity 
FROM class 
WHERE id = $1 
FOR UPDATE;

-- Check capacity
IF enrolled_count < capacity THEN
  INSERT INTO enrolment (...);
  UPDATE class SET enrolled_count = enrolled_count + 1 WHERE id = $1;
END IF;

COMMIT;
```

## Testing Strategy

### Dual Testing Approach

The Dance School Management Platform requires both unit testing and property-based testing for comprehensive coverage:

**Unit Tests:**
- Specific examples demonstrating correct behavior
- Edge cases (empty inputs, boundary values, null handling)
- Error conditions and exception handling
- Integration points between components
- Mock external services (Xero, payment gateway)

**Property-Based Tests:**
- Universal properties across all inputs
- Randomized test data generation
- Comprehensive input coverage (100+ iterations per property)
- Validation of invariants and business rules
- Each property test references its design document property

### Property-Based Testing Configuration

**Framework Selection:**
- **TypeScript/JavaScript**: fast-check
- **Python**: Hypothesis
- **Java**: jqwik or QuickCheck
- **Other languages**: Use established PBT library

**Test Configuration:**
```typescript
// Example using fast-check
import fc from 'fast-check'

describe('Fee Engine Properties', () => {
  it('Property 15: Per-Class Pricing Calculation', () => {
    // Feature: dance-school-management-platform
    // Property 15: For any number of classes N with per-class pricing rule,
    // the monthly fee should equal N × per-class rate
    
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }), // number of classes
        fc.float({ min: 10, max: 200 }), // per-class rate
        (classCount, perClassRate) => {
          const rule: PricingRule = {
            type: PricingRuleType.PER_CLASS,
            monthlyFee: perClassRate,
            // ... other fields
          }
          
          const result = feeEngine.calculateFees({
            enrolments: generateEnrolments(classCount),
            pricingRule: rule,
            // ... other params
          })
          
          const expected = classCount * perClassRate
          expect(result.subtotal).toBeCloseTo(expected, 2)
        }
      ),
      { numRuns: 100 } // minimum 100 iterations
    )
  })
})
```

**Property Test Tags:**
Each property test must include a comment tag:
```typescript
// Feature: dance-school-management-platform, Property 15: Per-Class Pricing Calculation
```

### Test Data Generators

**Custom Generators for Domain Objects:**
```typescript
// Generator for valid customer data
const customerArbitrary = fc.record({
  email: fc.emailAddress(),
  name: fc.fullName(),
  mobile: fc.phoneNumber(),
  password: fc.string({ minLength: 8 })
})

// Generator for valid class data
const classArbitrary = fc.record({
  name: fc.string({ minLength: 3 }),
  capacity: fc.integer({ min: 5, max: 30 }),
  dayOfWeek: fc.constantFrom('Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'),
  startTime: fc.time(),
  duration: fc.constantFrom(30, 45, 60, 90)
})

// Generator for enrolment scenarios
const enrolmentScenarioArbitrary = fc.record({
  household: fc.array(dancerArbitrary, { minLength: 1, maxLength: 4 }),
  classes: fc.array(classArbitrary, { minLength: 1, maxLength: 10 }),
  startDate: fc.date()
})
```

### Unit Test Examples

**Authentication Tests:**
```typescript
describe('AuthService', () => {
  it('should create account with valid credentials', async () => {
    const result = await authService.register('test@example.com', 'SecurePass123!')
    expect(result.email).toBe('test@example.com')
    expect(result.id).toBeDefined()
  })
  
  it('should reject weak passwords', async () => {
    await expect(
      authService.register('test@example.com', '123')
    ).rejects.toThrow('Password does not meet strength requirements')
  })
  
  it('should reject duplicate email addresses', async () => {
    await authService.register('test@example.com', 'SecurePass123!')
    await expect(
      authService.register('test@example.com', 'AnotherPass456!')
    ).rejects.toThrow('Email already registered')
  })
})
```

**Fee Engine Tests:**
```typescript
describe('FeeEngine', () => {
  it('should calculate single class fee correctly', async () => {
    const result = await feeEngine.calculateFees({
      enrolments: [{ classId: 'class1' }],
      pricingRule: { type: 'PER_CLASS', monthlyFee: 50 }
    })
    expect(result.subtotal).toBe(50)
    expect(result.gst).toBe(5)
    expect(result.total).toBe(55)
  })
  
  it('should apply family discount for multiple dancers', async () => {
    const result = await feeEngine.calculateFees({
      enrolments: [
        { dancerId: 'dancer1', classId: 'class1' },
        { dancerId: 'dancer2', classId: 'class2' }
      ],
      householdId: 'household1',
      discounts: [{ type: 'FAMILY', value: 10 }] // 10% off
    })
    expect(result.discounts[0].amount).toBe(5) // 10% of 50
  })
  
  it('should handle proration for mid-cycle start', async () => {
    const startDate = new Date('2024-01-15') // mid-month
    const result = await feeEngine.calculateProration(100, startDate, 'MONTHLY')
    // Expect roughly half the monthly fee
    expect(result).toBeGreaterThan(45)
    expect(result).toBeLessThan(55)
  })
})
```

**Capacity Enforcement Tests:**
```typescript
describe('EnrolmentService', () => {
  it('should prevent enrolment when class is full', async () => {
    const classData = await createClass({ capacity: 2 })
    await createEnrolment({ classId: classData.id, dancerId: 'dancer1' })
    await createEnrolment({ classId: classData.id, dancerId: 'dancer2' })
    
    await expect(
      enrolmentService.createEnrolment({
        classId: classData.id,
        dancerId: 'dancer3'
      })
    ).rejects.toThrow('Class is at full capacity')
  })
  
  it('should offer waitlist when class is full', async () => {
    const classData = await createClass({ capacity: 1 })
    await createEnrolment({ classId: classData.id, dancerId: 'dancer1' })
    
    const result = await enrolmentService.createEnrolment({
      classId: classData.id,
      dancerId: 'dancer2'
    })
    
    expect(result.waitlistEntry).toBeDefined()
    expect(result.waitlistEntry.position).toBe(1)
  })
})
```

### Integration Tests

**Xero Integration Tests:**
```typescript
describe('XeroSyncService Integration', () => {
  it('should create contact in Xero for new customer', async () => {
    const customer = await createCustomer({
      email: 'test@example.com',
      name: 'Test Customer'
    })
    
    const result = await xeroSyncService.syncContact(customer.id)
    
    expect(result.success).toBe(true)
    expect(result.xeroId).toBeDefined()
    
    // Verify in Xero
    const xeroContact = await xeroApi.getContact(result.xeroId)
    expect(xeroContact.emailAddress).toBe('test@example.com')
  })
  
  it('should handle Xero API failures gracefully', async () => {
    // Mock Xero API to return error
    mockXeroApi.createContact.mockRejectedValue(new Error('API Error'))
    
    const customer = await createCustomer({ email: 'test@example.com' })
    const result = await xeroSyncService.syncContact(customer.id)
    
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    
    // Verify error logged
    const syncLog = await getSyncLog(result.syncLogId)
    expect(syncLog.retryCount).toBe(0)
    expect(syncLog.errorMessage).toContain('API Error')
  })
})
```

### Test Coverage Goals

**Minimum Coverage Targets:**
- Overall code coverage: 80%
- Critical paths (fee calculation, payment, enrolment): 95%
- Property-based tests: All 46 properties implemented
- Integration tests: All external service interactions

**Coverage Exclusions:**
- Generated code (Prisma client, GraphQL resolvers)
- Configuration files
- Type definitions without logic

### Continuous Integration

**CI Pipeline:**
1. Run unit tests on every commit
2. Run property-based tests (100 iterations) on every PR
3. Run integration tests on staging environment
4. Generate coverage reports
5. Block merge if coverage drops below threshold
6. Run extended property tests (1000 iterations) nightly

**Test Execution Time:**
- Unit tests: < 2 minutes
- Property tests: < 5 minutes
- Integration tests: < 10 minutes
- Total CI pipeline: < 20 minutes



## API Design

### REST API Structure

The API follows RESTful principles with resource-based URLs and standard HTTP methods.

**Base URL:** `https://api.danceschool.example.com/v1`

**Authentication:**
- JWT tokens in Authorization header: `Authorization: Bearer <token>`
- Token expiry: 1 hour (access token), 30 days (refresh token)
- Refresh endpoint: `POST /auth/refresh`

**Response Format:**
```typescript
interface APIResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: Record<string, string[]>
  }
  meta?: {
    page?: number
    pageSize?: number
    total?: number
  }
}
```

### Core API Endpoints

**Authentication:**
```
POST   /auth/register          - Register new customer account
POST   /auth/login             - Login with credentials
POST   /auth/refresh           - Refresh access token
POST   /auth/logout            - Logout and invalidate tokens
POST   /auth/reset-password    - Request password reset
PUT    /auth/password          - Change password
POST   /auth/mfa/enable        - Enable MFA
POST   /auth/mfa/verify        - Verify MFA code
```

**Customers:**
```
GET    /customers/me           - Get current customer profile
PUT    /customers/me           - Update customer profile
GET    /customers/me/dancers   - List dancers in household
POST   /customers/me/dancers   - Add dancer to household
PUT    /customers/me/dancers/:id - Update dancer profile
DELETE /customers/me/dancers/:id - Remove dancer
```

**Classes:**
```
GET    /classes                - List all classes (with filters)
GET    /classes/:id            - Get class details
GET    /classes/:id/capacity   - Get capacity information
GET    /classes/:id/waitlist   - Get waitlist for class
```

**Enrolments:**
```
GET    /enrolments             - List customer's enrolments
POST   /enrolments             - Create enrolment(s)
GET    /enrolments/:id         - Get enrolment details
PUT    /enrolments/:id         - Update enrolment
DELETE /enrolments/:id         - Cancel enrolment
POST   /enrolments/bulk        - Create multiple enrolments
```

**Fees:**
```
POST   /fees/calculate         - Calculate fees for enrolment selection
GET    /fees/pricing-rules     - Get active pricing rules
GET    /fees/discounts         - Get available discounts
```

**Payments:**
```
GET    /payments               - List customer's payments
POST   /payments               - Create payment
GET    /payments/:id           - Get payment details
POST   /payments/:id/refund    - Request refund
GET    /payments/:id/receipt   - Get payment receipt
```

**Invoices:**
```
GET    /invoices               - List customer's invoices
GET    /invoices/:id           - Get invoice details
GET    /invoices/:id/pdf       - Download invoice PDF
```

**Waitlist:**
```
POST   /waitlist               - Join waitlist
DELETE /waitlist/:id           - Leave waitlist
POST   /waitlist/:id/accept    - Accept waitlist offer
```

**Teacher Portal:**
```
GET    /teacher/classes        - List teacher's classes
GET    /teacher/classes/:id/roll - Get class roll
POST   /teacher/attendance     - Mark attendance
GET    /teacher/attendance/:classId - Get attendance records
```

**Admin - Classes:**
```
POST   /admin/classes          - Create class
PUT    /admin/classes/:id      - Update class
DELETE /admin/classes/:id      - Delete class
GET    /admin/classes/:id/enrolments - List class enrolments
POST   /admin/classes/:id/substitute - Assign substitute teacher
```

**Admin - Enrolments:**
```
GET    /admin/enrolments       - List all enrolments
PUT    /admin/enrolments/:id/move - Move enrolment to different class
PUT    /admin/enrolments/:id/cancel - Cancel enrolment
```

**Admin - Users:**
```
GET    /admin/users            - List all users
POST   /admin/users/teacher    - Create teacher account
PUT    /admin/users/:id        - Update user
DELETE /admin/users/:id        - Delete user
```

**Admin - Configuration:**
```
GET    /admin/config/pricing   - Get pricing rules
POST   /admin/config/pricing   - Create pricing rule
PUT    /admin/config/pricing/:id - Update pricing rule
DELETE /admin/config/pricing/:id - Delete pricing rule

GET    /admin/config/discounts - Get discount rules
POST   /admin/config/discounts - Create discount rule
PUT    /admin/config/discounts/:id - Update discount rule

GET    /admin/config/xero      - Get Xero configuration
PUT    /admin/config/xero      - Update Xero configuration
POST   /admin/config/xero/test - Test Xero connection

GET    /admin/config/templates - Get notification templates
PUT    /admin/config/templates/:id - Update template
```

**Admin - Reporting:**
```
GET    /admin/reports/enrolments - Enrolment report
GET    /admin/reports/revenue    - Revenue report
GET    /admin/reports/capacity   - Capacity report
GET    /admin/reports/outstanding - Outstanding payments report
GET    /admin/reports/churn      - Churn report
POST   /admin/reports/export     - Export report to CSV
```

**Admin - Xero Sync:**
```
GET    /admin/xero/status      - Get sync status
GET    /admin/xero/errors      - List sync errors
POST   /admin/xero/retry/:id   - Retry failed sync
POST   /admin/xero/sync-all    - Trigger full sync
```

**Admin - Locations:**
```
GET    /admin/locations        - List locations
POST   /admin/locations        - Create location
PUT    /admin/locations/:id    - Update location
DELETE /admin/locations/:id    - Delete location
```

**Admin - Merchandise:**
```
GET    /admin/merchandise      - List merchandise items
POST   /admin/merchandise      - Create item
PUT    /admin/merchandise/:id  - Update item
DELETE /admin/merchandise/:id  - Delete item
```

### API Rate Limiting

**Rate Limits:**
- Public endpoints: 100 requests/minute per IP
- Authenticated endpoints: 1000 requests/minute per user
- Admin endpoints: 5000 requests/minute per admin
- Xero sync operations: 60 requests/minute (Xero API limit)

**Rate Limit Headers:**
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640000000
```

**Rate Limit Response:**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again later.",
    "details": {
      "retryAfter": 60
    }
  }
}
```

### Pagination

**Query Parameters:**
```
?page=1&pageSize=50&sortBy=createdAt&sortOrder=desc
```

**Response Meta:**
```json
{
  "success": true,
  "data": [...],
  "meta": {
    "page": 1,
    "pageSize": 50,
    "total": 250,
    "totalPages": 5
  }
}
```

### Filtering and Search

**Filter Syntax:**
```
GET /classes?style=ballet&level=intermediate&dayOfWeek=Mon&locationId=loc123
GET /enrolments?status=active&dancerId=dancer456
GET /invoices?status=overdue&dueDate[gte]=2024-01-01
```

**Search:**
```
GET /classes?search=beginner+ballet
GET /admin/users?search=john@example.com
```

## Deployment Considerations

### Infrastructure Requirements

**Compute:**
- API servers: 2+ instances for high availability
- Background workers: 2+ instances for job processing
- Load balancer: Application Load Balancer with health checks
- Auto-scaling: Scale based on CPU (>70%) and request rate

**Database:**
- PostgreSQL 14+ with read replicas
- Connection pooling (PgBouncer)
- Automated backups (daily, 30-day retention)
- Point-in-time recovery enabled

**Caching:**
- Redis cluster for session storage and caching
- Cache timetable data (5-minute TTL)
- Cache pricing rules (1-hour TTL)
- Cache user permissions (15-minute TTL)

**Storage:**
- S3 or equivalent for file storage (receipts, exports)
- CloudFront CDN for static assets
- Backup storage for database dumps

### Environment Configuration

**Environment Variables:**
```bash
# Application
NODE_ENV=production
PORT=3000
API_BASE_URL=https://api.danceschool.example.com
WEB_BASE_URL=https://danceschool.example.com

# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname
DATABASE_POOL_SIZE=20
DATABASE_SSL=true

# Redis
REDIS_URL=redis://host:6379
REDIS_PASSWORD=secret

# Authentication
JWT_SECRET=secret-key
JWT_EXPIRY=3600
REFRESH_TOKEN_EXPIRY=2592000

# Xero
XERO_CLIENT_ID=client-id
XERO_CLIENT_SECRET=secret
XERO_REDIRECT_URI=https://api.danceschool.example.com/auth/xero/callback
XERO_SCOPES=accounting.transactions,accounting.contacts

# Payment Gateway (Stripe)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Email
EMAIL_PROVIDER=sendgrid
EMAIL_API_KEY=api-key
EMAIL_FROM=noreply@danceschool.example.com

# SMS (Optional)
SMS_PROVIDER=twilio
SMS_ACCOUNT_SID=account-sid
SMS_AUTH_TOKEN=auth-token
SMS_FROM_NUMBER=+61400000000

# Monitoring
SENTRY_DSN=https://...
LOG_LEVEL=info
```

### Security Hardening

**Application Security:**
- HTTPS only (TLS 1.2+)
- HSTS headers enabled
- CORS configured for known origins
- Rate limiting on all endpoints
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding)
- CSRF protection for state-changing operations

**Database Security:**
- Encrypted connections (SSL/TLS)
- Encrypted at rest
- Least-privilege database users
- Regular security patches
- Network isolation (private subnet)

**Secrets Management:**
- AWS Secrets Manager or HashiCorp Vault
- Rotate secrets regularly
- Never commit secrets to version control
- Environment-specific secrets

**Audit Logging:**
- Log all admin actions
- Log authentication events
- Log payment transactions
- Log Xero sync operations
- Retain logs for 12 months

### Monitoring and Alerting

**Application Monitoring:**
- APM tool (New Relic, Datadog, or similar)
- Error tracking (Sentry)
- Performance metrics (response times, throughput)
- Custom business metrics (enrolments/day, revenue/day)

**Infrastructure Monitoring:**
- Server health checks
- Database performance metrics
- Redis memory usage
- Disk space monitoring
- Network latency

**Alerts:**
- API error rate > 5%
- Response time > 1 second (p95)
- Database connection pool exhausted
- Xero sync failures > 10
- Payment processing failures
- Disk space < 20%
- Memory usage > 85%

**Dashboards:**
- Real-time system health
- Business metrics (enrolments, revenue)
- Xero sync status
- Payment processing status
- User activity

### Backup and Disaster Recovery

**Database Backups:**
- Automated daily backups
- 30-day retention
- Point-in-time recovery (7 days)
- Cross-region backup replication
- Regular restore testing (monthly)

**Application Backups:**
- Infrastructure as Code (Terraform/CloudFormation)
- Configuration in version control
- Automated deployment pipelines

**Disaster Recovery Plan:**
- RTO (Recovery Time Objective): 4 hours
- RPO (Recovery Point Objective): 1 hour
- Documented recovery procedures
- Regular DR drills (quarterly)
- Failover to secondary region capability

### Performance Optimization

**Database Optimization:**
- Proper indexing (see Data Models section)
- Query optimization (EXPLAIN ANALYZE)
- Connection pooling
- Read replicas for reporting queries
- Materialized views for complex reports

**Caching Strategy:**
- Cache timetable data (frequently accessed)
- Cache pricing rules (rarely changed)
- Cache user sessions
- Invalidate cache on updates
- Use Redis for distributed caching

**API Optimization:**
- Response compression (gzip)
- Pagination for large result sets
- Field selection (sparse fieldsets)
- Batch endpoints for bulk operations
- CDN for static assets

**Background Jobs:**
- Queue Xero sync operations
- Queue email notifications
- Queue report generation
- Process jobs asynchronously
- Monitor queue depth

### Scalability Considerations

**Horizontal Scaling:**
- Stateless API servers (scale horizontally)
- Load balancer distributes traffic
- Session storage in Redis (shared state)
- Database read replicas for read-heavy operations

**Vertical Scaling:**
- Database instance size based on load
- Redis instance size based on cache needs
- Worker instance size based on job volume

**Database Sharding (Future):**
- Shard by location for multi-location deployments
- Shard by household for very large deployments
- Cross-shard queries via application layer

### Compliance and Data Privacy

**GDPR/Privacy Compliance:**
- Data minimization (collect only necessary data)
- Right to access (customer data export)
- Right to erasure (account deletion)
- Data portability (export in standard format)
- Privacy policy and terms of service
- Cookie consent management

**Australian Privacy Principles:**
- Comply with Privacy Act 1988
- Secure storage of personal information
- Transparent data handling practices
- Consent for data collection and use

**PCI DSS Compliance:**
- Never store full card numbers
- Use PCI-compliant payment gateway (Stripe)
- Tokenize payment methods
- Secure transmission of payment data
- Regular security audits

**Data Retention:**
- Active customer data: indefinite
- Cancelled enrolments: 7 years (tax purposes)
- Payment records: 7 years (tax purposes)
- Audit logs: 12 months
- Deleted accounts: 30-day soft delete, then permanent

## Implementation Phases

### Phase 1: Core Platform (MVP)
**Duration: 8-10 weeks**

**Features:**
- User registration and authentication
- Customer and dancer profile management
- Class management (admin)
- Timetable browsing and filtering
- Basic enrolment flow (single dancer, single class)
- Simple fee calculation (per-class pricing)
- Payment processing (Stripe integration)
- Basic Xero integration (contacts and invoices)
- Teacher portal (view classes and rolls)
- Admin portal (basic class and enrolment management)

**Success Criteria:**
- Customer can register, add dancer, enrol in class, and pay
- Teacher can view assigned classes and student lists
- Admin can create classes and manage enrolments
- Invoices created in Xero automatically

### Phase 2: Advanced Features
**Duration: 6-8 weeks**

**Features:**
- Multi-dancer enrolment flow
- Tiered pricing and family discounts
- Proration for mid-cycle enrolments
- Waitlist management
- Trial class bookings
- Attendance tracking
- Automated notifications (payment confirmations, reminders)
- Enhanced reporting (enrolments, revenue, capacity)
- Xero payment reconciliation
- Cancellation and refund policies

**Success Criteria:**
- Family can enrol multiple children with discounts
- Waitlist automatically offers spots when available
- Teachers can mark attendance
- Automated emails sent for key events
- Full Xero sync including payments

### Phase 3: Operations and Scale
**Duration: 4-6 weeks**

**Features:**
- Multi-location support
- Studio room scheduling and conflict detection
- Merchandise and uniform sales
- Term-based enrolment option
- Communication template customization
- Advanced reporting and analytics
- Performance monitoring dashboard
- Bulk operations (bulk enrolment, bulk cancellation)
- Make-up class credits
- Substitute teacher management

**Success Criteria:**
- Support multiple studio locations
- Prevent scheduling conflicts automatically
- Sell merchandise alongside enrolments
- Comprehensive admin reporting
- System performance meets SLAs

### Phase 4: Polish and Optimization
**Duration: 2-4 weeks**

**Features:**
- Mobile app (optional)
- Enhanced accessibility features
- Performance optimization
- Security hardening
- Comprehensive documentation
- User training materials
- Advanced analytics and insights
- Integration with marketing tools (Mailchimp, etc.)
- SMS notifications (optional)
- QR code check-in (optional)

**Success Criteria:**
- WCAG 2.1 AA compliance
- Sub-300ms page loads
- Security audit passed
- User documentation complete
- Training materials available

## Future Enhancements

**Advanced Features:**
- Mobile apps (iOS/Android)
- Student progress tracking and assessments
- Video library for online classes
- Recital and event management
- Costume and prop inventory
- Staff scheduling and payroll integration
- Customer loyalty program
- Referral program with rewards
- Advanced analytics and business intelligence
- AI-powered class recommendations
- Automated marketing campaigns
- Integration with accounting software beyond Xero (QuickBooks, MYOB)

**Technical Improvements:**
- GraphQL API option
- Real-time updates via WebSockets
- Offline mode for mobile apps
- Advanced caching strategies
- Machine learning for demand forecasting
- Predictive analytics for churn prevention

## Conclusion

The Dance School Management Platform design provides a comprehensive, scalable solution for dance school operations. The architecture prioritizes automation, reliability, and flexibility while maintaining security and data integrity. The phased implementation approach allows for iterative delivery of value, starting with core functionality and progressively adding advanced features.

Key design decisions:
- **API-first architecture** enables future mobile apps and integrations
- **Property-based testing** ensures correctness across all scenarios
- **Idempotent operations** prevent billing errors and duplicate data
- **Background job processing** handles Xero sync and notifications reliably
- **Configurable pricing engine** adapts to different business models
- **Role-based access control** protects sensitive information
- **Comprehensive error handling** ensures graceful degradation

The design addresses all 30 requirements with 46 testable correctness properties, providing a solid foundation for implementation and long-term maintenance.
