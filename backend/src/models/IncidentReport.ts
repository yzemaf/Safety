import mongoose, { Schema, Document } from 'mongoose';

export type IncidentCategory =
  | 'harassment'
  | 'theft'
  | 'physical_threat'
  | 'hazard'
  | 'emergency'
  | 'other';

export type IncidentStatus = 'open' | 'investigating' | 'resolved';
export type IncidentUrgency = 'low' | 'medium' | 'high' | 'critical';

export interface IStaffComment {
  staffId?: mongoose.Types.ObjectId | string;
  staffName: string;
  staffRole: string;
  comment: string;
  createdAt: Date;
}

export interface IIncidentReport extends Document {
  id?: string;
  customId?: string;
  reportedBy?: mongoose.Types.ObjectId | string;
  reporterName: string;
  isAnonymous: boolean;
  source: 'community_report' | 'safety_mode_emergency';
  category: IncidentCategory;
  title: string;
  description: string;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  addressName?: string;
  countryCode: string;
  stateCode: string;
  communityId: string;
  status: IncidentStatus;
  urgency: IncidentUrgency;
  staffComments: IStaffComment[];
  createdAt: Date;
  updatedAt: Date;
}

const StaffCommentSchema = new Schema<IStaffComment>(
  {
    staffId: { type: Schema.Types.ObjectId, ref: 'Staff' },
    staffName: { type: String, required: true },
    staffRole: { type: String, default: 'Dispatcher' },
    comment: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const IncidentReportSchema = new Schema<IIncidentReport>(
  {
    customId: { type: String, index: true },
    id: { type: String, index: true },
    reportedBy: { type: Schema.Types.Mixed, ref: 'User' },
    reporterName: { type: String, default: 'Anonymous' },
    isAnonymous: { type: Boolean, default: false },
    source: {
      type: String,
      enum: ['community_report', 'safety_mode_emergency'],
      default: 'community_report',
    },
    category: {
      type: String,
      enum: [
        'harassment',
        'theft',
        'physical_threat',
        'hazard',
        'emergency',
        'other',
      ],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    description: { type: String, required: true },
    location: {
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
    status: {
      type: String,
      enum: ['open', 'investigating', 'resolved'],
      default: 'open',
      index: true,
    },
    urgency: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium',
      index: true,
    },
    staffComments: [StaffCommentSchema],
  },
  {
    timestamps: true,
  }
);

IncidentReportSchema.index({ location: '2dsphere' });
IncidentReportSchema.index({ communityId: 1, status: 1, createdAt: -1 });

export const IncidentReport = mongoose.model<IIncidentReport>(
  'IncidentReport',
  IncidentReportSchema
);
