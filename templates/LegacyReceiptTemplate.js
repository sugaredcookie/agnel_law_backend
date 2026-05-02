const LegacyReceiptTemplate = (receiptData) => {
  const {
    receiptType,
    receiptNumber,
    institutionDetails,
    studentDetails,
    paymentDetails,
    feeBreakdown,
    paymentSummary,
    subjects,
    collegeSealBase64,
  } = receiptData;

  const formatDate = (date) => {
    if (!date) return "N/A";
    const d = new Date(date);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return "0.00";
    return parseFloat(amount).toFixed(2);
  };

  const getReceiptTitle = () => {
    switch (receiptType) {
      case "student_fee":
        return "FEE RECEIPT";
      case "application":
        return "APPLICATION FEE RECEIPT";
      case "atkt":
        return "ATKT EXAMINATION FEE RECEIPT";
      default:
        return "PAYMENT RECEIPT";
    }
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${getReceiptTitle()} - ${receiptNumber}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: Arial, sans-serif;
            color: #000;
            background: white;
        }
        .receipt-container {
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            padding: 40px;
            background: white;
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
        }
        .institution-name {
            color: #1e40af;
            font-size: 28px;
            margin: 0 0 8px 0;
            font-weight: bold;
        }
        .institution-info {
            color: #4b5563;
            margin: 4px 0;
            font-size: 13px;
        }
        .receipt-title {
            border-top: 3px solid #1e40af;
            border-bottom: 3px solid #1e40af;
            padding: 10px;
            margin-top: 20px;
        }
        .receipt-title h2 {
            font-size: 20px;
            margin: 0;
            font-weight: bold;
            color: #000;
        }
        .details-section {
            width: 100%;
            margin-bottom: 25px;
        }
        .details-table {
            width: 100%;
        }
        .details-table td {
            vertical-align: top;
            padding-right: 20px;
        }
        .section-title {
            font-size: 16px;
            margin: 0 0 12px 0;
            font-weight: bold;
            color: #000;
        }
        .detail-line {
            margin: 6px 0;
            font-size: 13px;
            color: #000;
        }
        .fee-table {
            width: 100%;
            border-collapse: collapse;
            border: 1px solid #000;
            margin-bottom: 25px;
        }
        .fee-table thead tr {
            background-color: #f3f4f6;
        }
        .fee-table th,
        .fee-table td {
            border: 1px solid #000;
            padding: 10px;
            font-size: 13px;
            color: #000;
        }
        .fee-table th {
            text-align: left;
            font-weight: bold;
        }
        .fee-table td.amount {
            text-align: right;
        }
        .total-row {
            background-color: #f3f4f6;
            font-weight: bold;
        }
        .summary-table {
            width: 100%;
            margin-bottom: 25px;
        }
        .summary-table td {
            vertical-align: top;
            padding-right: 20px;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #000;
        }
        .footer-table {
            width: 100%;
        }
        .footer-notes {
            font-size: 11px;
            color: #6b7280;
            margin: 3px 0;
        }
        .seal-container {
            text-align: center;
            vertical-align: bottom;
        }
        .seal-image {
            height: 80px;
            width: 80px;
            margin-bottom: 5px;
        }
        .seal-label {
            font-size: 10px;
            font-weight: bold;
            color: #6b7280;
            margin: 0;
        }
        @media print {
            body {
                margin: 0;
                padding: 0;
            }
            .receipt-container {
                margin: 0;
                padding: 40px;
            }
        }
    </style>
</head>
<body>
    <div class="receipt-container">
        <div class="header">
            <h1 class="institution-name">${institutionDetails.name || "AGNEL SCHOOL OF LAW"}</h1>
            <p class="institution-info">${institutionDetails.address || "Sector 9A, Vashi, Navi Mumbai, Maharashtra 400703"}</p>
            <p class="institution-info">Phone: ${institutionDetails.phone || "02227771000"} | Email: ${institutionDetails.email || "asl@agnelschooloflaw.com"}</p>
            <div class="receipt-title">
                <h2>${getReceiptTitle()}</h2>
            </div>
        </div>

        <table class="details-table details-section">
            <tr>
                <td style="width: 50%;">
                    <h3 class="section-title">${receiptType === "application" ? "Applicant" : "Student"} Details</h3>
                    <p class="detail-line"><strong>Name:</strong> ${studentDetails.name || ""}</p>
                    <p class="detail-line"><strong>${studentDetails.idLabel || "ID"}:</strong> ${studentDetails.id || ""}</p>
                    ${studentDetails.program ? `<p class="detail-line"><strong>Program:</strong> ${studentDetails.program}</p>` : ""}
                    ${studentDetails.batch ? `<p class="detail-line"><strong>Batch:</strong> ${studentDetails.batch}</p>` : ""}
                    ${studentDetails.rollNumber ? `<p class="detail-line"><strong>Roll Number:</strong> ${studentDetails.rollNumber}</p>` : ""}
                </td>
                <td style="width: 50%; padding-left: 20px;">
                    <h3 class="section-title">Receipt Details</h3>
                    <p class="detail-line"><strong>Receipt No:</strong> ${receiptNumber || ""}</p>
                    <p class="detail-line"><strong>Payment Date:</strong> ${formatDate(paymentDetails.paymentDate)}</p>
                    <p class="detail-line"><strong>Payment Mode:</strong> ${paymentDetails.paymentMode || "Online"}</p>
                    <p class="detail-line"><strong>Transaction ID:</strong> ${paymentDetails.transactionId || ""}</p>
                    ${paymentDetails.razorpayPaymentId ? `<p class="detail-line"><strong>Razorpay ID:</strong> ${paymentDetails.razorpayPaymentId}</p>` : ""}
                </td>
            </tr>
        </table>

        ${
          receiptType === "atkt" && subjects && subjects.length > 0
            ? `
        <div style="margin-bottom: 25px;">
            <h3 class="section-title">ATKT Subjects</h3>
            <table class="fee-table">
                <thead>
                    <tr>
                        <th>S.No</th>
                        <th>Subject Name</th>
                        <th>Subject Code</th>
                    </tr>
                </thead>
                <tbody>
                    ${subjects
                      .map(
                        (subject, index) => `
                    <tr>
                        <td>${index + 1}</td>
                        <td>${subject.label || subject.name}</td>
                        <td>${subject.code || subject.id || "-"}</td>
                    </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        </div>
        `
            : ""
        }

        <div>
            <h3 class="section-title">Fee Breakdown</h3>
            <table class="fee-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th style="text-align: right;">Amount (₹)</th>
                    </tr>
                </thead>
                <tbody>
                    ${
                      feeBreakdown?.tuitionFee
                        ? `
                    <tr>
                        <td>Tuition Fee</td>
                        <td class="amount">${formatCurrency(feeBreakdown.tuitionFee)}</td>
                    </tr>
                    `
                        : ""
                    }
                    ${
                      feeBreakdown?.developmentFee
                        ? `
                    <tr>
                        <td>Development Fee</td>
                        <td class="amount">${formatCurrency(feeBreakdown.developmentFee)}</td>
                    </tr>
                    `
                        : ""
                    }
                    ${
                      feeBreakdown?.applicationFee
                        ? `
                    <tr>
                        <td>Application Fee</td>
                        <td class="amount">${formatCurrency(feeBreakdown.applicationFee)}</td>
                    </tr>
                    `
                        : ""
                    }
                    ${
                      feeBreakdown?.examinationFee
                        ? `
                    <tr>
                        <td>Examination Fee</td>
                        <td class="amount">${formatCurrency(feeBreakdown.examinationFee)}</td>
                    </tr>
                    `
                        : ""
                    }
                    ${
                      feeBreakdown?.latePaymentPenalty &&
                      feeBreakdown.latePaymentPenalty > 0
                        ? `
                    <tr>
                        <td>Late Payment Penalty</td>
                        <td class="amount">${formatCurrency(feeBreakdown.latePaymentPenalty)}</td>
                    </tr>
                    `
                        : ""
                    }
                    <tr class="total-row">
                        <td><strong>Total Amount Paid</strong></td>
                        <td class="amount"><strong>₹ ${formatCurrency(paymentSummary.amountPaid)}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div>
            <h3 class="section-title">Payment Summary</h3>
            <table class="summary-table">
                <tr>
                    <td style="width: 50%;">
                        ${paymentSummary.totalFeeAmount ? `<p class="detail-line"><strong>Total Fee Amount:</strong> ₹${formatCurrency(paymentSummary.totalFeeAmount)}</p>` : ""}
                        <p class="detail-line"><strong>Current Payment:</strong> ₹${formatCurrency(paymentSummary.amountPaid)}</p>
                    </td>
                    <td style="width: 50%; padding-left: 20px;">
                        ${paymentSummary.installmentNumber ? `<p class="detail-line"><strong>Installment Number:</strong> ${paymentSummary.installmentNumber}</p>` : ""}
                        <p class="detail-line"><strong>Payment Type:</strong> ${paymentSummary.isFullPayment ? "Full Payment" : "Installment"}</p>
                        ${paymentSummary.remainingBalance !== undefined && paymentSummary.remainingBalance > 0 ? `<p class="detail-line"><strong>Remaining Balance:</strong> ₹${formatCurrency(paymentSummary.remainingBalance)}</p>` : ""}
                    </td>
                </tr>
            </table>
        </div>

        <div class="footer">
            <table class="footer-table">
                <tr>
                    <td style="width: 70%; vertical-align: bottom;">
                        <p class="footer-notes">This is a computer-generated receipt and does not require a signature.</p>
                        <p class="footer-notes">For any queries, please contact the accounts department at ${institutionDetails.email || "asl@agnelschooloflaw.com"}.</p>
                        ${receiptType === "atkt" ? '<p class="footer-notes">For examination-related queries, contact the examination cell.</p>' : ""}
                    </td>
                    <td style="width: 30%;" class="seal-container">
                        ${collegeSealBase64 ? `<img src="${collegeSealBase64}" alt="College Seal" class="seal-image" />` : ""}
                        <p class="seal-label">Authorized Seal</p>
                    </td>
                </tr>
            </table>
        </div>
    </div>
</body>
</html>
`;
};

export default LegacyReceiptTemplate;
