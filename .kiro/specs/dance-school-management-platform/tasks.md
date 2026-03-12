# Implementation Plan: Dance School Management Platform

## Overview

This implementation plan breaks down the Dance School Management Platform into discrete, incremental coding tasks. The plan follows a phased approach, starting with core infrastructure and authentication, then building out the main features (enrolment, payments, Xero integration), and finally adding advanced features. Each task builds on previous work, with regular checkpoints to ensure quality and gather feedback.

The implementation uses TypeScript with Node.js for the backend API, React for the frontend, PostgreSQL for the database, and Redis for caching. All tasks include references to specific requirements they implement.

## Tasks

- [x] 1. Project setup and infrastructure
  - Initialize TypeScript Node.js project with Express
  - Set up PostgreSQL database with Prisma ORM
  - Configure Redis for caching and sessions
  - Set up environment configuration
  - Create Docker Compose for local development
  - Set up testing framework (Jest) and property-based testing (fast-check)
  - Configure ESLint and Prettier
  - _Requirements: Foundation for all requirements_

- [x] 2. Database schema and migrations
  - [x] 2.1 Create core entity schemas
    - Define Prisma schema for UserAccount, Customer, Household, Dancer, Teacher
    - Define schema for Location, Class, Enrolment, PricingRule, DiscountRule
    - Define schema for Invoice, Payment, XeroContact, XeroInvoice
    - Define schema for WaitlistEntry, AttendanceRecord, SyncLog, NotificationLog, AuditLog
    - _Requirements: 1.1, 1.3, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1, 8.1, 9.1, 10.1, 11.1, 12.1, 15.1, 17.1, 18.6, 28.1_
  
  - [x] 2.2 Write property test for schema integrity
    - **Property 38: Referential Integrity**
    - **Validates: Requirements 19.6**
  
  - [x] 2.3 Create database indexes
    - Implement all indexes from design document
    - Add composite indexes for common query patterns
    - _Requirements: 3.5, 3.6 (performance)_


- [-] 3. Authentication service
  - [x] 3.1 Implement user registration
    - Create registration endpoint with email/password validation
    - Implement password hashing with bcrypt
    - Generate JWT tokens
    - _Requirements: 1.1, 1.7, 18.1_
  
  - [x] 3.2 Write property tests for authentication
    - **Property 1: Account Creation Uniqueness**
    - **Property 4: Password Strength Enforcement**
    - **Property 34: Password Hashing**
    - **Validates: Requirements 1.1, 1.7, 18.1**
  
  - [x] 3.3 Implement login and token management
    - Create login endpoint
    - Implement JWT token generation and validation
    - Create refresh token endpoint
    - _Requirements: 1.2_
  
  - [x] 3.4 Write property test for authentication round trip
    - **Property 2: Authentication Round Trip**
    - **Validates: Requirements 1.2**
  
  - [x] 3.5 Implement password reset flow
    - Create password reset request endpoint
    - Generate secure reset tokens
    - Create password change endpoint
    - _Requirements: 1.1_
  
  - [x] 3.6 Implement MFA support (optional)
    - Add MFA enable/disable endpoints
    - Implement TOTP verification
    - _Requirements: 1.8, 18.7_

- [x] 4. Authorization and RBAC
  - [x] 4.1 Implement role-based middleware
    - Create authorization middleware for role checking
    - Implement resource-level permission checks
    - _Requirements: 2.1, 2.2_
  
  - [x] 4.2 Write property tests for access control
    - **Property 5: Role-Based Access Control**
    - **Property 7: Teacher Access Restrictions**
    - **Validates: Requirements 2.2, 2.7**
  
  - [x] 4.3 Implement teacher-specific access controls
    - Restrict teacher views to assigned classes only
    - Implement configurable student information access
    - _Requirements: 2.3, 2.4, 7.7_
  
  - [x] 4.4 Write property test for teacher class visibility
    - **Property 6: Teacher Class Visibility**
    - **Validates: Requirements 2.3**

