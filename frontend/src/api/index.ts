import client from './client';

// Auth
export const auth = {
  login: (email: string, password: string) =>
    client.post('/auth/login', { email, password }),
  register: (data: Record<string, unknown>) =>
    client.post('/auth/register', data),
  logout: () => client.post('/auth/logout'),
};

// Customers
export const customers = {
  list: () => client.get('/customers'),
  get: (id: string) => client.get(`/customers/${id}`),
  create: (data: Record<string, unknown>) => client.post('/customers', data),
  update: (id: string, data: Record<string, unknown>) =>
    client.put(`/customers/${id}`, data),
  delete: (id: string) => client.delete(`/customers/${id}`),
};

// Dancers
export const dancers = {
  list: () => client.get('/dancers'),
  get: (id: string) => client.get(`/dancers/${id}`),
  create: (data: Record<string, unknown>) => client.post('/dancers', data),
  update: (id: string, data: Record<string, unknown>) =>
    client.put(`/dancers/${id}`, data),
};

// Classes
export const classes = {
  list: () => client.get('/classes'),
  get: (id: string) => client.get(`/classes/${id}`),
  create: (data: Record<string, unknown>) => client.post('/classes', data),
  update: (id: string, data: Record<string, unknown>) =>
    client.put(`/classes/${id}`, data),
  delete: (id: string) => client.delete(`/classes/${id}`),
};

// Enrolments
export const enrolments = {
  list: () => client.get('/enrolments'),
  get: (id: string) => client.get(`/enrolments/${id}`),
  create: (data: Record<string, unknown>) => client.post('/enrolments', data),
  update: (id: string, data: Record<string, unknown>) =>
    client.put(`/enrolments/${id}`, data),
};

// Teachers
export const teachers = {
  list: () => client.get('/teachers'),
  get: (id: string) => client.get(`/teachers/${id}`),
};

// Timetable
export const timetable = {
  get: () => client.get('/timetable'),
};

// Fees
export const fees = {
  list: () => client.get('/fees'),
  get: (id: string) => client.get(`/fees/${id}`),
};

// Payments
export const payments = {
  list: () => client.get('/payments'),
  get: (id: string) => client.get(`/payments/${id}`),
};

// Invoices
export const invoices = {
  list: () => client.get('/invoices'),
  get: (id: string) => client.get(`/invoices/${id}`),
};

// Merchandise
export const merchandise = {
  list: () => client.get('/merchandise'),
  get: (id: string) => client.get(`/merchandise/${id}`),
};

// Terms
export const terms = {
  list: () => client.get('/terms'),
  get: (id: string) => client.get(`/terms/${id}`),
};

// Locations
export const locations = {
  list: () => client.get('/locations'),
  get: (id: string) => client.get(`/locations/${id}`),
};
