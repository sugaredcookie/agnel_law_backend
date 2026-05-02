// Single source of truth for payment/receipt types used across the application.
// Both paymentModel and unifiedReceiptModel enums should mirror the keys here.
const PAYMENT_TYPES = {
  student_fee: {
    label: "Student Fee",
    badgeStyle: "bg-blue-100 text-blue-700",
    badgeStyleAlt: "bg-blue-100 text-blue-800",
  },
  application: {
    label: "Application Fee",
    badgeStyle: "bg-green-100 text-green-700",
    badgeStyleAlt: "bg-green-100 text-green-800",
  },
  atkt: {
    label: "ATKT Fee",
    badgeStyle: "bg-purple-100 text-purple-700",
    badgeStyleAlt: "bg-purple-100 text-purple-800",
  },
  revaluation: {
    label: "Revaluation Fee",
    badgeStyle: "bg-orange-100 text-orange-700",
    badgeStyleAlt: "bg-orange-100 text-orange-800",
  },
};

export default PAYMENT_TYPES;