- [x] 5. User service
  - [x] 5.1 Implement customer profile management
    - Create customer profile CRUD endpoints
    - Implement househo ld management
    - _Requirements: 1.3, 1.6 _
  
  - [x] 5.2 Write property test for profile updates
    - **Property 3: Profile Update Persistence**
    - **Validates: Requirements 1.6**
  
  - [x] 5.3 Implement dancer profile management
    - Create dancer profile CRUD endpoints
    - Validate required fields (name, DOB, emergency contact)
    - Handle optional fields (medical notes, allergies, photo consent)
    - _Requirements: 1.4, 1.5_
  
  - [x] 5.4 Implement teacher profile management
    - Create teacher account creation (admin only)
    - Implement teacher profile CRUD
    - _Requirements: 2.5, 7.1_

- [x] 6. Checkpoint - Core authentication and user management
  - Ensure all tests pass, ask the user if questions arise.


- [x] 7. Class service
  - [x] 7.1 Implement class CRUD operations
    - Create class creation endpoint with validation
    - Implement class update and delete endpoints
    - Validate required fields (name, style, level, time, location, capacity, teacher)
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 7.2 Write property test for class updates
    - **Property 8: Class Display Completeness**
    - **Validates: Requirements 3.3, 8.3**
  
  - [x] 7.3 Implement scheduling conflict detection
    - Validate room availability at specified time
    - Validate teacher availability at specified time
    - Prevent double-booking
    - _Requirements: 24.1, 24.2_
  
  - [x] 7.4 Write property tests for scheduling conflicts
    - **Property 41: Room Scheduling Conflicts**
    - **Property 42: Teacher Scheduling Conflicts**
    - **Validates: Requirements 24.1, 24.2**
  
  - [x] 7.5 Implement class deletion protection
    - Prevent deletion of classes with active enrolments
    - _Requirements: 8.4_

- [x] 8. Timetable service
  - [x] 8.1 Implement timetable query endpoint
    - Create endpoint to list all active classes
    - Support week grid and list view formats
    - Implement caching for performance
    - _Requirements: 3.1, 3.5_
  
  - [x] 8.2 Implement timetable filtering
    - Add filters for age group, level, style, location, teacher, day
    - Optimize queries with proper indexes
    - _Requirements: 3.2_
  
  - [x] 8.3 Write property tests for filtering
    - **Property 8: Timetable Filter Correctness**
    - **Property 46: Location Filtering**
    - **Validates: Requirements 3.2, 28.3**
  
  - [x] 8.4 Implement capacity display
    - Calculate and display remaining capacity
    - Show "full" indicator when at capacity
    - _Requirements: 3.3, 3.4_

- [x] 9. Fee engine
  - [x] 9.1 Implement pricing rule management
    - Create pricing rule CRUD endpoints
    - Support per-class, tiered bundle, and term-based pricing
    - Implement rule priority and activation
    - _Requirements: 5.1, 5.2, 5.5, 22.2_
  
  - [x] 9.2 Implement discount rule management
    - Create discount rule CRUD endpoints
    - Support percentage, fixed amount, family, and concession discounts
    - _Requirements: 5.3, 5.4, 22.3_
  
  - [x] 9.3 Implement fee calculation engine
    - Calculate base fees using pricing rules
    - Apply discounts based on eligibility
    - Calculate GST (10%)
    - Handle one-time fees
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.7, 5.8_
  
  - [x] 9.4 Write property tests for fee calculations
    - **Property 10: Fee Calculation Determinism**
    - **Property 15: Per-Class Pricing Calculation**
    - **Property 16: Tiered Bundle Pricing**
    - **Property 17: Family Discount Application**
    - **Property 19: GST Calculation**
    - **Validates: Requirements 4.2, 5.1, 5.2, 5.3, 5.7**
  
  - [x] 9.5 Implement proration calculation
    - Calculate prorated fees for mid-cycle starts
    - Support configurable billing cycles
    - _Requirements: 5.6_
  
  - [x] 9.6 Write property test for proration
    - **Property 18: Proration Calculation**
    - **Validates: Requirements 5.6**
  
  - [x] 9.7 Implement configuration immediate effect
    - Ensure pricing rule changes apply immediately
    - Invalidate relevant caches on update
    - _Requirements: 22.6_
  
  - [x] 9.8 Write property test for configuration updates
    - **Property 40: Configuration Immediate Effect**
    - **Validates: Requirements 22.6**

