import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import TimetablePage from './pages/TimetablePage';
import PricingPage from './pages/PricingPage';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import RegisterPage from './pages/RegisterPage';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/customer/DashboardPage';
import DancersPage from './pages/customer/DancersPage';
import DancerFormPage from './pages/customer/DancerFormPage';
import EnrolmentPage from './pages/customer/EnrolmentPage';
import CheckoutPage from './pages/customer/CheckoutPage';
import BillingPage from './pages/customer/BillingPage';
import TeacherDashboardPage from './pages/teacher/TeacherDashboardPage';
import ClassRollPage from './pages/teacher/ClassRollPage';
import AttendancePage from './pages/teacher/AttendancePage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import ClassManagementPage from './pages/admin/ClassManagementPage';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './context/AuthContext';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/timetable" element={<TimetablePage />} />
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/contact" element={<ContactPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/dancers" element={<DancersPage />} />
              <Route path="/dancers/new" element={<DancerFormPage />} />
              <Route path="/dancers/:id/edit" element={<DancerFormPage />} />
              <Route path="/enrol" element={<EnrolmentPage />} />
              <Route path="/checkout" element={<CheckoutPage />} />
              <Route path="/billing" element={<BillingPage />} />
              <Route path="/teacher/dashboard" element={<TeacherDashboardPage />} />
              <Route path="/teacher/classes/:id/roll" element={<ClassRollPage />} />
              <Route path="/teacher/classes/:id/attendance" element={<AttendancePage />} />
              <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
              <Route path="/admin/classes" element={<ClassManagementPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
