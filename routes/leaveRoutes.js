import express from 'express';
import { body } from 'express-validator';
import * as leaveController from '../controllers/leaveController.js';
import { combinedAuthMiddleware } from '../middlewares/combinedAuthMiddleware.js';
import { adminAuthMiddleware, facultyAuthMiddleware } from '../middlewares/AuthMiddleware.js';

const router = express.Router();

const validateLeaveApplication = [
  body('leaveType')
    .isIn(['CASUAL', 'SICK', 'EARNED', 'emergency', 'other'])
    .withMessage('Invalid leave type'),
  
  body('fromDate')
    .isISO8601()
    .withMessage('Invalid from date format')
    .toDate(),
  
  body('toDate')
    .isISO8601()
    .withMessage('Invalid to date format')
    .toDate()
    .custom((value, { req }) => {
      if (new Date(value) < new Date(req.body.fromDate)) {
        throw new Error('To date must be after from date');
      }
      return true;
    }),
  
  body('reason')
    .notEmpty()
    .withMessage('Reason is required')
    .isLength({ max: 500 })
    .withMessage('Reason cannot exceed 500 characters')
    .trim()
    .escape(),
  
  body('proofDocument')
    .optional()
    .isURL()
    .withMessage('Proof document must be a valid URL')
    .trim()
];

//non teacheing staff routes
router.post(
  '/apply',
  combinedAuthMiddleware,
  validateLeaveApplication,
  leaveController.applyLeave
);

router.get(
  '/my-leaves',
  combinedAuthMiddleware,
  leaveController.getMyLeaves
);

router.get(
  '/all',
  adminAuthMiddleware,
  leaveController.getAllLeaves
);

router.put(
  '/approve/:id',
  adminAuthMiddleware,
  [
    body('id').isMongoId().withMessage('Invalid leave ID')
  ],
  leaveController.approveLeave
);

router.put(
  '/reject/:id',
  adminAuthMiddleware,
  [
    body('id').isMongoId().withMessage('Invalid leave ID'),
    body('rejectionReason')
      .notEmpty()
      .withMessage('Rejection reason is required')
      .isLength({ max: 500 })
      .withMessage('Rejection reason cannot exceed 500 characters')
      .trim()
      .escape()
  ],
  leaveController.rejectLeave
);

router.get(
  '/statistics',
  adminAuthMiddleware,
  leaveController.getLeaveStatistics
);

router.get(
  '/faculty/my-leaves',
  facultyAuthMiddleware,
  leaveController.getFacultyLeaves
);

export default router;