- [x] 10. Checkpoint - Classes and fee engine
  - Ensure all tests pass, ask the user if questions arise.


- [x] 11. Enrolment service
  - [x] 11.1 Implement enrolment creation with capacity enforcement
    - Create enrolment endpoint with capacity checking
    - Implement pessimistic locking to prevent race conditions
    - Update class enrolled count atomically
    - _Requirements: 4.1, 4.4, 4.7, 19.5_
  
  - [x] 11.2 Write property tests for capacity enforcement
    - **Property 12: Capacity Enforcement**
    - **Property 13: Enrolment Count Invariant**
    - **Property 37: Concurrent Capacity Enforcement**
    - **Validates: Requirements 4.4, 4.7, 8.6, 19.5**
  
  - [x] 11.3 Implement bulk enrolment for families
    - Create bulk enrolment endpoint
    - Ensure atomic transaction (all or nothing)
    - Calculate family discounts
    - _Requirements: 4.1, 25.1, 25.4_
  
  - [x] 11.4 Write property test for bulk enrolment atomicity
    - **Property 43: Bulk Enrolment Atomicity**
    - **Validates: Requirements 25.4**
  
  - [x] 11.5 Implement enrolment cancellation
    - Create cancellation endpoint with effective date
    - Apply refund policy calculations
    - Update class capacity
    - Create audit log entry
    - _Requirements: 9.2, 9.3, 9.6, 26.2_
  
  - [x] 11.6 Write property tests for cancellation
    - **Property 14: Capacity Adjustment on Move**
    - **Property 44: Refund Calculation**
    - **Validates: Requirements 9.1, 26.2**
  
  - [x] 11.7 Implement enrolment move between classes
    - Create move endpoint
    - Update both class capacities atomically
    - _Requirements: 9.1_
  
  - [x] 11.8 Write property test for audit logging
    - **Property 39: Audit Log Completeness**
    - **Validates: Requirements 9.6**

- [x] 12. Waitlist service
  - [x] 12.1 Implement waitlist management
    - Create join waitlist endpoint
    - Assign sequential positions
    - Record timestamps
    - _Requirements: 15.1, 15.2_
  
  - [x] 12.2 Write property test for waitlist ordering
    - **Property 28: Waitlist Ordering**
    - **Validates: Requirements 15.2**
  
  - [x] 12.3 Implement waitlist offer processing
    - Offer spot to next customer when available
    - Generate timed acceptance links
    - Handle offer expiry and progression
    - _Requirements: 15.3, 15.4, 15.5_
  
  - [x] 12.4 Write property tests for waitlist queue
    - **Property 29: Waitlist Queue Processing**
    - **Property 30: Waitlist Progression**
    - **Validates: Requirements 15.3, 15.5**

- [x] 13. Trial booking service
  - [x] 13.1 Implement trial booking
    - Create trial booking endpoint
    - Apply trial pricing rules
    - Create single-session enrolment with isTrial flag
    - Enforce trial limits per dancer/class
    - _Requirements: 16.1, 16.2, 16.5_
  
  - [x] 13.2 Write property tests for trial bookings
    - **Property 31: Trial Enrolment Creation**
    - **Property 32: Trial Booking Limits**
    - **Validates: Requirements 16.2, 16.5**
  
  - [x] 13.3 Implement trial conversion
    - Create conversion endpoint
    - Update enrolment status from trial to active
    - Track conversion metrics
    - _Requirements: 16.3, 16.4_

- [x] 14. Checkpoint - Enrolment and waitlist
  - Ensure all tests pass, ask the user if questions arise.


