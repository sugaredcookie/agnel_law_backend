import mongoose from 'mongoose';

const leaveSchema = new mongoose.Schema({
  applicantId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'applicantType'
  },
  applicantType: {
    type: String,
    required: true,
    enum: ['Faculty', 'NonTeachingStaff']
  },
  leaveType: {
    type: String,
    enum: ['CASUAL', 'SICK', 'EARNED', 'emergency', 'other'],
    required: true
  },
  fromDate: {
    type: Date,
    required: true
  },
  toDate: {
    type: Date,
    required: true
  },
  numberOfDays: {
    type: Number,
    required: true,
    min: 1
  },
  reason: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  proofDocument: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED'],
    default: 'PENDING',
    index: true
  },
  appliedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  reviewedAt: {
    type: Date
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  rejectionReason: {
    type: String,
    trim: true,
    maxlength: 500
  }
}, {
  timestamps: true
});

leaveSchema.pre('save', function(next) {
  if (this.isModified('fromDate') || this.isModified('toDate')) {
    const from = new Date(this.fromDate);
    const to = new Date(this.toDate);
    const diffTime = Math.abs(to - from);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    this.numberOfDays = diffDays;
  }
  next();
});

leaveSchema.index({ applicantId: 1, applicantType: 1, status: 1, appliedAt: -1 });
leaveSchema.index({ status: 1, appliedAt: -1 });

const Leave = mongoose.model('Leave', leaveSchema);

export default Leave;