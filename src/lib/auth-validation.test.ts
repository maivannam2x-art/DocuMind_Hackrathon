import { describe, expect, it } from "vitest";
import { validateProfile, validateSignUp } from "@/lib/auth-validation";

describe("auth form validation", () => {
  it("accepts a complete sign-up and rejects weak or mismatched credentials", () => {
    expect(validateSignUp({ displayName: "Mai Nam", email: "nam@example.com", password: "documind-pass-1", passwordConfirmation: "documind-pass-1" })).toBeNull();
    expect(validateSignUp({ displayName: "M", email: "nam@example.com", password: "short", passwordConfirmation: "short" })).toContain("Tên hiển thị");
    expect(validateSignUp({ displayName: "Mai Nam", email: "nam@example.com", password: "long-password", passwordConfirmation: "different-password" })).toContain("chưa khớp");
    expect(validateSignUp({ displayName: "Mai Nam", email: "not-an-email", password: "documind-pass-1", passwordConfirmation: "documind-pass-1" })).toContain("email hợp lệ");
  });

  it("validates profile names and optional usernames", () => {
    expect(validateProfile("Mai Nam", "mai_nam")).toBeNull();
    expect(validateProfile("Mai Nam", "bad handle")).toContain("Tên người dùng");
    expect(validateProfile("A", "")).toContain("Tên hiển thị");
  });
});