- [x] 15. Payment service
  - [x] 15.1 Integrate Stripe payment gateway
    - Set up Stripe SDK
    - Implement payment intent creation
    - Handle webhook events
    - _Requirements: 6.2_
  
  - [x] 15.2 Implement payment processing
    - Create payment endpoint
    - Display fee breakdown at checkout
    - Process payment via Stripe
    - Create payment record with status
    - _Requirements: 6.1, 6.3_
  
  - [x] 15.3 Write property tests for payment status
    - **Property 21: Payment Status Consistency**
    - **Property 22: Payment State Machine**
    - **Validates: Requirements 6.3, 6.7**
  
  - [x] 15.4 Implement receipt generation
    - Generate PDF receipts
    - Send receipt emails automatically
    - _Requirements: 6.4_
  
  - [x] 15.5 Implement subscription payments (optional)
    - Create subscription setup endpoint
    - Store payment methods securely (tokenized)
    - Handle recurring charges
    - _Requirements: 6.6, 18.3_
  
  - [x] 15.6 Write property test for card security
    - **Property 35: Card Number Security**
    - **Validates: Requirements 18.3**
  
  - [x] 15.7 Implement refund processing
    - Create refund endpoint
    - Process refunds via Stripe
    - Update payment status
    - _Requirements: 9.3, 26.3_

- [x] 16. Invoice service
  - [x] 16.1 Implement invoice generation
    - Create invoice on enrolment confirmation
    - Generate line items with descriptions
    - Calculate totals with GST
    - Use idempotency keys
    - _Requirements: 11.1, 19.1, 19.4_
  
  - [x] 16.2 Write property tests for invoices
    - **Property 20: Invoice Total Integrity**
    - **Property 36: Invoice Generation Idempotency**
    - **Validates: Requirements 19.1, 19.4**
  
  - [x] 16.3 Implement invoice status management
    - Track invoice statuses (Due, Paid, Overdue, Failed)
    - Update status on payment
    - Send overdue notifications
    - _Requirements: 6.7, 6.8_

- [x] 17. Xero integration service
  - [x] 17.1 Set up Xero OAuth 2.0
    - Implement OAuth flow
    - Store and refresh access tokens securely
    - _Requirements: 10.5, 18.4_
  
  - [x] 17.2 Implement contact synchronization
    - Create or match Xero contacts by email
    - Sync customer profile updates
    - Use idempotency to prevent duplicates
    - _Requirements: 10.1, 10.2, 10.4, 10.6_
  
  - [x] 17.3 Write property tests for contact sync
    - **Property 23: Contact Sync Idempotency**
    - **Property 24: Contact Email Uniqueness**
    - **Validates: Requirements 10.1, 10.4, 10.6**
  
  - [x] 17.4 Implement invoice synchronization
    - Create invoices in Xero with line items
    - Apply configured account codes and tax rates
    - Apply tracking categories
    - Use idempotency keys
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_
  
  - [x] 17.5 Write property test for invoice sync
    - **Property 25: Invoice Generation Idempotency**
    - **Validates: Requirements 11.1, 11.5**
  
  - [x] 17.6 Implement payment reconciliation
    - Mark Xero invoices as paid
    - Create payment records in Xero
    - Handle partial payments
    - _Requirements: 12.1, 12.2, 12.4_
  
  - [x] 17.7 Write property tests for payment reconciliation
    - **Property 26: Payment Reconciliation**
    - **Property 27: Partial Payment Recording**
    - **Validates: Requirements 12.1, 12.4**
  
  - [x] 17.8 Implement sync error handling and retry
    - Log sync errors to database
    - Implement exponential backoff retry
    - Create admin UI for viewing and retrying errors
    - _Requirements: 10.3, 11.6, 12.3, 12.6, 19.2, 19.3_

- [x] 18. Checkpoint - Payments and Xero integration
  - Ensure all tests pass, ask the user if questions arise.


