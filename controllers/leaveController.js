import Leave from '../models/leaveModel.js';
import Faculty from '../models/facultyModel.js';
import NonTeachingStaff from '../models/nonTeachingStaffModel.js';
import { validationResult } from 'express-validator';

const calculateAvailableSickLeaves = (faculty, currentMonth) => {
  const { slCreditMonth1, slCreditMonth2 } = faculty;
  
  if (currentMonth < slCreditMonth1) {
    return 0;
  } else if (currentMonth >= slCreditMonth1 && currentMonth < slCreditMonth2) {
    return 5;
  } else {
    return 10;
  }
};

const validateLeaveDates = (fromDate, toDate) => {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (from < today) {
    throw new Error('Cannot apply for leave in the past');
  }
  
  if (from > to) {
    throw new Error('From date must be before or equal to to date');
  }
  
  return true;
};

// Apply Leave - Works for both Faculty and Non-Teaching Staff
export const applyLeave = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Get applicant info from req.user
    let applicantId, applicantType, userData;
    
    if (req.user.facultyId) {
      applicantId = req.user.facultyId;
      applicantType = 'Faculty';
      userData = req.user.userData || await Faculty.findById(applicantId);
    } else if (req.user.nonTeachingStaffId) {
      applicantId = req.user.nonTeachingStaffId;
      applicantType = 'NonTeachingStaff';
      userData = req.user.userData || await NonTeachingStaff.findById(applicantId);
    } else {
      return res.status(400).json({ message: "Invalid user type" });
    }

    if (!userData) {
      return res.status(404).json({ message: `${applicantType} not found` });
    }

    const { leaveType, fromDate, toDate, reason, proofDocument } = req.body;

    // Validate dates
    try {
      validateLeaveDates(fromDate, toDate);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const from = new Date(fromDate);
    const to = new Date(toDate);
    const diffTime = Math.abs(to - from);
    const numberOfDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Faculty-specific validations
    if (applicantType === 'Faculty') {
      const faculty = userData;
      
      if (faculty.isProbation && leaveType !== 'CASUAL') {
        return res.status(400).json({ 
          message: 'During probation, only CASUAL leave is allowed' 
        });
      }

      if (leaveType === 'SICK') {
        const currentMonth = new Date().getMonth() + 1;
        const availableSL = calculateAvailableSickLeaves(faculty, currentMonth);
        
        if (availableSL === 0) {
          return res.status(400).json({ 
            message: 'No sick leaves available at this time' 
          });
        }

        if (numberOfDays > availableSL) {
          return res.status(400).json({ 
            message: `You only have ${availableSL} sick leaves available` 
          });
        }

        // Doctor certificate for sick leave > 2 days
        if (numberOfDays > 2 && !proofDocument) {
          return res.status(400).json({ 
            message: 'Doctor certificate is required for sick leave of more than 2 days' 
          });
        }
      }
    }

    // Create leave application with dynamic applicant fields
    const leave = new Leave({
      applicantId,
      applicantType,
      leaveType,
      fromDate,
      toDate,
      numberOfDays,
      reason,
      proofDocument,
      status: 'PENDING',
      appliedAt: new Date()
    });

    await leave.save();

    res.status(201).json({
      message: 'Leave application submitted successfully',
      leave
    });

  } catch (error) {
    console.error('Apply leave error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get My Leaves - Works for both Faculty and Non-Teaching Staff
export const getMyLeaves = async (req, res) => {
  try {
    let applicantId, applicantType;
    
    if (req.user.facultyId) {
      applicantId = req.user.facultyId;
      applicantType = 'Faculty';
    } else if (req.user.nonTeachingStaffId) {
      applicantId = req.user.nonTeachingStaffId;
      applicantType = 'NonTeachingStaff';
    } else {
      return res.status(400).json({ message: "Invalid user type" });
    }

    const { page = 1, limit = 10, status } = req.query;

    const query = { 
      applicantId,
      applicantType 
    };
    
    if (status) {
      query.status = status.toUpperCase();
    }

    const leaves = await Leave.find(query)
      .sort({ appliedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('reviewedBy', 'name email');

    const total = await Leave.countDocuments(query);

    res.json({
      leaves,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });

  } catch (error) {
    console.error('Get my leaves error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get All Leaves (Admin only) - Shows both Faculty and Staff leaves
export const getAllLeaves = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      leaveType,
      fromDate,
      toDate,
      applicantType // Can filter by Faculty or NonTeachingStaff
    } = req.query;

    const query = {};
    
    if (status) query.status = status.toUpperCase();
    if (leaveType) query.leaveType = leaveType;
    if (applicantType) query.applicantType = applicantType;
    
    if (fromDate || toDate) {
      query.appliedAt = {};
      if (fromDate) query.appliedAt.$gte = new Date(fromDate);
      if (toDate) query.appliedAt.$lte = new Date(toDate);
    }

    const leaves = await Leave.find(query)
      .sort({ appliedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('applicantId')
      .populate('reviewedBy', 'name email');

    const total = await Leave.countDocuments(query);

    res.json({
      leaves,
      totalPages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      total
    });

  } catch (error) {
    console.error('Get all leaves error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const approveLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.adminId;

    const leave = await Leave.findById(id).populate('applicantId');
    
    if (!leave) {
      return res.status(404).json({ message: 'Leave application not found' });
    }

    if (leave.status !== 'PENDING') {
      return res.status(400).json({ 
        message: `Leave application already ${leave.status.toLowerCase()}` 
      });
    }

    if (leave.applicantType === 'Faculty') {
      const faculty = leave.applicantId;
      if (faculty && faculty.isProbation && leave.leaveType !== 'CASUAL') {
        return res.status(400).json({ 
          message: 'Cannot approve SICK or EARNED leave for faculty on probation' 
        });
      }
    }

    leave.status = 'APPROVED';
    leave.reviewedAt = new Date();
    leave.reviewedBy = adminId;

    await leave.save();

    res.json({
      message: 'Leave approved successfully',
      leave
    });

  } catch (error) {
    console.error('Approve leave error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const rejectLeave = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const adminId = req.user.adminId;

    if (!rejectionReason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    const leave = await Leave.findById(id);
    
    if (!leave) {
      return res.status(404).json({ message: 'Leave application not found' });
    }

    if (leave.status !== 'PENDING') {
      return res.status(400).json({ 
        message: `Leave application already ${leave.status.toLowerCase()}` 
      });
    }

    leave.status = 'REJECTED';
    leave.reviewedAt = new Date();
    leave.reviewedBy = adminId;
    leave.rejectionReason = rejectionReason;

    await leave.save();

    res.json({
      message: 'Leave rejected successfully',
      leave
    });

  } catch (error) {
    console.error('Reject leave error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Get Leave Statistics (Admin only)
export const getLeaveStatistics = async (req, res) => {
  try {
    const stats = await Leave.aggregate([
      {
        $group: {
          _id: {
            status: '$status',
            leaveType: '$leaveType',
            applicantType: '$applicantType'
          },
          count: { $sum: 1 },
          totalDays: { $sum: '$numberOfDays' }
        }
      },
      {
        $group: {
          _id: '$_id.status',
          leaves: {
            $push: {
              applicantType: '$_id.applicantType',
              leaveType: '$_id.leaveType',
              count: '$count',
              totalDays: '$totalDays'
            }
          },
          totalCount: { $sum: '$count' },
          totalDays: { $sum: '$totalDays' }
        }
      }
    ]);

    res.json(stats);

  } catch (error) {
    console.error('Get leave statistics error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getFacultyLeaves = async (req, res) => {
  req.user.facultyId = req.user.facultyId;
  return getMyLeaves(req, res);
};