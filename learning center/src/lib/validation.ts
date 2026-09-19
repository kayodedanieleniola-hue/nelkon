import { z } from "zod";

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the student's full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  phone: z.string().trim().min(7, "Enter a valid phone number").max(20),
  age: z.coerce.number().int().min(10, "Age must be 10 or older").max(100),
  gender: z.string().trim().min(1, "Select a gender"),
  address: z.string().trim().min(5, "Enter a valid address").max(300),
  socialMedia: z.string().trim().max(200).optional().or(z.literal("")),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password is too long"),
  courseId: z.string().min(1, "Select a course"),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(1, "Enter your email or Student ID"),
  password: z.string().min(1, "Enter your password"),
});

export const adminLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
export const adminProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
});

export const createAdminSchema = adminProfileSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters").max(72, "Password is too long"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: z.string().min(8, "New password must be at least 8 characters").max(72, "Password is too long"),
});