- [x] 19. Teacher portal
  - [x] 19.1 Implement teacher dashboard
    - Create endpoint to list teacher's classes for current week
    - Display class information (time, location, level)
    - _Requirements: 7.1, 7.2_
  
  - [x] 19.2 Implement class roll viewing
    - Create endpoint to get enrolled students for a class
    - Apply access policy for sensitive information
    - Enforce teacher can only view assigned classes
    - _Requirements: 7.3, 7.4, 7.7_
  
  - [x] 19.3 Write property test for teacher class access
    - **Property 6: Teacher Class Visibility**
    - **Property 7: Teacher Access Restrictions**
    - **Validates: Requirements 2.3, 7.7**
  
  - [x] 19.4 Implement attendance marking
    - Create attendance marking endpoint
    - Record present/absent status with timestamp
    - Support private notes
    - _Requirements: 17.1, 17.2, 17.3_
  
  - [x] 19.5 Write property test for attendance records
    - **Property 33: Attendance Record Persistence**
    - **Validates: Requirements 17.2**
  
  - [x] 19.6 Implement class roll export
    - Create CSV export endpoint
    - Include student names and relevant information
    - _Requirements: 7.6_

- [x] 20. Admin portal - class management
  - [x] 20.1 Implement admin class CRUD UI endpoints
    - Create endpoints for class creation form
    - Implement class update and delete
    - Validate all required fields
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 20.2 Implement admin enrolment management
    - Create endpoints to view all enrolments
    - Implement move enrolment between classes
    - Implement cancel enrolment with refund calculation
    - _Requirements: 9.1, 9.2, 9.5_
  
  - [x] 20.3 Implement substitute teacher assignment
    - Create endpoint to assign substitute for specific date
    - Notify enrolled customers of change
    - _Requirements: 24.3_

- [x] 21. Admin portal - configuration
  - [x] 21.1 Implement pricing rule configuration UI
    - Create endpoints for pricing rule CRUD
    - Support per-class, tiered, and term-based rules
    - _Requirements: 22.1, 22.2_
  
  - [x] 21.2 Implement discount rule configuration
    - Create endpoints for discount rule CRUD
    - Support all discount types
    - _Requirements: 22.3_
  
  - [x] 21.3 Implement Xero configuration UI
    - Create endpoints for Xero settings
    - Test connection endpoint
    - Display sync status
    - _Requirements: 22.4, 30.1_
  
  - [x] 21.4 Implement notification template management
    - Create endpoints for template CRUD
    - Support variable substitution
    - Validate template syntax
    - _Requirements: 23.1, 23.2, 23.3, 23.4_

- [x] 22. Notification service
  - [x] 22.1 Set up email service integration
    - Integrate SendGrid or AWS SES
    - Create email sending service
    - _Requirements: 14.1_
  
  - [x] 22.2 Implement notification templates
    - Create default templates for all notification types
    - Implement variable substitution
    - _Requirements: 23.4_
  
  - [x] 22.3 Implement automated notifications
    - Send payment confirmation emails
    - Send payment reminder emails (configurable)
    - Send overdue notifications
    - Send term reminders
    - Send class change notifications
    - Log all notifications
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_
  
  - [x] 22.4 Implement background job queue
    - Set up Bull queue with Redis
    - Create job processors for notifications and Xero sync
    - Implement retry logic
    - _Requirements: 12.5, 19.2_

- [ ] 23. Checkpoint - Teacher portal and notifications
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 24. Reporting service
  - [x] 24.1 Implement enrolment reports
    - Create endpoint for active enrolments by class
    - Create endpoint for new enrolments this month
    - _Requirements: 13.1, 13.5_
  
  - [x] 24.2 Implement capacity reports
    - Create endpoint for capacity utilization by class
    - Calculate percentage filled
    - _Requirements: 13.2_
  
  - [x] 24.3 Implement revenue reports
    - Create endpoint for revenue by month
    - Aggregate payment data
    - _Requirements: 13.3_
  
  - [x] 24.4 Implement outstanding payments report
    - Create endpoint for overdue invoices
    - Include customer details
    - _Requirements: 13.4_
  
  - [ ] 24.5 Implement churn report (optional)
    - Create endpoint for cancellations by month
    - Calculate churn rate
    - _Requirements: 13.6_
  
  - [x] 24.6 Implement report export
    - Create CSV export functionality
    - Support all report types
    - _Requirements: 13.7_
  
  - [ ] 24.7 Implement attendance reports (optional)
    - Create endpoint for attendance trends
    - Group by class or student
    - _Requirements: 17.4_

