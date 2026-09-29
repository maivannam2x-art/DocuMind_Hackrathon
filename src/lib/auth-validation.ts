export type SignUpValues = {
  displayName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSignUp(values: SignUpValues): string | null {
  if (values.displayName.trim().length < 2) return "Tên hiển thị cần có ít nhất 2 ký tự.";
  if (values.displayName.trim().length > 80) return "Tên hiển thị không được dài quá 80 ký tự.";
  if (!EMAIL_PATTERN.test(values.email.trim())) return "Hãy nhập địa chỉ email hợp lệ.";
  if (values.password.length < 8) return "Mật khẩu cần có ít nhất 8 ký tự.";
  if (values.password.length > 72) return "Mật khẩu không được dài quá 72 ký tự.";
  if (values.password !== values.passwordConfirmation) return "Mật khẩu xác nhận chưa khớp.";
  return null;
}

export function validateProfile(displayName: string, username: string): string | null {
  const name = displayName.trim();
  const handle = username.trim();
  if (name.length < 2 || name.length > 80) return "Tên hiển thị cần dài từ 2 đến 80 ký tự.";
  if (handle && !/^[a-zA-Z0-9_-]{3,24}$/.test(handle)) return "Tên người dùng cần có 3–24 ký tự gồm chữ, số, dấu gạch dưới hoặc gạch ngang.";
  return null;
}

