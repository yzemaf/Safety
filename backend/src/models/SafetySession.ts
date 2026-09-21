import mongoose, { Schema, Document } from 'mongoose';

export type SessionStatus =
  | 'active'
  | 'distress_pending'
  | 'emergency'
  | 'resolved'
  | 'cancelled';

export interface IBreadcrumb {
  coordinates: [number, number]; // [lng, lat]
  recordedAt: Date;
  batteryLevel?: number;
}

export interface IActiveCall {
  status: 'ringing' | 'connected' | 'accepted' | 'declined' | 'missed' | 'ended';
  callerName: string;
  callerRole: string;
  channelName: string;
  token?: string;
  initiatedAt: Date;
}

export interface ISafetySession extends Document {
  userId: mongoose.Types.ObjectId | string;
  userName: string;
  userPhone?: string;
  userEmail?: string;
  status: SessionStatus;
  batteryLevel: number;
  lastPingAt: Date;
  nextPromptDueAt: Date;
  emergencyTriggeredAt?: Date;
  agoraChannelName: string;
  currentLocation: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  addressName?: string;
  countryCode: string;
  stateCode: string;
  communityId: string;
  breadcrumbs: IBreadcrumb[];
  activeCall?: IActiveCall;
  createdAt: Date;
  updatedAt: Date;
}

const BreadcrumbSchema = new Schema<IBreadcrumb>(
  {
    coordinates: {
      type: [Number],
      required: true,
    },
    recordedAt: { type: Date, default: Date.now },
    batteryLevel: { type: Number },
  },
  { _id: false }
);

const SafetySessionSchema = new Schema<ISafetySession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    userName: { type: String, default: 'Citizen' },
    userPhone: { type: String, default: '' },
    userEmail: { type: String, default: '' },
    status: {
      type: String,
      enum: ['active', 'distress_pending', 'emergency', 'resolved', 'cancelled'],
      default: 'active',
      index: true,
    },
    batteryLevel: { type: Number, default: 100 },
    lastPingAt: { type: Date, default: Date.now },
    nextPromptDueAt: { type: Date, required: true, index: true },
    emergencyTriggeredAt: { type: Date },
    agoraChannelName: { type: String, required: true },
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [lng, lat]
        required: true,
      },
    },
    addressName: { type: String, default: '' },
    countryCode: { type: String, default: '', index: true },
    stateCode: { type: String, default: '', index: true },
    communityId: { type: String, default: '', index: true },
    breadcrumbs: [BreadcrumbSchema],
    activeCall: {
      status: { type: String, enum: ['ringing', 'connected', 'accepted', 'declined', 'missed', 'ended'] },
      callerName: { type: String },
      callerRole: { type: String },
      channelName: { type: String },
      token: { type: String },
      initiatedAt: { type: Date },
    },
  },
  {
    timestamps: true,
  }
);

SafetySessionSchema.index({ currentLocation: '2dsphere' });
SafetySessionSchema.index({ status: 1, communityId: 1 });

export const SafetySession = mongoose.model<ISafetySession>(
  'SafetySession',
  SafetySessionSchema
);