- [ ] 25. Multi-location support
  - [x] 25.1 Implement location management
    - Create location CRUD endpoints
    - Store name, address, contact details
    - _Requirements: 28.1_
  
  - [-] 25.2 Implement location-specific features
    - Require location assignment for classes
    - Filter timetable by location
    - Support location-specific pricing rules
    - Apply location tracking in Xero
    - _Requirements: 28.2, 28.3, 28.4, 28.5_
  
  - [~] 25.3 Write property test for location filtering
    - **Property 46: Location Filtering**
    - **Validates: Requirements 28.3**

- [ ] 26. Merchandise and uniform sales
  - [~] 26.1 Implement merchandise management
    - Create merchandise item CRUD endpoints
    - Track inventory levels
    - _Requirements: 27.1, 27.5_
  
  - [~] 26.2 Write property test for inventory constraints
    - **Property 45: Inventory Constraint**
    - **Validates: Requirements 27.5**
  
  - [~] 26.3 Implement merchandise purchase flow
    - Add merchandise to enrolment checkout
    - Create standalone shop endpoint
    - Include in invoice line items
    - Sync to Xero
    - _Requirements: 27.1, 27.2, 27.3, 27.4_

- [ ] 27. Term-based enrolment
  - [~] 27.1 Implement term configuration
    - Create term definition endpoints
    - Configure term dates and pricing
    - _Requirements: 8.7, 29.1_
  
  - [~] 27.2 Implement term-based enrolment flow
    - Display monthly and term pricing options
    - Calculate term fees
    - Create term invoices
    - Handle term end notifications
    - Prevent mid-term cancellations (configurable)
    - _Requirements: 29.1, 29.2, 29.3, 29.4, 29.5_

- [ ] 28. Cancellation and refund policies
  - [~] 28.1 Implement policy configuration
    - Create endpoints for cancellation policy settings
    - Configure notice periods and refund percentages
    - _Requirements: 26.1_
  
  - [~] 28.2 Implement refund calculation
    - Calculate refunds based on policy and effective date
    - Apply to cancellation flow
    - _Requirements: 26.2_
  
  - [ ] 28.3 Implement make-up class credits (optional)
    - Create endpoint to issue credits
    - Track credit usage
    - _Requirements: 26.4_
  
  - [~] 28.4 Display cancellation policy
    - Show policy to customers before enrolment
    - _Requirements: 26.5_

- [ ] 29. Checkpoint - Advanced features
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 30. Frontend - Public website
  - [~] 30.1 Set up React frontend project
    - Initialize React with TypeScript
    - Set up React Router
    - Configure Tailwind CSS
    - Set up API client with axios
    - _Requirements: Foundation for UI requirements_
  
  - [~] 30.2 Implement public pages
    - Create home page
    - Create about/teachers page
    - Create timetable page with filters
    - Create pricing page
    - Create contact page
    - _Requirements: 3.1, 3.2, 3.3_
  
  - [~] 30.3 Implement registration flow
    - Create registration form
    - Validate inputs client-side
    - Handle registration errors
    - _Requirements: 1.1_

