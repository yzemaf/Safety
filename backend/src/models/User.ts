import mongoose, { Schema, Document } from 'mongoose';

export interface IEmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface IUserSettings {
  checkInIntervalMinutes: number;
  timeoutDurationSeconds: number;
  callHandlingPreference: 'standard_ring' | 'auto_answer_speaker';
  defaultLandingTab: 'safety_mode' | 'awareness' | 'settings';
}

export interface IUser extends Document {
  isGuest: boolean;
  guestDeviceId?: string;
  name: string;
  email?: string;
  phone?: string;
  passwordHash?: string;
  safetyPinHash?: string;
  emergencyContacts: IEmergencyContact[];
  settings: IUserSettings;
  fcmToken?: string;
  lastKnownLocation?: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  communityId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    isGuest: { type: Boolean, default: false },
    guestDeviceId: { type: String, sparse: true, index: true },
    name: { type: String, default: 'Guest' },
    email: { type: String, sparse: true, unique: true, index: true },
    phone: { type: String, sparse: true },
    passwordHash: { type: String },
    safetyPinHash: { type: String },
    emergencyContacts: [
      {
        name: { type: String, default: '' },
        phone: { type: String, default: '' },
        relationship: { type: String, default: '' },
      },
    ],
    settings: {
      checkInIntervalMinutes: { type: Number, default: 5 },
      timeoutDurationSeconds: { type: Number, default: 60 },
      callHandlingPreference: {
        type: String,
        enum: ['standard_ring', 'auto_answer_speaker'],
        default: 'standard_ring',
      },
      defaultLandingTab: {
        type: String,
        enum: ['safety_mode', 'awareness', 'settings'],
        default: 'safety_mode',
      },
    },
    fcmToken: { type: String },
    lastKnownLocation: {
      type: {
        type: String,
        enum: ['Point'],
      },
      coordinates: {
        type: [Number], // [lng, lat]
      },
    },
    communityId: { type: String, default: '', index: true },
  },
  {
    timestamps: true,
  }
);

UserSchema.index({ lastKnownLocation: '2dsphere' }, { sparse: true });

export const User = mongoose.model<IUser>('User', UserSchema);
