import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { login } from '../services/authService';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import AuthShell from '../components/auth/AuthShell';
import { useAuth } from '../context/AuthContext';
import dwsLogo from '../assets/dws.png';
 
const Login = () => {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [rememberMe, setRememberMe] = useState(false);
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
      if (response.success) {
        setUser(response.data);
        if (rememberMe) {
          localStorage.setItem('rememberedEmail', formData.email);
        }
        toast.success('Welcome back!');
        navigate('/dashboard');
      }
    } catch (error) {
      const msg =
        error.response?.data?.message ||
        (error.response?.status === 401 ? 'Invalid email or password.' : 'Login failed. Please try again.');
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const helperCard = (
    <div className="space-y-10">
      <div className="space-y-6">
        <div className="inline-flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-white/70">
          DWS
        </div>
        <div className="space-y-2">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white">
            Digital Web Solutions
          </h2>
          <p className="text-lg text-white/80">Group of Companies</p>
        </div>
        <p className="text-sm italic text-white/60">Together, We Build What&apos;s Next</p>
      </div>

      <div className="space-y-4">
        <h3 className="text-3xl font-semibold text-white">Expense Management Ecosystem</h3>
        <p className="text-sm text-white/70 leading-relaxed">
          Manage every stream of spend in one place with smart controls across cards, services, and business units.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center">
          <img src={dwsLogo} alt="DWS" className="h-9 object-contain" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">Digital Web Solutions</p>
          <p className="text-xs text-white/60">Group of Companies</p>
        </div>
      </div>
    </div>
  );

  return (
    <AuthShell
      helperCard={helperCard}
      leftFooter="Expense Management Ecosystem"
      footer="(c) 2025 Expense Management Ecosystem. All rights reserved."
    >
      <div className="max-w-md w-full space-y-8 mx-auto">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-slate-900">Welcome back</h1>
          <p className="text-sm text-slate-500">Sign in to access your projects</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Email Address"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="you@example.com"
            required
          />
          <Input
            label="Password"
            type="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Enter your password"
            required
          />
          <div className="flex items-center justify-between text-sm">
            <label className="inline-flex items-center gap-2 text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-300"
              />
              Remember me
            </label>
            <Link to="#" className="font-semibold text-primary-600 hover:text-primary-700">
              Forgot password?
            </Link>
          </div>

          <Button type="submit" fullWidth size="lg" disabled={loading} className="rounded-2xl">
            {loading ? 'Signing in...' : 'Sign In'}
          </Button>
        </form>

        <div className="text-center text-sm text-slate-500">
          First-time setup?{' '}
          <Link to="/setup" className="font-semibold text-primary-600 hover:text-primary-700">
            Create Super Admin
          </Link>
        </div>
      </div>
    </AuthShell>
  );
};

export default Login;