- [ ] 31. Frontend - Customer portal
  - [~] 31.1 Implement customer dashboard
    - Display enrolments
    - Show next classes
    - Display payment status
    - _Requirements: 4.1, 6.7_
  
  - [~] 31.2 Implement dancer profile management
    - Create dancer profile forms
    - Handle profile updates
    - _Requirements: 1.3, 1.4, 1.5, 1.6_
  
  - [~] 31.3 Implement enrolment flow
    - Create class selection interface
    - Display fee breakdown
    - Show discount explanations
    - Support multi-dancer enrolment
    - _Requirements: 4.1, 4.2, 4.3, 25.1, 25.2, 25.3_
  
  - [~] 31.4 Implement payment checkout
    - Integrate Stripe Elements
    - Display fee breakdown
    - Handle payment success/failure
    - _Requirements: 6.1, 6.2, 6.5_
  
  - [~] 31.5 Implement billing section
    - Display invoices
    - Show receipts
    - Download PDFs
    - _Requirements: 6.4_

- [ ] 32. Frontend - Teacher portal
  - [~] 32.1 Implement teacher dashboard
    - Display classes for current week
    - Quick access to class rolls
    - _Requirements: 7.1_
  
  - [~] 32.2 Implement class roll view
    - Display enrolled students
    - Show class information
    - Export to CSV
    - _Requirements: 7.2, 7.3, 7.6_
  
  - [~] 32.3 Implement attendance marking
    - Create attendance marking interface
    - Support notes
    - _Requirements: 17.1, 17.2, 17.3_

- [ ] 33. Frontend - Admin portal
  - [~] 33.1 Implement admin dashboard
    - Display key metrics
    - Show Xero sync status
    - Display recent activity
    - _Requirements: 30.1, 30.2_
  
  - [~] 33.2 Implement class management UI
    - Create class CRUD forms
    - Display scheduling conflicts
    - Manage teacher assignments
    - _Requirements: 8.1, 8.2, 8.3, 24.1, 24.2_
  
  - [~] 33.3 Implement enrolment management UI
    - Display all enrolments
    - Move students between classes
    - Cancel enrolments with refunds
    - _Requirements: 9.1, 9.2, 9.5_
  
  - [~] 33.4 Implement configuration UI
    - Pricing rules management
    - Discount rules management
    - Xero settings
    - Notification templates
    - _Requirements: 22.1, 22.2, 22.3, 22.4, 23.1, 23.2_
  
  - [~] 33.5 Implement reporting UI
    - Display all report types
    - Export to CSV
    - Filter and date range selection
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7_
  
  - [~] 33.6 Implement Xero sync management UI
    - Display sync errors
    - Retry failed syncs
    - View sync history
    - _Requirements: 10.3, 11.6, 12.3, 30.2_

- [ ] 34. Checkpoint - Frontend complete
  - Ensure all tests pass, ask the user if questions arise.


- [ ] 35. Accessibility and mobile responsiveness
  - [~] 35.1 Implement accessibility features
    - Add ARIA labels to interactive elements
    - Ensure keyboard navigation works
    - Implement visible focus indicators
    - Ensure color contrast meets WCAG 2.1 AA
    - Add text alternatives for images
    - Associate form labels properly
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6_
  
  - [~] 35.2 Implement mobile responsiveness
    - Create responsive layouts for all pages
    - Ensure touch targets are 44x44 pixels minimum
    - Optimize timetable for mobile
    - Optimize checkout for mobile
    - _Requirements: 21.1, 21.2, 21.3, 21.4_
  
  - [~] 35.3 Test accessibility compliance
    - Run automated accessibility tests
    - Test with screen readers
    - Test keyboard-only navigation
    - _Requirements: 20.1_

- [ ] 36. Security hardening
  - [~] 36.1 Implement security headers
    - Add HSTS headers
    - Configure CORS properly
    - Add CSP headers
    - _Requirements: 18.2_
  
  - [~] 36.2 Implement rate limiting
    - Add rate limiting middleware
    - Configure limits per endpoint type
    - _Requirements: Security best practices_
  
  - [~] 36.3 Implement input validation and sanitization
    - Validate all inputs server-side
    - Sanitize user-generated content
    - Use parameterized queries (already done with Prisma)
    - _Requirements: 18.2_
  
  - [~] 36.4 Implement audit logging
    - Log all admin actions
    - Log authentication events
    - Log payment transactions
    - Log Xero sync operations
    - _Requirements: 18.6_
  
  - [~] 36.5 Write property test for audit logging
    - **Property 39: Audit Log Completeness**
    - **Validates: Requirements 9.6, 18.6**

