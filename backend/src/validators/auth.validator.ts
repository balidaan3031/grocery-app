import { z } from 'zod';
import { idParam, optionalText, text } from './common.validator';

const newPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be 72 characters or fewer');

export const loginSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
};

export const refreshSchema = {
  body: z.object({
    refreshToken: z.string().min(10, 'Refresh token is required'),
  }),
};

export const updateProfileSchema = {
  body: z
    .object({
      fullName: text(120, 'Name').optional(),
      phone: optionalText(32).optional(),
      avatarUrl: z.string().url('Avatar must be a valid URL').nullish(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Provide at least one field to update',
    }),
};

export const changePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters')
      .max(72, 'New password must be 72 characters or fewer'),
  }),
};

export const createStaffSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: newPassword,
    fullName: text(120, 'Name'),
    role: z.enum(['admin', 'staff']).default('staff'),
    phone: optionalText(32).optional(),
  }),
};

export const updateStaffSchema = {
  params: idParam,
  body: z
    .object({
      fullName: text(120, 'Name').optional(),
      phone: optionalText(32).optional(),
      role: z.enum(['admin', 'staff']).optional(),
    })
    .refine((value) => Object.keys(value).length > 0, {
      message: 'Provide at least one field to update',
    }),
};

export const setStaffStatusSchema = {
  params: idParam,
  body: z.object({ isActive: z.boolean() }),
};

export const resetStaffPasswordSchema = {
  params: idParam,
  body: z.object({ password: newPassword }),
};
