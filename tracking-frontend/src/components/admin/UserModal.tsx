import { useState, useEffect } from "react";
import { X, Eye, EyeOff } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";

interface UserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (userData: any) => void;
  user?: any;
  mode: "create" | "edit";
}

interface FormData {
  phone: string;
  password: string;
  role: string;
}

export default function UserModal({ isOpen, onClose, onSave, user, mode }: UserModalProps) {
  const { t, isRTL } = useLanguage();
  const [formData, setFormData] = useState<FormData>({
    phone: "",
    password: "",
    role: "user",
  });
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (user && mode === "edit") {
      setFormData({
        phone: user.phone || "",
        password: "",
        role: user.role || "user",
      });
    } else {
      setFormData({ phone: "", password: "", role: "user" });
    }
  }, [user, mode, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Create a copy of form data
    const submitData: any = {
      phone: formData.phone,
      role: formData.role,
    };
    
    // Only include password if it's provided
    if (formData.password) {
      submitData.password = formData.password;
    }
    
    onSave(submitData);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-card p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold">
            {mode === "create" ? "Create User" : "Edit User"}
          </h3>
          <button onClick={onClose} className="text-content-muted hover:text-content-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Phone Number
            </label>
            <input
              type="text"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded-control focus:border-brand"
              placeholder="09123456789"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              {mode === "create" ? "Password" : "New Password (optional)"}
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-line rounded-control focus:border-brand"
                placeholder={mode === "create" ? "Enter password" : "Leave blank to keep current"}
                required={mode === "create"}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-content-muted"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-content-secondary mb-1">
              Role
            </label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 border border-line rounded-control focus:border-brand"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-brand text-white py-2 rounded-control hover:bg-brand-hover transition"
            >
              {mode === "create" ? "Create" : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface-sunken text-content-secondary py-2 rounded-control hover:bg-surface-sunken transition"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}