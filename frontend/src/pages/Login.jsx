import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { login } from '../services/authService';
import Button from '../components/common/Button';
import { useAuth } from '../context/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedEmail = localStorage.getItem('rememberedEmail');
    if (savedEmail) {
      setFormData((prev) => ({ ...prev, email: savedEmail }));
      setRememberMe(true);
    }
  }, []);

  const handleChange = (e) =>
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await login(formData.email, formData.password);
      if (!response?.success) {
        toast.error(response?.message || 'Login failed. Please check your credentials.');
        setLoading(false);
        return;
      }

      setUser(response.data);
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', formData.email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (_error) {
      const msg =
        _error.response?.data?.message ||
        (_error.response?.status === 401
          ? 'Invalid email or password.'
          : 'Login failed. Please try again.');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
        <section className="relative overflow-hidden bg-[#071027] text-white px-6 py-10 sm:px-10 sm:py-12 lg:px-14 lg:py-14">
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-[linear-gradient(110deg,#1d3fa4_0%,#132a6c_35%,#08132b_72%,#040914_100%)]" />
            <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle,rgba(255,255,255,0.45)_1px,transparent_1px)] [background-size:38px_38px]" />
            <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-r from-transparent to-black/30" />
          </div>

          <div className="relative flex min-h-[36rem] h-full flex-col justify-between gap-12">
            <div className="space-y-10">
              <div className="space-y-4">
                <p className="text-[2.75rem] leading-none sm:text-[4rem] lg:text-[4.5rem] font-bold tracking-[0.18em] text-white">
                  COMPAZIO
                </p>
                <p className="text-xs sm:text-sm font-semibold tracking-[0.45em] text-white/85">
                  CONNECT.COLLABORATE.COMPLETE
                </p>
              </div>

              <div className="pt-8 sm:pt-16 lg:pt-20 space-y-4 max-w-xl">
                <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-white">
                  Expense Management System
                </h2>
                <p className="text-base sm:text-lg leading-relaxed text-white/85">
                  Welcome to our expense management system. Use this space to manage cards,
                  services, approvals, and business unit spending.
                </p>
              </div>
            </div>

            <div className="space-y-3 text-sm text-white/80">
              <p>Powered by Digital Web Solutions Group</p>
              <p>@2026 DWSG. All rights reserved.</p>
            </div>
          </div>
        </section>

        <section className="bg-[#f6f7fb] px-6 py-10 sm:px-10 md:px-14 lg:px-16 xl:px-20 flex items-center">
          <div className="mx-auto w-full max-w-[500px]">
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900">
                Welcome back
              </h1>
              <p className="text-sm sm:text-base text-slate-500">
                Sign in to your account to continue
              </p>
            </div>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-semibold text-slate-700">
                  Email address
                </label>
                <div className="relative">
                  <Mail
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="Enter your email"
                    required
                    className="w-full rounded-xl border border-slate-300 bg-white px-12 py-3 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-semibold text-slate-700">
                  Password
                </label>
                <div className="relative">
                  <Lock
                    size={18}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="Enter your password"
                    required
                    className="w-full rounded-xl border border-slate-300 bg-white px-12 py-3 pr-12 text-sm sm:text-base text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

                <Button
                  type="submit"
                  fullWidth
                  size="md"
                  disabled={loading}
                  className="mt-1 rounded-xl !bg-[#2f64df] !text-white hover:!bg-[#2858ca] focus-visible:!ring-blue-300 shadow-none py-3"
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </Button>

            </form>
          </div>
        </section>
      </div>
    </div>
  );
};

export default Login;