- [ ] 37. Performance optimization
  - [~] 37.1 Implement caching strategy
    - Cache timetable data (5-minute TTL)
    - Cache pricing rules (1-hour TTL)
    - Cache user permissions (15-minute TTL)
    - Invalidate cache on updates
    - _Requirements: 3.5, 3.6_
  
  - [~] 37.2 Optimize database queries
    - Review and optimize slow queries
    - Ensure all indexes are in place
    - Use connection pooling
    - _Requirements: 3.5, 3.6, 21.5_
  
  - [~] 37.3 Implement API response compression
    - Enable gzip compression
    - _Requirements: Performance best practices_

- [ ] 38. Monitoring and observability
  - [~] 38.1 Set up application monitoring
    - Integrate APM tool (e.g., New Relic, Datadog)
    - Track response times and throughput
    - Monitor error rates
    - _Requirements: 30.3_
  
  - [~] 38.2 Set up error tracking
    - Integrate Sentry or similar
    - Track and alert on errors
    - _Requirements: 30.5_
  
  - [~] 38.3 Implement health check endpoints
    - Create health check endpoint
    - Check database connectivity
    - Check Redis connectivity
    - Check external service status
    - _Requirements: 30.1_
  
  - [~] 38.4 Set up logging
    - Configure structured logging
    - Set appropriate log levels
    - Log to centralized system
    - _Requirements: 18.6_
  
  - [~] 38.5 Create admin monitoring dashboard
    - Display Xero sync status
    - Display background job status
    - Display performance metrics
    - Display error counts
    - _Requirements: 30.1, 30.2, 30.3, 30.4, 30.5_

- [ ] 39. Deployment and infrastructure
  - [~] 39.1 Create production Docker images
    - Create Dockerfile for API
    - Create Dockerfile for frontend
    - Optimize image sizes
    - _Requirements: Deployment_
  
  - [~] 39.2 Set up CI/CD pipeline
    - Configure GitHub Actions or similar
    - Run tests on every commit
    - Build and push Docker images
    - Deploy to staging on PR merge
    - Deploy to production on release
    - _Requirements: Deployment_
  
  - [~] 39.3 Set up infrastructure
    - Provision database (RDS or similar)
    - Provision Redis (ElastiCache or similar)
    - Set up load balancer
    - Configure auto-scaling
    - Set up CDN for static assets
    - _Requirements: Deployment_
  
  - [~] 39.4 Configure environment variables
    - Set up secrets management
    - Configure all required environment variables
    - _Requirements: Deployment_
  
  - [~] 39.5 Set up backup and disaster recovery
    - Configure automated database backups
    - Test backup restoration
    - Document recovery procedures
    - _Requirements: Deployment_

- [ ] 40. Documentation and training
  - [~] 40.1 Write API documentation
    - Document all endpoints
    - Include request/response examples
    - Document authentication
    - _Requirements: Documentation_
  
  - [~] 40.2 Write user documentation
    - Create customer user guide
    - Create teacher user guide
    - Create admin user guide
    - _Requirements: Documentation_
  
  - [~] 40.3 Create admin training materials
    - Document configuration workflows
    - Document common admin tasks
    - Create troubleshooting guide
    - _Requirements: Documentation_

- [ ] 41. Final checkpoint and launch preparation
  - Run full test suite (unit + property tests)
  - Perform security audit
  - Load testing
  - User acceptance testing
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation with full test coverage
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (46 total)
- Unit tests validate specific examples and edge cases
- The implementation follows a phased approach: core features first, then advanced features
- TypeScript is used throughout for type safety
- All external integrations (Xero, Stripe) include error handling and retry logic
