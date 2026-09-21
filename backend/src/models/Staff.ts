import mongoose, { Schema, Document } from 'mongoose';

export type StaffRole =
  | 'super_admin'
  | 'dispatch_officer'
  | 'field_responder'
  | 'support_lead';

export type StaffStatus = 'active' | 'on_duty' | 'offline' | 'suspended';

export interface IStaff extends Document {
  name: string;
  email: string;
  phone?: string;
  passwordHash: string;
  role: StaffRole;
  status: StaffStatus;
  countryCode: string;
  assignedJurisdiction: string;
  lastActiveAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema = new Schema<IStaff>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ['super_admin', 'dispatch_officer', 'field_responder', 'support_lead'],
      default: 'dispatch_officer',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'on_duty', 'offline', 'suspended'],
      default: 'active',
      index: true,
    },
    countryCode: { type: String, default: 'ALL' },
    assignedJurisdiction: { type: String, default: 'Global Command' },
    lastActiveAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
  }
);

export const Staff = mongoose.model<IStaff>('Staff', StaffSchema);
